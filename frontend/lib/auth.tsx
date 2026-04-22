"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";
import { apiFetch, getToken, setToken } from "./api";

interface MeResponse {
  email: string;
  session_id: string;
  phase: string;
}

interface AuthContextValue {
  user: MeResponse | null;
  loading: boolean;
  error: string | null;
  signup: (email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await apiFetch<MeResponse>("/auth/me");
      setUser(me);
    } catch {
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleAuth = useCallback(
    async (path: "/auth/signup" | "/auth/login", email: string, password: string) => {
      setError(null);
      try {
        const res = await apiFetch<{ token: string; session_id: string }>(path, {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
        setToken(res.token);
        await refresh();
      } catch (e) {
        const message = e instanceof Error ? e.message : "Auth failed";
        setError(message);
        throw e;
      }
    },
    [refresh],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      error,
      signup: (email, password) => handleAuth("/auth/signup", email, password),
      login: (email, password) => handleAuth("/auth/login", email, password),
      logout: async () => {
        try {
          await apiFetch("/auth/logout", { method: "POST" });
        } catch {
          /* ignore */
        }
        setToken(null);
        setUser(null);
      },
    }),
    [user, loading, error, handleAuth],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
