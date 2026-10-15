import { createContext, useContext } from "react";
import type { ApiError } from "./api";
import type { AuthApi, UserProfile } from "./auth-api";

export type Session =
  | { status: "loading" | "guest" }
  | { status: "authenticated"; user: UserProfile }
  | { status: "error"; error: ApiError };

interface AuthContextValue {
  session: Session;
  api: AuthApi;
  checkSession: (signal?: AbortSignal) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearSession: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("AuthProvider is required");
  return context;
}
