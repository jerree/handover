import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase, SECTIONS } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useActivityTracking } from '@/lib/activity';
import { usePageTitle } from '@/lib/pageTitle';
import type { BinderEntry, Business } from '@/lib/supabase';

interface TrustedRow {
  name: string;
  relationship: string;
}

interface SafetyRow {
  status: string;
  quiet_days: number;
  last_activity_at: string | null;
  paused_until: string | null;
}

interface ChannelRow {
  type: string;
  verified: boolean;
  enabled: boolean | null;
}

const MORE_SECTIONS = ['people', 'money', 'routines', 'locations', 'promises', 'templates'] as const;

const SECTION_TITLES: Record<string, string> = {
  people: 'People',
  money: 'Money',
  routines: 'How things run',
  locations: 'Where things are',
  promises: 'Customer promises',
  templates: 'Message templates',
};

const SECTION_BLURBS: Record<string, string> = {
  people: 'Who matters in and around the business, and how to reach them.',
  money: 'Where money comes in, what goes out, and what needs paying.',
  routines: 'The daily, weekly and monthly rhythm that keeps things going.',
  locations: 'Keys, stock, equipment, documents, and who can get to them.',
  promises: 'Commitments made to customers that someone else should keep.',
  templates: 'Ready-to-send words for when you can\u2019t write them yourself.',
};

