import { ApiError, request } from "./api";

export interface UserProfile {
  id: string;
  email: string;
  name: string;
}

interface CsrfToken {
  token: string;
  headerName: "X-CSRF-TOKEN";
}

function isProfile(value: unknown): value is UserProfile {
  if (typeof value !== "object" || value === null) return false;
  const profile = value as Partial<UserProfile>;
  return (
    typeof profile.id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      profile.id,
    ) &&
    typeof profile.email === "string" &&
    profile.email.length > 0 &&
    profile.email.length <= 254 &&
    typeof profile.name === "string" &&
    profile.name.length > 0 &&
    [...profile.name].length <= 100
  );
}

function isCsrfToken(value: unknown): value is CsrfToken {
  if (typeof value !== "object" || value === null) return false;
  const csrf = value as Partial<CsrfToken>;
  return (
    typeof csrf.token === "string" &&
    csrf.token.length > 0 &&
    csrf.headerName === "X-CSRF-TOKEN"
  );
}

// One client per mounted application; session and CSRF data stay in memory.
export function createAuthApi() {
  let csrfToken: string | undefined;
  let csrfRequest: Promise<string> | undefined;

  function getCsrf(): Promise<string> {
    if (csrfToken) return Promise.resolve(csrfToken);
    if (!csrfRequest) {
      csrfRequest = request("/auth/csrf", isCsrfToken)
        .then(({ token }) => {
          csrfToken = token;
          return token;
        })
        .finally(() => {
          csrfRequest = undefined;
        });
    }
    return csrfRequest;
  }

  async function post<T = void>(
    path: string,
    body?: unknown,
    guard?: (value: unknown) => value is T,
  ): Promise<T> {
    const token = await getCsrf();
    const send = (csrf: string) =>
      request(path, guard, undefined, {
        method: "POST",
        body,
        csrfToken: csrf,
      });
    try {
      return await send(token);
    } catch (error) {
      if (
        !(error instanceof ApiError) ||
        error.status !== 403 ||
        error.code !== "CSRF_INVALID"
      )
        throw error;
      if (csrfToken === token) csrfToken = undefined;
      return send(await getCsrf());
    }
  }

  async function rotateCsrf() {
    csrfToken = undefined;
    try {
      await getCsrf();
    } catch {
      // Login/logout already succeeded. The next POST retries obtaining CSRF.
    }
  }

  return {
    me: (signal?: AbortSignal) => request("/users/me", isProfile, signal),
    register: (body: { name: string; email: string; password: string }) =>
      post("/auth/register", body),
    resendVerification: (email: string) =>
      post("/auth/resend-verification", { email }),
    verifyEmail: (token: string) => post("/auth/verify-email", { token }),
    forgotPassword: (email: string) => post("/auth/forgot-password", { email }),
    resetPassword: async (token: string, newPassword: string) => {
      await post("/auth/reset-password", { token, newPassword });
      csrfToken = undefined;
    },
    login: async (body: { email: string; password: string }) => {
      const user = await post("/auth/login", body, isProfile);
      await rotateCsrf();
      return user;
    },
    logout: async () => {
      await post("/auth/logout");
      await rotateCsrf();
    },
  };
}

export type AuthApi = ReturnType<typeof createAuthApi>;
