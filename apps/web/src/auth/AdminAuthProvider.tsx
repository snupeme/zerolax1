import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  api,
  clearStoredAdminSession,
  getStoredAdminSession,
  onAdminSessionExpired,
  setStoredAdminSession,
  type AdminSession,
} from '../lib/api';

interface AdminAuthContextValue {
  session: AdminSession | null;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const clearPrivateCache = useCallback(() => { void queryClient.cancelQueries(); queryClient.clear(); }, [queryClient]);
  const [session, setSession] = useState<AdminSession | null>(() => getStoredAdminSession());

  useEffect(() => {
    const unsubscribe = onAdminSessionExpired(() => { clearPrivateCache(); setSession(null); });
    return unsubscribe;
  }, [clearPrivateCache]);

  const signIn = useCallback(async (email: string, password: string) => {
    const next = await api.admin.login(email, password);
    clearPrivateCache();
    setStoredAdminSession(next);
    setSession(next);
  }, [clearPrivateCache]);

  const signOut = useCallback(() => {
    clearPrivateCache();
    clearStoredAdminSession();
    setSession(null);
  }, [clearPrivateCache]);

  const value = useMemo<AdminAuthContextValue>(
    () => ({ session, isAuthenticated: Boolean(session), signIn, signOut }),
    [session, signIn, signOut],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): AdminAuthContextValue {
  const context = useContext(AdminAuthContext);
  if (!context) throw new Error('useAdminAuth must be used inside AdminAuthProvider');
  return context;
}