function relativeTime(iso: string): string {
  const diffDays = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (diffDays <= 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  return `${diffDays} days ago`;
}

function latestUpdated(rows: BinderEntry[]): string | null {
  if (rows.length === 0) return null;
  return rows.reduce((max, e) => (e.updated_at > max ? e.updated_at : max), rows[0].updated_at);
}

function excerpt(text: string, max = 90): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).trimEnd()}\u2026`;
}

function TileSkeleton() {
  return (
    <div className="sh-tile" style={{ background: '#fff', border: '1px solid #EADBC9' }}>
      <div className="sh-skel" style={{ height: 12, width: '40%' }} />
      <div className="sh-skel" style={{ height: 40, width: '70%', marginTop: 16 }} />
      <div className="sh-skel" style={{ height: 14, width: '90%', marginTop: 12 }} />
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="sh-skel" style={{ height: 60, width: '40%', marginTop: 40 }} />
      <div className="sh-g" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginTop: 40 }}>
        <TileSkeleton />
        <TileSkeleton />
        <TileSkeleton />
      </div>
      <div className="sh-c sh-feat" style={{ marginTop: 20 }}>
        <div className="sh-skel" style={{ height: 44, width: '60%' }} />
        <div className="sh-skel" style={{ height: 120, width: '100%' }} />
      </div>
      <div className="sh-cards" style={{ marginTop: 48 }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="sh-c">
            <div className="sh-skel" style={{ height: 44, width: 60 }} />
            <div className="sh-skel" style={{ height: 26, width: '50%', marginTop: 12 }} />
            <div className="sh-skel" style={{ height: 14, width: '90%', marginTop: 10 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function BinderDashboard() {
  usePageTitle('Your binder');
  const { session } = useAuth();
  const navigate = useNavigate();
  const [business, setBusiness] = useState<Business | null>(null);
  const [entries, setEntries] = useState<BinderEntry[]>([]);
  const [trusted, setTrusted] = useState<TrustedRow | null>(null);
  const [safety, setSafety] = useState<SafetyRow | null>(null);
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  useActivityTracking({ businessId: business?.id ?? null, kind: 'view' });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!session) return;
      setLoading(true);
      setFailed(false);
      const { data: biz, error: bizError } = await supabase
        .from('businesses')
        .select('*')
        .eq('owner_id', session.user.id)
        .maybeSingle();

      if (cancelled) return;
      if (bizError) {
        setFailed(true);
        setLoading(false);
        return;
      }
      if (!biz) {
        navigate('/onboarding', { replace: true });
        return;
      }
      setBusiness(biz as Business);

      const [entriesRes, trustedRes, safetyRes, channelsRes] = await Promise.all([
        supabase.from('binder_entries').select('*').eq('business_id', biz.id),
        supabase
          .from('trusted_contacts')
          .select('name, relationship')
          .eq('business_id', biz.id)
          .maybeSingle(),
        supabase
          .from('safety_settings')
          .select('status, quiet_days, last_activity_at, paused_until')
          .eq('business_id', biz.id)
          .maybeSingle(),
        supabase
          .from('notification_channels')
          .select('type, verified, enabled')
          .eq('business_id', biz.id),
      ]);
      if (cancelled) return;
      setEntries((entriesRes.data ?? []) as BinderEntry[]);
      setTrusted((trustedRes.data as TrustedRow | null) ?? null);
      setSafety((safetyRes.data as SafetyRow | null) ?? null);
      setChannels((channelsRes.data ?? []) as ChannelRow[]);
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [session, navigate, reloadKey]);

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (failed) {
    return (
      <div>
        <p style={{ color: '#5A4638', fontSize: 17 }}>
          We could not load your binder right now. Please try again.
        </p>
        <button type="button" className="sh-btn" style={{ marginTop: 16 }} onClick={() => setReloadKey((k) => k + 1)}>
          Retry
        </button>
      </div>
    );
  }

  if (!business) {
    return (
      <div>
        <p style={{ color: '#5A4638', fontSize: 17 }}>
          We could not load your business. Please try signing in again.
        </p>
      </div>
    );
  }

  const counts: Record<string, number> = {};
  for (const e of entries) {
    counts[e.section] = (counts[e.section] ?? 0) + 1;
  }
  const totalEntries = entries.length;
  const filledSections = SECTIONS.filter((s) => (counts[s.id] ?? 0) > 0).length;
  const firstEmpty = SECTIONS.find((s) => (counts[s.id] ?? 0) === 0);

  const first72 = entries.filter((e) => e.section === 'first_72');
  const topFirst72 = [...first72]
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    .slice(0, 2);
  const first72Count = first72.length;
  const first72Updated = latestUpdated(first72);

  const hasTrusted = trusted !== null;
  const hasChannel = channels.some((c) => c.verified && c.enabled !== false);
  const paused = safety?.paused_until != null && new Date(safety.paused_until) > new Date();
  const status = safety?.status ?? 'active';

  let tile3Head = 'Active';
  let tile3Dot = '#2F7D4F';
  let tile3Reason = '';
  if (paused) {
    tile3Head = 'Paused';
    tile3Dot = '#9CA3AF';
  } else if (!hasTrusted || !hasChannel) {
    tile3Head = 'Not on yet';
    tile3Dot = '#9CA3AF';
    tile3Reason = !hasTrusted
      ? 'Add a trusted person to switch it on. '
      : 'Verify a reminder channel to switch it on. ';
  } else if (status === 'reminding') {
    tile3Head = 'Reminding';
    tile3Dot = '#F59E0B';
  } else if (status === 'handover_triggered') {
    tile3Head = 'Handover opened';
    tile3Dot = '#2A1A12';
  }

  const lastSeen = safety?.last_activity_at ? relativeTime(safety.last_activity_at) : 'never';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div className="sh-eye">Your binder</div>
          <h1 className="s" style={{ fontSize: 60, margin: '10px 0 8px' }}>{business.name}</h1>
          <p style={{ margin: 0, color: '#5A4638', fontSize: 18 }}>
            Everything your trusted person would need, in one place.
          </p>
        </div>
        <Link to="/interview" className="sh-btn">Start guided interview</Link>
      </div>

      <section className="sh-g" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginTop: 40 }}>
        <div className="sh-tile" style={{ background: '#2A1A12', color: '#FBF5EE' }}>
          <div className="sh-eye" style={{ color: '#F4A261' }}>Binder</div>
          <div className="s" style={{ fontSize: 64, margin: '12px 0 6px' }}>
            {filledSections} <span style={{ fontSize: 28, color: '#D9C7B5' }}>of 7 sections</span>
          </div>
          <p style={{ margin: 0, color: '#D9C7B5' }}>
            {totalEntries} {totalEntries === 1 ? 'entry' : 'entries'} in total.{' '}
            {filledSections === 7 ? 'Nothing missing.' : `Next: add ${firstEmpty?.title ?? 'a section'}.`}
          </p>
        </div>
        <div className="sh-tile" style={{ background: '#fff', border: '1px solid #EADBC9' }}>
          <div className="sh-eye">Trusted person</div>
          {hasTrusted && trusted ? (
            <>
              <div className="s" style={{ fontSize: 40, margin: '12px 0 6px' }}>{trusted.name}</div>
              <p style={{ margin: 0, color: '#5A4638' }}>
                {trusted.relationship} &middot; gets access only if you stop responding.{' '}
                <Link to="/trusted" style={{ fontWeight: 700 }}>Change</Link>
              </p>
            </>
          ) : (
            <>
              <div className="s" style={{ fontSize: 40, margin: '12px 0 6px' }}>Not set up yet</div>
              <p style={{ margin: 0, color: '#5A4638' }}>
                Choose someone who should get a plan if you can&rsquo;t be reached.{' '}
                <Link to="/trusted" style={{ fontWeight: 700 }}>Add trusted person</Link>
              </p>
            </>
          )}
        </div>
        <div className="sh-tile" style={{ background: '#F6E4D0' }}>
          <div className="sh-eye">Safety watch</div>
          <div className="s" style={{ fontSize: 40, margin: '12px 0 6px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 14, height: 14, borderRadius: '50%', background: tile3Dot, display: 'inline-block', flexShrink: 0 }} />
            {tile3Head}
          </div>
          <p style={{ margin: 0, color: '#5A4638' }}>
            {tile3Reason}
            Last seen {lastSeen}. First reminder after {safety?.quiet_days ?? 7} quiet days.{' '}
            <Link to="/safety" style={{ fontWeight: 700 }}>Timing</Link>
          </p>
        </div>
      </section>

      <section className="sh-c sh-feat">
        <div className="sh-feat-col">
          <span className="sh-eye">Most important section</span>
          <h2 className="s" style={{ fontSize: 44, margin: 0 }}>First 72 Hours</h2>
          <p style={{ fontSize: 17, margin: 0 }}>
            What to do in the first three days if you suddenly can&rsquo;t be reached. This is the first page your trusted person sees.
          </p>
          <div style={{ marginTop: 'auto', paddingTop: 18, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <Link to="/binder/first_72" className="sh-btn">Open section</Link>
            {first72Count > 0 && first72Updated && (
              <span style={{ color: '#6B5545' }}>
                {first72Count} {first72Count === 1 ? 'entry' : 'entries'} &middot; updated {relativeTime(first72Updated)}
              </span>
            )}
          </div>
        </div>
        <div className="sh-feat-list">
          {topFirst72.length > 0 ? (
            topFirst72.map((e, i) => (
              <div key={e.id} className="sh-feat-item">
                <b>{i + 1}. {e.title}</b>
                <div style={{ color: '#5A4638', fontSize: 14, marginTop: 4 }}>
                  {excerpt(e.body || e.title)}
                </div>
              </div>
            ))
          ) : (
            <div className="sh-feat-item">
              <div>Nothing here yet. Add the three things that would go wrong first.</div>
              <div style={{ marginTop: 12 }}>
                <Link to="/binder/first_72" className="sh-btn" style={{ minHeight: 44, padding: '0 18px' }}>
                  Add an entry
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>

      <h2 className="s" style={{ fontSize: 32, margin: '48px 0 20px' }}>More sections</h2>
      <section className="sh-cards">
        {MORE_SECTIONS.map((id) => {
          const sectionEntries = entries.filter((e) => e.section === id);
          const count = sectionEntries.length;
          const updated = latestUpdated(sectionEntries);
          return (
            <Link key={id} to={`/binder/${id}`} className="sh-c sh-cardlink">
              <span className="s" style={{ fontSize: 52, color: count > 0 ? '#D9480F' : '#C9B8A6' }}>{count}</span>
              <h3 className="s" style={{ fontSize: 26, margin: 0 }}>{SECTION_TITLES[id]}</h3>
              <p>{SECTION_BLURBS[id]}</p>
              <div className="sh-ft">
                <span>{updated ? `Updated ${relativeTime(updated)}` : 'No entries yet'}</span>
                <b style={{ color: '#D9480F' }}>Open &rarr;</b>
              </div>
            </Link>
          );
        })}
      </section>

      <p className="sh-legal">
        Handover is a practical guide and does not replace a will, power of attorney, or legal advice.
      </p>
    </div>
  );
}
