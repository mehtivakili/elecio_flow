import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getToken, setToken } from './api';
import {
  canWrite, type Module, type OptionDef, type Role, type StageDef, type WorkspaceSettings,
} from '@shared/defaults';

export interface User { id: string; username: string; fullName: string; role: Role; phone?: string; active?: number }
export interface Tag { id: string; name: string; color: string }
export interface Warehouse { id: string; code: string; name: string; kind: string; address?: string }

interface Meta {
  org: { id: string; name: string; slug: string };
  me: User;
  users: User[];
  tags: Tag[];
  warehouses: Warehouse[];
  settings: WorkspaceSettings;
}

interface Session extends Meta {
  can: (module: Module) => boolean;
  userName: (id?: string | null) => string;
  lifecycle: (key?: string | null) => StageDef | undefined;
  option: (list: OptionDef[], key?: string | null) => OptionDef | undefined;
  logout: () => void;
  refresh: () => void;
}

const SessionContext = createContext<Session | null>(null);
const AuthContext = createContext<{ token: string | null; login: (token: string) => void; logout: () => void }>({
  token: null, login: () => {}, logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTok] = useState(getToken);
  const qc = useQueryClient();
  const logout = useCallback(() => {
    setToken(null);
    setTok(null);
    qc.clear();
  }, [qc]);
  useEffect(() => {
    const onLogout = () => logout();
    window.addEventListener('elecio:logout', onLogout);
    return () => window.removeEventListener('elecio:logout', onLogout);
  }, [logout]);
  const login = useCallback((t: string) => { setToken(t); setTok(t); }, []);
  return <AuthContext.Provider value={{ token, login, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

export function SessionProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const { logout } = useAuth();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['meta'], queryFn: () => api<Meta>('/meta'), staleTime: 60_000 });

  const value = useMemo<Session | null>(() => {
    if (!data) return null;
    const users = Object.fromEntries(data.users.map((u) => [u.id, u]));
    return {
      ...data,
      can: (module) => canWrite(data.me.role, module),
      userName: (id) => (id && users[id]?.fullName) || '—',
      lifecycle: (key) => data.settings.lifecycleStages.find((s) => s.key === key),
      option: (list, key) => list.find((o) => o.key === key),
      logout,
      refresh: () => qc.invalidateQueries({ queryKey: ['meta'] }),
    };
  }, [data, logout, qc]);

  if (!value) return <>{fallback}</>;
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession outside SessionProvider');
  return ctx;
}
