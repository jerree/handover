import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';

export interface SafetyStatus {
  status: string;
  last_activity_at: string | null;
  paused_until: string | null;
}

interface ActivityOptions {
  businessId: string | null;
  kind: 'login' | 'edit' | 'view';
}

export function useSafetySettings() {
  const { session } = useAuth();
  const [safety, setSafety] = useState<SafetyStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!session) return;
      const { data: biz } = await supabase
        .from('businesses')
        .select('id')
        .eq('owner_id', session.user.id)
        .maybeSingle();
      if (!biz) {
        setLoading(false);
        return;
      }

      // Ensure a settings row exists, then read it.
      const { error: upsertError } = await supabase
        .from('safety_settings')
        .upsert({ business_id: biz.id, last_activity_at: new Date().toISOString() });
      if (upsertError) {
        setLoading(false);
        return;
      }
      const { data: settings } = await supabase
        .from('safety_settings')
        .select('status, last_activity_at, paused_until')
        .eq('business_id', biz.id)
        .maybeSingle();
      setSafety((settings as SafetyStatus) ?? null);
      setLoading(false);
    };
    void load();
  }, [session]);

  return { safety, loading };
}

// Tracks owner activity: at most one call every 5 minutes, enforced both here and in
// the server function. Fires when the owning component mounts (view/login) and can be
// called again for edits.
export function useActivityTracking({ businessId, kind }: ActivityOptions) {
  const firedAtRef = useRef<number>(0);

  const track = useCallback(
    (trackKind: 'login' | 'edit' | 'view' = kind) => {
      if (!businessId) return;
      if (Date.now() - firedAtRef.current < 5 * 60 * 1000) return;
      firedAtRef.current = Date.now();
      void supabase.rpc('record_activity', {
        p_business_id: businessId,
        p_kind: trackKind,
      });
    },
    [businessId, kind]
  );

  useEffect(() => {
    track();
  }, [track]);

  return { track };
}
