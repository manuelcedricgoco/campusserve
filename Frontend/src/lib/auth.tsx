import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';
import { configureApi } from './api';

const DEV_TOKEN_KEY = 'campusserve.devToken';

export const supabase: SupabaseClient | null = env.supabaseUrl && env.supabaseAnonKey
  ? createClient(env.supabaseUrl, env.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

interface AuthState {
  status: 'loading' | 'signed_out' | 'signed_in';
  session: Session | null;
  /** True when sign-in is not possible because Supabase is not configured for this build. */
  unavailable: boolean;
  signIn(email: string, password: string): Promise<void>;
  sendReset(email: string): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

function readDevToken(): string | null {
  if (!env.devAuth) return null;
  try { return localStorage.getItem(DEV_TOKEN_KEY); } catch { return null; }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthState['status']>('loading');

  useEffect(() => {
    if (readDevToken()) { setStatus('signed_in'); return; }
    if (!supabase) { setStatus('signed_out'); return; }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setStatus(data.session ? 'signed_in' : 'signed_out');
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setStatus(s ? 'signed_in' : 'signed_out');
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = useCallback(async () => {
    try { localStorage.removeItem(DEV_TOKEN_KEY); } catch { /* storage unavailable */ }
    if (supabase) await supabase.auth.signOut();
    setSession(null);
    setStatus('signed_out');
  }, []);

  useEffect(() => {
    configureApi({
      getToken: async () => readDevToken() ?? (supabase ? (await supabase.auth.getSession()).data.session?.access_token ?? null : null),
      onUnauthorized: () => { void signOut(); },
    });
  }, [signOut]);

  const value = useMemo<AuthState>(() => ({
    status,
    session,
    unavailable: !supabase && !env.devAuth,
    async signIn(email, password) {
      if (!supabase) throw new Error('Sign-in is not configured for this site yet.');
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message === 'Invalid login credentials' ? 'That email and password do not match an account.' : error.message);
    },
    async sendReset(email) {
      if (!supabase) throw new Error('Sign-in is not configured for this site yet.');
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/sign-in` });
      if (error) throw new Error(error.message);
    },
    signOut,
  }), [status, session, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
