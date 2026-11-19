import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { DEMO_MODE, SAMPLE_BUSINESS, SAMPLE_TRUSTED, SAMPLE_ENTRIES } from '@/lib/demo';
import { usePageTitle } from '@/lib/pageTitle';

interface SettingsRow {
  status: string;
  quiet_days: number;
  reminder_count: number;
  reminder_gap_hours: number;
  final_wait_hours: number;
  reminders_sent: number;
  last_activity_at: string | null;
  last_reminder_at: string | null;
  paused_until: string | null;
}

interface EscRow {
  id: string;
  step: string;
  channel: string;
  sent_at: string | null;
  success: boolean | null;
  error: string | null;
}

interface ContactRow {
  name: string;
  email: string;
  access_token: string;
}

function fmtDateTime(value: string | Date): string {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function channelLabel(channel: string): string {
  if (channel === 'email') return 'Email';
  if (channel === 'telegram') return 'Telegram';
  return channel.charAt(0).toUpperCase() + channel.slice(1);
}

type ConfirmKind = 'reset' | 'loadSample' | 'removeSample' | null;

export function DemoControls() {
  usePageTitle('Demo controls');
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [contact, setContact] = useState<ContactRow | null>(null);
  const [logRows, setLogRows] = useState<EscRow[]>([]);
  const [emailVerified, setEmailVerified] = useState(false);
  const [tgVerified, setTgVerified] = useState(false);
  const [loadMsg, setLoadMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [ladderMsg, setLadderMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmKind>(null);
  const [pretendDays, setPretendDays] = useState('4');
  const [pretendHours, setPretendHours] = useState('13');
  const playTimer = useRef<number | null>(null);

  const refresh = useCallback(async (): Promise<SettingsRow | null> => {
    if (!session) return null;
    const { data: biz } = await supabase
      .from('businesses')
      .select('id')
      .eq('owner_id', session.user.id)
      .maybeSingle();
    if (!biz) {
      setLoading(false);
      return null;
    }
    setBusinessId(biz.id);
    const [
      { data: settingsRow },
      { data: contactRow },
      { data: emailRow },
      { data: tgRow },
      { data: logs },
    ] = await Promise.all([
      supabase.from('safety_settings').select('*').eq('business_id', biz.id).maybeSingle(),
      supabase
        .from('trusted_contacts')
        .select('name, email, access_token')
        .eq('business_id', biz.id)
        .maybeSingle(),
      supabase
        .from('notification_channels')
        .select('verified')
        .eq('business_id', biz.id)
        .eq('type', 'email')
        .maybeSingle(),
      supabase
        .from('notification_channels')
        .select('verified')
        .eq('business_id', biz.id)
        .eq('type', 'telegram')
        .maybeSingle(),
      supabase
        .from('escalation_log')
        .select('id, step, channel, sent_at, success, error')
        .eq('business_id', biz.id)
        .order('sent_at', { ascending: false })
        .limit(100),
    ]);
    setSettings((settingsRow as SettingsRow) ?? null);
    setContact((contactRow as ContactRow) ?? null);
    setLogRows((logs ?? []) as EscRow[]);
    setEmailVerified((emailRow as { verified: boolean } | null)?.verified === true);
    setTgVerified((tgRow as { verified: boolean } | null)?.verified === true);
    setLoading(false);
    return (settingsRow as SettingsRow) ?? null;
  }, [session]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    return () => {
      if (playTimer.current !== null) window.clearTimeout(playTimer.current);
    };
  }, []);

  const stopPlay = () => {
    if (playTimer.current !== null) {
      window.clearTimeout(playTimer.current);
      playTimer.current = null;
    }
  };

  const loadSample = async () => {
    if (!businessId) return;
    setBusy('load');
    setLoadMsg(null);
    try {
      await supabase
        .from('binder_entries')
        .delete()
        .eq('business_id', businessId)
        .eq('is_sample', true);

      const { error: insError } = await supabase.from('binder_entries').insert(
        SAMPLE_ENTRIES.map((e) => ({
          business_id: businessId,
          section: e.section,
          title: e.title,
          body: e.body,
          contact_name: e.contactName ?? '',
          contact_phone: e.contactPhone ?? '',
          contact_email: e.contactEmail ?? '',
          priority: e.priority ?? 0,
          is_sample: true,
        }))
      );
      if (insError) throw new Error('Could not insert the sample entries.');

      const { data: biz } = await supabase
        .from('businesses')
        .select('owner_name')
        .eq('id', businessId)
        .maybeSingle();
      if (biz && !(biz as { owner_name: string }).owner_name) {
        await supabase
          .from('businesses')
          .update({ name: SAMPLE_BUSINESS.name, type: SAMPLE_BUSINESS.type, owner_name: SAMPLE_BUSINESS.ownerName })
          .eq('id', businessId);
      }

      if (!contact) {
        const { error: fnError, data } = await supabase.functions.invoke('trusted-contact', {
          body: {
            action: 'save',
            owner_name: SAMPLE_BUSINESS.ownerName,
            name: SAMPLE_TRUSTED.name,
            email: session?.user.email ?? '',
            relationship: SAMPLE_TRUSTED.relationship,
          },
        });
        if (fnError || !data || typeof (data as { access_token?: unknown }).access_token !== 'string') {
          throw new Error('Could not create the trusted person.');
        }
      }

      const { error: settingsError } = await supabase
        .from('safety_settings')
        .upsert({
          business_id: businessId,
          quiet_days: 3,
          reminder_count: 3,
          reminder_gap_hours: 24,
          final_wait_hours: 24,
          paused_until: null,
        });
      if (settingsError) throw new Error('Could not set the demo safety settings.');

      await supabase.from('first72_cache').delete().eq('business_id', businessId);

      await refresh();
      setLoadMsg({ kind: 'success', text: 'Sample business loaded.' });
    } catch (err) {
      setLoadMsg({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Something went wrong.',
      });
    } finally {
      setBusy(null);
    }
  };

  const generateFirst72 = async () => {
    setBusy('gen72');
    setLoadMsg(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('generate-first-72', {
        body: {},
      });
      const failure = (data as { error?: unknown } | null)?.error;
      if (fnError || typeof failure === 'string') {
        throw new Error(typeof failure === 'string' ? failure : 'Could not reach the AI service.');
      }
      setLoadMsg({ kind: 'success', text: 'First 72 Hours generated (one AI call used).' });
    } catch (err) {
      setLoadMsg({ kind: 'error', text: err instanceof Error ? err.message : 'Something went wrong.' });
    } finally {
      setBusy(null);
    }
  };

  const nextLadderStep = async () => {
    if (busy !== null) return;
    setLadderMsg(null);
    if (!settings || !contact) {
      setLadderMsg({ kind: 'error', text: 'Load the sample business first.' });
      return;
    }
    if (!emailVerified && !tgVerified) {
      setLadderMsg({
        kind: 'error',
        text: 'No verified channel: verify your email or connect Telegram on Safety settings first.',
      });
      return;
    }
    setBusy('ladder');
    try {
      await doNextLadderStep(settings);
      await refresh();
    } finally {
      setBusy(null);
    }
  };

   const doNextLadderStep = async (current: SettingsRow) => {
    if (current.status === 'active') {
      const past = new Date(Date.now() - (current.quiet_days + 1) * 86400000).toISOString();
      await supabase
        .from('safety_settings')
        .update({ last_activity_at: past })
        .eq('business_id', businessId ?? '');
    } else if (current.status === 'reminding') {
      const allSent = current.reminders_sent >= current.reminder_count;
      const hours = allSent ? current.final_wait_hours + 1 : current.reminder_gap_hours + 1;
      const past = new Date(Date.now() - hours * 3600000).toISOString();
      await supabase
        .from('safety_settings')
        .update({ last_reminder_at: past })
        .eq('business_id', businessId ?? '');
    } else {
      return;
    }
    await supabase.functions.invoke('run-ladder', { body: {} });
  };

  const playWholeLadder = () => {
    if (busy !== null) return;
    setLadderMsg(null);
    if (!settings || !contact) {
      setLadderMsg({ kind: 'error', text: 'Load the sample business first.' });
      return;
    }
    if (!emailVerified && !tgVerified) {
      setLadderMsg({
        kind: 'error',
        text: 'No verified channel: verify your email or connect Telegram on Safety settings first.',
      });
      return;
    }
    stopPlay();
    setBusy('play');
    let current: SettingsRow = settings;
    const tick = async () => {
      if (current.status === 'handover_triggered') {
        setBusy(null);
        setLadderMsg({ kind: 'success', text: 'Handover opened — play finished.' });
        return;
      }
      await doNextLadderStep(current);
      current = (await refresh()) ?? current;
      if (current.status === 'handover_triggered') {
        setBusy(null);
        setLadderMsg({ kind: 'success', text: 'Handover opened — play finished.' });
        return;
      }
      playTimer.current = window.setTimeout(() => void tick(), 8000);
    };
    void tick();
  };
  
  const stopLadder = () => {
    stopPlay();
    setBusy(null);
    setLadderMsg({ kind: 'success', text: 'Stopped.' });
  };

  const resetDemo = async () => {
    if (!businessId) return;
    setBusy('reset');
    setLadderMsg(null);
    const { error: updError } = await supabase
      .from('safety_settings')
      .update({
        status: 'active',
        reminders_sent: 0,
        last_activity_at: new Date().toISOString(),
        last_reminder_at: null,
      })
      .eq('business_id', businessId);
    if (!updError) {
      await Promise.all([
        supabase.from('escalation_log').delete().eq('business_id', businessId),
        supabase.from('confirm_tokens').delete().eq('business_id', businessId),
        supabase.from('handover_events').delete().eq('business_id', businessId),
      ]);
    }
    setBusy(null);
    await refresh();
    setLadderMsg(
      updError
        ? { kind: 'error', text: 'Could not reset. Please try again.' }
        : { kind: 'success', text: 'Demo reset — status is Active again.' }
    );
  };

  const removeSampleEntries = async () => {
    if (!businessId) return;
    setBusy('removeSample');
    await supabase
      .from('binder_entries')
      .delete()
      .eq('business_id', businessId)
      .eq('is_sample', true);
    setBusy(null);
    await refresh();
    setLoadMsg({ kind: 'success', text: 'Sample entries removed. Your own entries were not touched.' });
  };

  if (!DEMO_MODE) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <p className="text-muted">Not available.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!businessId) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <p className="text-muted">We could not load your business. Please try signing in again.</p>
      </div>
    );
  }

  const currentStatus = settings?.status ?? 'active';
  const reminderCount = settings?.reminder_count ?? 3;
  const sentCount = settings?.reminders_sent ?? 0;
  const handoverTriggered = currentStatus === 'handover_triggered';

  // Build the ladder steps: Active, Reminder 1..N, Handover opened.
  type Step = { key: string; label: string };
  const steps: Step[] = [{ key: 'active', label: 'Active' }];
  for (let i = 1; i <= reminderCount; i += 1) {
    steps.push({ key: `reminder_${i}`, label: `Reminder ${i}` });
  }
  steps.push({ key: 'handover', label: 'Handover opened' });

  const currentIndex = handoverTriggered
    ? steps.length - 1
    : currentStatus === 'reminding'
      ? Math.min(1 + sentCount, steps.length - 1)
      : 0;

  const stepRows = (key: string) => {
    if (key === 'active') return [];
    const seen = new Set<string>();
    return logRows.filter((r) => {
      if (r.step !== key) return false;
      if (seen.has(r.channel)) return false;
      seen.add(r.channel);
      return true;
    });
  };

  const confirmText: Record<Exclude<ConfirmKind, null>, string> = {
    reset: 'Reset the demo? The ladder goes back to Active.',
    loadSample:
      'This adds sample entries for Bluebird Bakery. Your own entries are not touched.',
    removeSample: 'Remove the sample entries for Bluebird Bakery? Your own entries are not touched.',
  };

  const runConfirmed = async () => {
    const kind = confirm;
    setConfirm(null);
    if (kind === 'reset') await resetDemo();
    else if (kind === 'loadSample') await loadSample();
    else if (kind === 'removeSample') await removeSampleEntries();
  };

  return (
    <div>
      <div className="sh-eye">Demo controls</div>
      <h1 className="s" style={{ fontSize: 56, margin: '10px 0 16px', maxWidth: 760 }}>
        Run the demo, step by step.
      </h1>
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          background: '#F6E4D0',
          borderRadius: 999,
          padding: '10px 18px',
          fontSize: 14,
          fontWeight: 700,
          marginBottom: 40,
          color: '#8F2F06',
        }}
      >
        <span style={{ display: 'flex' }}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3" />
          </svg>
        </span>
        For recording and judging. Not part of the product.
      </div>

      <div className="dc-g">
        <div className="dc-col">
          {/* Load sample business */}
          <section className="dc-card dc-k1">
            <div className="dc-th">
              <span className="dc-ico">
                <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
                </svg>
              </span>
              <h2 className="s">Load sample business</h2>
            </div>
            <div className="dc-row">
              <button
                type="button"
                className="dc-btn dc-o"
                onClick={() => setConfirm('loadSample')}
                disabled={busy !== null}
              >
                {busy === 'load' ? 'Loading...' : 'Load sample business: Bluebird Bakery'}
              </button>
              <button
                type="button"
                className="dc-btn2"
                style={{ color: '#B53D0B' }}
                onClick={() => void generateFirst72()}
                disabled={busy !== null}
              >
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
                </svg>
                {busy === 'gen72' ? 'Generating...' : 'Generate First 72 Hours now'}
              </button>
            </div>
            {loadMsg && (
              <p className={`dc-msg ${loadMsg.kind === 'success' ? 'ok' : 'err'}`}>{loadMsg.text}</p>
            )}
          </section>

          {/* Fast-forward the ladder */}
          <section className="dc-card dc-k2">
            <div className="dc-th">
              <span className="dc-ico">
                <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 4l14 8-14 8V4z" />
                </svg>
              </span>
              <h2 className="s">Fast-forward the ladder</h2>
            </div>
            <div className="dc-row">
              <button
                type="button"
                className="dc-btn dc-o"
                onClick={() => void nextLadderStep()}
                disabled={busy !== null || handoverTriggered}
              >
                {busy === 'ladder' ? 'Stepping...' : 'Next ladder step'}
              </button>
              {busy === 'play' ? (
                <button
                  type="button"
                  className="dc-btn2 red"
                  onClick={stopLadder}
                >
                  Stop
                </button>
              ) : (
                <button
                  type="button"
                  className="dc-btn2"
                  style={{ color: '#B53D0B' }}
                  onClick={playWholeLadder}
                  disabled={busy !== null || handoverTriggered}
                >
                  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 4l14 8-14 8V4z" />
                  </svg>
                  {busy === 'play' ? 'Playing...' : 'Play whole ladder'}
                </button>
              )}
            </div>

            <ol className="dc-tl" aria-label="Ladder progress">
              {steps.map((step, i) => {
                const done = i < currentIndex;
                const active = i === currentIndex;
                const rows = stepRows(step.key);
                const classes = ['dc-st'];
                if (active) classes.push('cur');
                if (done) classes.push('done');
                return (
                  <li key={step.key} className={classes.join(' ')} aria-current={active ? 'step' : undefined}>
                    <div className="dc-ln">
                      <span className="dc-dot">
                        {done ? (
                          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 12l5 5L20 7" />
                          </svg>
                        ) : (
                          i + 1
                        )}
                      </span>
                      <span className="dc-bar" />
                    </div>
                    <div className="dc-bd">
                      <div className="dc-nm">{step.label}</div>
                      {rows.length > 0 &&
                        rows.some((r) => r.sent_at) && (
                          <div className="dc-ts">
                            {fmtDateTime(rows.find((r) => r.sent_at)?.sent_at ?? '')}
                          </div>
                        )}
                      {rows.length > 0 && (
                        <div className="dc-chs">
                          {rows.map((row) => (
                            <span key={row.id} className="dc-ch">
                              {channelLabel(row.channel)}{' '}
                              {row.success === true ? (
                                <b className="ok">✓ Delivered</b>
                              ) : row.success === false ? (
                                <b className="bad">&times; Failed</b>
                              ) : (
                                <b className="plain">Sent</b>
                              )}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>

            {ladderMsg && (
              <p className={`dc-msg ${ladderMsg.kind === 'success' ? 'ok' : 'err'}`}>{ladderMsg.text}</p>
            )}
          </section>
        </div>

        <div className="dc-col">
          {/* Trusted person's view (dark) */}
          <section
            className="dc-card dc-k3"
            style={{ background: '#2A1A12', borderColor: '#2A1A12', color: '#FBF5EE' }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
                marginBottom: 22,
              }}
            >
              <h2 className="s" style={{ fontSize: 26 }}>
                Trusted person&rsquo;s view
              </h2>
              {handoverTriggered ? (
                <span className="dc-pill" style={{ color: '#F4A261' }}>
                  Opened
                </span>
              ) : (
                <span className="dc-pill">
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="5" y="11" width="14" height="10" rx="2" />
                    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                  </svg>
                  Locked
                </span>
              )}
            </div>
            {contact && contact.access_token ? (
              <a
                href={`/handover/${contact.access_token}`}
                target="_blank"
                rel="noopener noreferrer"
                className="dc-btn dc-o"
              >
                Open handover page as trusted person
              </a>
            ) : (
              <button type="button" className="dc-btn dc-o" disabled>
                Open handover page as trusted person
              </button>
            )}
          </section>

          {/* Reset */}
          <section className="dc-card dc-k4">
            <div className="dc-th">
              <span className="dc-ico">
                <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" />
                </svg>
              </span>
              <h2 className="s">Reset</h2>
            </div>
            <div className="dc-row">
              <button
                type="button"
                className="dc-btn2 red"
                onClick={() => setConfirm('reset')}
                disabled={busy !== null}
              >
                {busy === 'reset' ? 'Resetting...' : 'Reset demo'}
              </button>
              <button
                type="button"
                className="dc-btn2 red"
                onClick={() => setConfirm('removeSample')}
                disabled={busy !== null}
              >
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
                </svg>
                {busy === 'removeSample' ? 'Removing...' : 'Remove sample entries'}
              </button>
            </div>
          </section>

          {/* Sending-domain note */}
          <div className="dc-note dc-k5">
            <span style={{ color: '#B53D0B', flex: 'none', marginTop: 2 }}>
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 11v5M12 8h.01" />
              </svg>
            </span>
            <span>
              Until a sending domain is verified, emails only reach the address that owns the email
              account, so use that address for the trusted person.
            </span>
          </div>
        </div>
      </div>

      {/* Advanced test tools */}
      <details className="dc-adv dc-k6">
        <summary>
          <svg className="dc-adv-chev" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M9 6l6 6-6 6" />
          </svg>
          Advanced test tools
        </summary>
        <div className="dc-adv-body">
          <p>Move stored times back so the ladder and preview react.</p>
          <div className="dc-row" style={{ marginBottom: 16 }}>
            <input
              type="number"
              min={0}
              value={pretendDays}
              onChange={(e) => setPretendDays(e.target.value)}
              aria-label="Days ago"
              className="dc-adv-in"
              style={{ maxWidth: 140 }}
            />
            <button
              type="button"
              className="dc-adv-btn"
              onClick={async () => {
                if (!businessId) return;
                const days = Math.max(0, Math.round(Number(pretendDays) || 0));
                const past = new Date(Date.now() - days * 86400000).toISOString();
                await supabase
                  .from('safety_settings')
                  .update({ last_activity_at: past })
                  .eq('business_id', businessId);
                await refresh();
              }}
            >
              Pretend I was last active {pretendDays || 0} days ago
            </button>
          </div>
          <div className="dc-row" style={{ marginBottom: 16 }}>
            <input
              type="number"
              min={0}
              value={pretendHours}
              onChange={(e) => setPretendHours(e.target.value)}
              aria-label="Hours ago"
              className="dc-adv-in"
              style={{ maxWidth: 140 }}
            />
            <button
              type="button"
              className="dc-adv-btn"
              onClick={async () => {
                if (!businessId) return;
                const hours = Math.max(0, Math.round(Number(pretendHours) || 0));
                const past = new Date(Date.now() - hours * 3600000).toISOString();
                await supabase
                  .from('safety_settings')
                  .update({ last_reminder_at: past })
                  .eq('business_id', businessId);
                await refresh();
              }}
            >
              Pretend last reminder was {pretendHours || 0} hours ago
            </button>
          </div>
          <div className="dc-row" style={{ marginBottom: 16 }}>
            <button
              type="button"
              className="dc-adv-btn"
              onClick={async () => {
                if (!businessId) return;
                const hours = (settings?.final_wait_hours ?? 24) + 1;
                const past = new Date(Date.now() - hours * 3600000).toISOString();
                await supabase
                  .from('safety_settings')
                  .update({ last_reminder_at: past })
                  .eq('business_id', businessId);
                await refresh();
              }}
            >
              Pretend the final wait has passed
            </button>
          </div>
          <div className="dc-row">
            <button
              type="button"
              className="dc-adv-btn"
              onClick={async () => {
                await supabase.functions.invoke('run-ladder', { body: {} });
                await refresh();
              }}
            >
              Run check now
            </button>
          </div>
        </div>
      </details>

      <p className="dc-foot">
        <span style={{ display: 'flex' }}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 8v4l3 2" />
          </svg>
        </span>
        Nothing is sent unless you press one of the buttons above.
      </p>

      {confirm && (
        <div
          className="dc-modal-bg"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dc-confirm-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirm(null);
          }}
        >
          <div className="dc-modal">
            <p id="dc-confirm-title">{confirmText[confirm]}</p>
            <div className="dc-modal-row">
              <button type="button" className="dc-btn2" onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="dc-btn"
                style={{ background: '#B42318' }}
                onClick={() => void runConfirmed()}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
