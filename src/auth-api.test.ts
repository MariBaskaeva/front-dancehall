import { afterEach, describe, expect, it, vi } from "vitest";
import { createAuthApi } from "./auth-api";
import { retryAfterSeconds } from "./api";
import { authError, csrf, guest, password, user } from "./test/auth-fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("auth HTTP client", () => {
  it.each([202, 204])("does not parse an empty %s response", async (status) => {
    const response = new Response(null, { status });
    const parse = vi.spyOn(response, "json");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(csrf())
      .mockResolvedValueOnce(response);
    vi.stubGlobal("fetch", fetchMock);
    const api = createAuthApi();
    await (status === 202
      ? api.register({ name: user.name, email: user.email, password })
      : api.verifyEmail("link-token"));
    expect(parse).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[0]).toEqual([
      "/api/v1/auth/csrf",
      expect.objectContaining({ credentials: "include", cache: "no-store" }),
    ]);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: "POST",
      credentials: "include",
      headers: {
        "X-CSRF-TOKEN": "csrf-token",
        "Content-Type": "application/json",
      },
    });
  });

  it("shares CSRF acquisition between concurrent first POSTs", async () => {
    const fetchMock = vi.fn((path: string) =>
      Promise.resolve(
        path.endsWith("/csrf") ? csrf() : new Response(null, { status: 202 }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const api = createAuthApi();
    await Promise.all([
      api.forgotPassword(user.email),
      api.resendVerification(user.email),
    ]);
    expect(
      fetchMock.mock.calls.filter(([path]) => path.endsWith("/csrf")),
    ).toHaveLength(1);
  });

  it("refreshes CSRF and retries the same body once", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(csrf("old"))
      .mockResolvedValueOnce(authError("CSRF_INVALID", 403))
      .mockResolvedValueOnce(csrf("fresh"))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await createAuthApi().resetPassword("reset-token", password);
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      "/api/v1/auth/csrf",
      "/api/v1/auth/reset-password",
      "/api/v1/auth/csrf",
      "/api/v1/auth/reset-password",
    ]);
    expect(fetchMock.mock.calls[1][1].body).toBe(
      fetchMock.mock.calls[3][1].body,
    );
    expect(fetchMock.mock.calls[3][1].headers["X-CSRF-TOKEN"]).toBe("fresh");
    expect(JSON.parse(fetchMock.mock.calls[3][1].body)).toEqual({
      token: "reset-token",
      newPassword: password,
    });
  });

  it("stops after a second CSRF error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(csrf())
      .mockResolvedValueOnce(authError("CSRF_INVALID", 403))
      .mockResolvedValueOnce(csrf("second"))
      .mockResolvedValueOnce(authError("CSRF_INVALID", 403));
    vi.stubGlobal("fetch", fetchMock);
    await expect(createAuthApi().verifyEmail("token")).rejects.toMatchObject({
      status: 403,
      code: "CSRF_INVALID",
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("does not retry credentials, unverified email or network errors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(csrf())
      .mockResolvedValueOnce(authError("INVALID_CREDENTIALS", 401))
      .mockResolvedValueOnce(authError("EMAIL_NOT_VERIFIED", 403))
      .mockRejectedValueOnce(new TypeError("offline"));
    vi.stubGlobal("fetch", fetchMock);
    const api = createAuthApi();
    await expect(
      api.login({ email: user.email, password }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    await expect(
      api.login({ email: user.email, password }),
    ).rejects.toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
    await expect(
      api.login({ email: user.email, password }),
    ).rejects.toMatchObject({ kind: "network" });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("rotates CSRF after login and logout", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(csrf("anonymous"))
      .mockResolvedValueOnce(Response.json(user))
      .mockResolvedValueOnce(csrf("signed-in"))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(csrf("signed-out"))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    const api = createAuthApi();
    await expect(api.login({ email: user.email, password })).resolves.toEqual(
      user,
    );
    await api.logout();
    await api.forgotPassword(user.email);
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      "/api/v1/auth/csrf",
      "/api/v1/auth/login",
      "/api/v1/auth/csrf",
      "/api/v1/auth/logout",
      "/api/v1/auth/csrf",
      "/api/v1/auth/forgot-password",
    ]);
    expect(fetchMock.mock.calls[3][1].headers["X-CSRF-TOKEN"]).toBe(
      "signed-in",
    );
    expect(fetchMock.mock.calls[5][1].headers["X-CSRF-TOKEN"]).toBe(
      "signed-out",
    );
  });

  it("preserves completed login when CSRF refresh fails and obtains it before the next POST", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(csrf())
      .mockResolvedValueOnce(Response.json(user))
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(csrf("recovered"))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    const api = createAuthApi();
    await expect(api.login({ email: user.email, password })).resolves.toEqual(
      user,
    );
    await api.forgotPassword(user.email);
    expect(fetchMock.mock.calls[4][1].headers["X-CSRF-TOKEN"]).toBe(
      "recovered",
    );
  });

  it("retains the Retry-After delay from a rate limit", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(csrf())
        .mockResolvedValueOnce(authError("TOO_MANY_REQUESTS", 429, "90")),
    );
    await expect(
      createAuthApi().forgotPassword(user.email),
    ).rejects.toMatchObject({
      status: 429,
      code: "TOO_MANY_REQUESTS",
      retryAfter: 90,
    });
    expect(retryAfterSeconds("garbage")).toBeUndefined();
    expect(retryAfterSeconds(null)).toBeUndefined();
    expect(retryAfterSeconds("0")).toBeUndefined();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
    expect(retryAfterSeconds("Fri, 02 Oct 2026 12:02:00 GMT")).toBe(120);
  });

  it("distinguishes a guest from a malformed profile", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(guest())
        .mockResolvedValueOnce(Response.json({ email: user.email })),
    );
    const api = createAuthApi();
    await expect(api.me()).rejects.toMatchObject({ status: 401 });
    await expect(api.me()).rejects.toMatchObject({ kind: "invalid" });
  });

  it("retries CSRF acquisition after a network failure without sending a POST", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(csrf())
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    const api = createAuthApi();
    await expect(api.forgotPassword(user.email)).rejects.toMatchObject({
      kind: "network",
    });
    await api.forgotPassword(user.email);
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      "/api/v1/auth/csrf",
      "/api/v1/auth/csrf",
      "/api/v1/auth/forgot-password",
    ]);
  });
});
