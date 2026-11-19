import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { HandoverView, type HandoverData, type First72Item } from '@/components/HandoverView';
import { usePageTitle } from '@/lib/pageTitle';

export function PreviewHandover() {
  usePageTitle('Preview of the handover');
  const { session } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<HandoverData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!session) return;
      const { data: biz, error: bizError } = await supabase
        .from('businesses')
        .select('id, name, owner_name')
        .eq('owner_id', session.user.id)
        .maybeSingle();
      if (bizError || !biz) {
        navigate('/binder', { replace: true });
        return;
      }

      const [contactsRes, entriesRes] = await Promise.all([
        supabase
          .from('trusted_contacts')
          .select('name')
          .eq('business_id', biz.id)
          .maybeSingle(),
        supabase
          .from('binder_entries')
          .select('id, section, title, body, contact_name, contact_phone, contact_email, priority')
          .eq('business_id', biz.id)
          .order('priority', { ascending: false }),
      ]);

      setData({
        business_name: biz.name,
        owner_name: biz.owner_name ?? '',
        trusted_name: contactsRes.data?.name ?? '',
        entries: (entriesRes.data as HandoverData['entries']) ?? [],
        first72: buildPlainList((entriesRes.data ?? []) as HandoverData['entries']),
      });
      setLoading(false);
    };
    void load();
  }, [session, navigate]);

  // Ask the server to regenerate the AI list now and show it in the preview.
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      const { data: result, error } = await supabase.functions.invoke('generate-first-72', {
        body: { force: true },
      });
      const items = (result as { items?: unknown })?.items;
      if (error || !Array.isArray(items)) {
        setRefreshMsg('Could not refresh right now. Showing the plain list.');
      } else {
        setData((prev) =>
          prev
            ? { ...prev, first72: (items as First72Item[]).length > 0 ? (items as First72Item[]) : prev.first72 }
            : prev
        );
        setRefreshMsg(
          (items as First72Item[]).length > 0
            ? 'First 72 Hours refreshed.'
            : 'Nothing to summarize yet — add binder entries first.'
        );
      }
    } catch {
      setRefreshMsg('Could not refresh right now. Showing the plain list.');
    } finally {
      setRefreshing(false);
      window.setTimeout(() => setRefreshMsg(null), 4000);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <p className="text-muted">We could not load the preview. Please try again.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="max-w-2xl mx-auto px-5 pt-8">
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm font-semibold text-amber-800">
          Preview — this is what your trusted person will see when the binder opens. Nothing you
          do here changes any data.
        </div>
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={refreshing}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-brand-300 bg-white px-5 py-2.5 font-semibold text-brand-700 hover:bg-brand-50 transition-colors disabled:opacity-60"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Refreshing...' : 'Refresh First 72 Hours'}
          </button>
          {refreshMsg && <p className="text-sm text-muted">{refreshMsg}</p>}
        </div>
      </div>
      <HandoverView data={data} />
    </div>
  );
}

function buildPlainList(
  entries: HandoverData['entries']
): First72Item[] {
  const first72 = entries.filter((e) => e.section === 'first_72');
  const rest = entries.filter((e) => e.section !== 'first_72');
  return [...first72, ...rest].slice(0, 8).map((e) => ({
    action: e.title,
    why: e.body,
    contact_name: e.contact_name,
    contact_phone: e.contact_phone,
    contact_email: e.contact_email,
  }));
}
