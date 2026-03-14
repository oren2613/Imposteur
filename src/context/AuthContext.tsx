/**
 * Contexte d'authentification : utilisateur connecté, login, signup, logout.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import * as authApi from '../api/auth';
import type { User } from '../api/auth';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
  getToken: () => string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authApi.fetchMe().then((u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const { token, user: u } = await authApi.login(username, password);
    authApi.setToken(token);
    setUser(u);
  }, []);

  const register = useCallback(async (username: string, password: string) => {
    const { token, user: u } = await authApi.register(username, password);
    authApi.setToken(token);
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    authApi.clearToken();
    setUser(null);
  }, []);

  const getToken = useCallback(() => authApi.getToken(), []);

  const value: AuthContextValue = {
    user,
    loading,
    login,
    register,
    logout,
    getToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
