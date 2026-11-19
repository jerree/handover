import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { DEMO_MODE } from '@/lib/demo';

export interface HandoverBannerInfo {
  trustedName: string;
  triggeredAt: string;
}

// Shows the "Are you back?" banner while safety_settings.status is
// 'handover_triggered'. Closing sets status active, reminders 0, activity now.
export function useHandoverBanner() {
  const { session } = useAuth();
  const [banner, setBanner] = useState<HandoverBannerInfo | null>(null);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    setReady(true);
    const { data: biz } = await supabase
      .from('businesses')
      .select('id')
      .eq('owner_id', session.user.id)
      .maybeSingle();
    if (!biz) return;
    setBusinessId(biz.id);
    const { data: settings } = await supabase
      .from('safety_settings')
      .select('status')
      .eq('business_id', biz.id)
      .maybeSingle();
    if (settings?.status !== 'handover_triggered') {
      setBanner(null);
      return;
    }
    const { data: contact } = await supabase
      .from('trusted_contacts')
      .select('name')
      .eq('business_id', biz.id)
      .maybeSingle();
    const { data: event } = await supabase
      .from('handover_events')
      .select('triggered_at, accessed_at')
      .eq('business_id', biz.id)
      .order('triggered_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setBanner({
      trustedName: contact?.name ?? 'your trusted person',
      triggeredAt: event?.accessed_at ?? event?.triggered_at ?? new Date().toISOString(),
    });
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  const closeHandover = useCallback(async () => {
    if (!businessId) return;
    setBusy(true);
    await supabase
      .from('safety_settings')
      .update({
        status: 'active',
        reminders_sent: 0,
        last_activity_at: new Date().toISOString(),
      })
      .eq('business_id', businessId);
    setBanner(null);
    setBusy(false);
  }, [businessId]);

  return { banner, closeHandover, busy, ready, refresh: load };
}

export function HandoverBanner({
  banner,
  onClose,
  busy,
}: {
  banner: HandoverBannerInfo;
  onClose: () => void;
  busy: boolean;
}) {
  const date = new Date(banner.triggeredAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  return (
    <div className="bg-amber-50 border-b border-amber-200">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
        <p className="flex-1 text-sm font-medium text-amber-900">
          Your binder was opened for {banner.trustedName} on {date}. Are you back?
        </p>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="shrink-0 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 transition-colors disabled:opacity-60"
        >
          I'm back, close the handover
        </button>
      </div>
    </div>
  );
}

// Mounted once in App for signed-in owners. On shell pages the banner is
// rendered inside the shell's main area by AppShell; elsewhere it renders as a
// full-width strip above the page. Re-checks on every route change.
export function HandoverBannerGate() {
  const { session } = useAuth();
  const { banner, closeHandover, busy, refresh } = useHandoverBanner();
  const location = useLocation();

  useEffect(() => {
    if (session) void refresh();
  }, [session, location.pathname, refresh]);

  // The handover page is what the trusted person sees; never show owner UI there.
  if (location.pathname.startsWith('/handover/')) return null;
  if (location.pathname.startsWith('/c/')) return null;
  if (
    location.pathname === '/login' ||
    location.pathname === '/signup' ||
    location.pathname === '/onboarding' ||
    location.pathname === '/forgot-password' ||
    location.pathname === '/reset-password'
  )
    return null;
  if (!session || !banner) return null;

  const inShell =
    location.pathname.startsWith('/binder') ||
    location.pathname === '/interview' ||
    location.pathname === '/trusted' ||
    location.pathname === '/safety' ||
    location.pathname === '/account' ||
    (DEMO_MODE && location.pathname === '/demo-controls');

  if (inShell) return null;

  return (
    <HandoverBanner banner={banner} onClose={() => void closeHandover()} busy={busy} />
  );
}