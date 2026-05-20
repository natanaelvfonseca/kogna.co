import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { authApi } from "@/services/api/authApi";
import {
  clearStoredAuth,
  getStoredToken,
  getStoredUser,
  isTokenExpired,
  setStoredToken,
  setStoredUser,
} from "@/services/api/authStorage";
import type { ApiUser } from "@/types/api";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthContextValue = {
  status: AuthStatus;
  user: ApiUser | null;
  token: string | null;
  error: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function getInitialAuthState() {
  const storedToken = getStoredToken();

  if (!storedToken || isTokenExpired(storedToken)) {
    clearStoredAuth();
    return {
      status: "unauthenticated" as AuthStatus,
      token: null,
      user: null,
    };
  }

  return {
    status: "loading" as AuthStatus,
    token: storedToken,
    user: getStoredUser<ApiUser>(),
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [initialAuth] = useState(getInitialAuthState);
  const [token, setToken] = useState<string | null>(initialAuth.token);
  const [user, setUser] = useState<ApiUser | null>(initialAuth.user);
  const [status, setStatus] = useState<AuthStatus>(initialAuth.status);
  const [error, setError] = useState<string | null>(null);
  const didInitialRefresh = useRef(false);

  const logout = useCallback(() => {
    clearStoredAuth();
    setToken(null);
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  const refreshUser = useCallback(async () => {
    const currentToken = getStoredToken();
    if (!currentToken || isTokenExpired(currentToken)) {
      logout();
      return;
    }

    setStatus("loading");
    try {
      const response = await authApi.me();
      setUser(response.user);
      setStoredUser(response.user);
      setToken(currentToken);
      setStatus("authenticated");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível validar sua sessão.");
      logout();
    }
  }, [logout]);

  const login = useCallback(async (email: string, password: string) => {
    setStatus("loading");
    setError(null);

    try {
      const response = await authApi.login(email, password);
      setStoredToken(response.token);
      setStoredUser(response.user);
      setToken(response.token);
      setUser(response.user);
      setStatus("authenticated");
    } catch (err) {
      clearStoredAuth();
      setToken(null);
      setUser(null);
      setStatus("unauthenticated");
      setError(err instanceof Error ? err.message : "Não foi possível entrar.");
      throw err;
    }
  }, []);

  useEffect(() => {
    if (didInitialRefresh.current) return;
    didInitialRefresh.current = true;
    void refreshUser();
  }, [refreshUser]);

  useEffect(() => {
    window.addEventListener("kogna:unauthorized", logout);
    return () => window.removeEventListener("kogna:unauthorized", logout);
  }, [logout]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      token,
      error,
      isAuthenticated: status === "authenticated" && Boolean(token),
      login,
      logout,
      refreshUser,
    }),
    [error, login, logout, refreshUser, status, token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return context;
}
