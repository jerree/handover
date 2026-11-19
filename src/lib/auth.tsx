import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { supabase } from './supabase';
import type { Session } from '@supabase/supabase-js';

interface AuthState {
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  session: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const lastLoginRef = useRef<string | null>(null);
  const signedOutRef = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'SIGNED_IN') signedOutRef.current = false;
      if (event === 'SIGNED_OUT') signedOutRef.current = true;
      setSession(nextSession);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  // When the tab was hidden, the token renewal can silently fail and fire a
  // signed-out event even though the session is still in storage. Re-read it
  // when the user returns so they are not bounced to the login screen.
  useEffect(() => {
    const recover = () => {
      if (signedOutRef.current) return;
      void supabase.auth.getSession().then(({ data }) => {
        if (data.session) setSession(data.session);
      });
    };
    const onVisible = () => {
      if (!document.hidden) recover();
    };
    window.addEventListener('focus', recover);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', recover);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // Record a login activity event once per session load.
  useEffect(() => {
    if (!session?.user.id || lastLoginRef.current === session.user.id) return;
    lastLoginRef.current = session.user.id;
    void (async () => {
      const { data: biz } = await supabase
        .from('businesses')
        .select('id')
        .eq('owner_id', session.user.id)
        .maybeSingle();
      if (!biz) return;
      await supabase.rpc('record_activity', { p_business_id: biz.id, p_kind: 'login' });
    })();
  }, [session]);

  const signOut = async () => {
    signedOutRef.current = true;
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch {
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch {
        // Clearing local state below still signs the user out of this device.
      }
    }
    setSession(null);
    setLoading(false);
  };


  return (
    <AuthContext.Provider value={{ session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
