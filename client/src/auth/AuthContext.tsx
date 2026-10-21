import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "../lib/api";
import type { ModuleKey } from "../config/modules";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  roles: string[];
}

interface AuthState {
  user: AuthUser | null;
  modules: ModuleKey[];
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [modules, setModules] = useState<ModuleKey[]>([]);
  const [loading, setLoading] = useState(true);

  const applySession = useCallback(
    (data: { user: AuthUser; modules: ModuleKey[] }) => {
      setUser(data.user);
      setModules(data.modules);
    },
    [],
  );

  // Attempt to restore a session on first load.
  useEffect(() => {
    let active = true;
    api
      .get<{ user: AuthUser; modules: ModuleKey[] }>("/auth/me")
      .then((res) => active && applySession(res.data))
      .catch(() => active && setUser(null))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [applySession]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.post<{ user: AuthUser; modules: ModuleKey[] }>(
        "/auth/login",
        { email, password },
      );
      applySession(res.data);
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    await api.post("/auth/logout");
    setUser(null);
    setModules([]);
  }, []);

  const value = useMemo(
    () => ({ user, modules, loading, login, logout }),
    [user, modules, loading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
