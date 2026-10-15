import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  startTransition,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router";
import { ApiError } from "./api";
import { createAuthApi } from "./auth-api";
import { AuthContext, type Session } from "./auth-context";

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [api] = useState(createAuthApi);
  const [session, setSession] = useState<Session>({ status: "loading" });
  const revision = useRef(0);
  const navigate = useNavigate();

  const checkSession = useCallback(
    async (signal?: AbortSignal) => {
      const current = ++revision.current;
      setSession({ status: "loading" });
      try {
        const user = await api.me(signal);
        if (!signal?.aborted && current === revision.current)
          setSession({ status: "authenticated", user });
      } catch (error) {
        if (signal?.aborted || current !== revision.current) return;
        if (error instanceof ApiError && error.status === 401)
          setSession({ status: "guest" });
        else
          setSession({
            status: "error",
            error: error instanceof ApiError ? error : new ApiError("network"),
          });
      }
    },
    [api],
  );

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void checkSession(controller.signal);
    });
    return () => controller.abort();
  }, [checkSession]);

  const clearSession = useCallback(() => {
    revision.current += 1;
    setSession({ status: "guest" });
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const user = await api.login({ email, password });
      revision.current += 1;
      setSession({ status: "authenticated", user });
    },
    [api],
  );

  const logout = useCallback(async () => {
    await api.logout();
    startTransition(() => {
      clearSession();
      void navigate("/", { replace: true });
    });
  }, [api, clearSession, navigate]);

  const value = useMemo(
    () => ({ session, api, checkSession, login, logout, clearSession }),
    [session, api, checkSession, login, logout, clearSession],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
