import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { usePageTitle } from '@/lib/pageTitle';

const QUIET_DAYS = [3, 5, 7, 14, 30] as const;
const REMINDER_COUNTS = [1, 2, 3] as const;
const GAP_HOURS = [12, 24, 48, 72] as const;
const FINAL_WAIT_HOURS = [24, 48, 72] as const;
const HISTORY_PAGE_SIZE = 5;
const HISTORY_MAX_ROWS = 200;

interface SettingsRow {
  status: string;
  quiet_days: number;
  reminder_count: number;
  reminder_gap_hours: number;
  final_wait_hours: number;
  channels: { email: boolean; telegram: boolean; whatsapp?: boolean; sms?: boolean };
  paused_until: string | null;
  last_activity_at: string | null;
  reminders_sent: number;
  last_reminder_at: string | null;
}

interface HistoryRow {
  id: string;
  step: string;
  channel: string;
  sent_at: string | null;
  success: boolean | null;
  error: string | null;
  responded_at: string | null;
}

interface ChannelRow {
  address: string;
  verified: boolean;
}

const DEFAULTS = {
  quiet_days: 7,
  reminder_count: 3,
  reminder_gap_hours: 24,
  final_wait_hours: 24,
};

const ORDINALS = ['First', 'Second', 'Third'] as const;

function fmtHistoryDateTime(value: string | Date): string {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function fmtActivity(value: string): string {
  const d = new Date(value);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const today = startOf(new Date());
  const diffDays = Math.round((today - startOf(d)) / 86400000);
  const time = d.toLocaleString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (diffDays === 0) return `Today, ${time}`;
  if (diffDays === 1) return `Yesterday, ${time}`;
  return fmtHistoryDateTime(d);
}

function fmtDate(value: string | Date): string {
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function fmtShortDate(value: string | Date): string {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function fmtNum(n: number): string {
  return String(Number(n.toFixed(1)));
}

function stepLabel(step: string): string {
  const m = /^reminder_(\d+)$/.exec(step);
  if (m) return `Reminder ${m[1]}`;
  if (step === 'handover') return 'Final handover';
  return step;
}

function channelLabel(channel: string): string {
  if (channel === 'email') return 'Email';
  if (channel === 'telegram') return 'Telegram';
  return channel.charAt(0).toUpperCase() + channel.slice(1);
}

export function Safety() {
  usePageTitle('Safety settings');
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [trustedName, setTrustedName] = useState<string | null>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [form, setForm] = useState<typeof DEFAULTS & { emailChannel: boolean; email: string }>({
    ...DEFAULTS,
    emailChannel: true,
    email: '',
  });
  const [lastActivity, setLastActivity] = useState<string | null>(null);
  const [status, setStatus] = useState('active');
  const [pausedUntil, setPausedUntil] = useState<string | null>(null);
  const [pauseDate, setPauseDate] = useState('');
  const [savedMsg, setSavedMsg] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [channel, setChannel] = useState<ChannelRow | null>(null);
  const [channelMsg, setChannelMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [channelBusy, setChannelBusy] = useState(false);
  const [tgChannel, setTgChannel] = useState<ChannelRow | null>(null);
  const [tgLink, setTgLink] = useState<{ code: string; deepLink: string; expiresAt: string } | null>(null);
  const [tgMsg, setTgMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [tgBusy, setTgBusy] = useState(false);
  const [tgConfirm, setTgConfirm] = useState(false);
  const [remindersSent, setRemindersSent] = useState(0);
  const [lastReminderAt, setLastReminderAt] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyPage, setHistoryPage] = useState(0);

  useEffect(() => {
    if (channelMsg?.kind !== 'success') return;
    const timer = window.setTimeout(() => setChannelMsg(null), 4000);
    return () => window.clearTimeout(timer);
  }, [channelMsg]);

  useEffect(() => {
    if (tgMsg?.kind !== 'success') return;
    const timer = window.setTimeout(() => setTgMsg(null), 4000);
    return () => window.clearTimeout(timer);
  }, [tgMsg]);

  useEffect(() => {
    const load = async () => {
      if (!session) return;
      setLoginEmail(session.user.email ?? '');
      const { data: biz } = await supabase
        .from('businesses')
        .select('id')
        .eq('owner_id', session.user.id)
        .maybeSingle();
      if (!biz) {
        setError('We could not load your business. Please try signing in again.');
        setLoading(false);
        return;
      }
      setBusinessId(biz.id);

      // Ensure the settings row exists, then read it.
      await supabase
        .from('safety_settings')
        .upsert({ business_id: biz.id, last_activity_at: new Date().toISOString() });
      const { data: settings } = await supabase
        .from('safety_settings')
        .select('*')
        .eq('business_id', biz.id)
        .maybeSingle();

      const [
        { data: contact },
        { data: emailChannel },
        { data: tgRow },
        { data: logRows },
      ] = await Promise.all([
        supabase.from('trusted_contacts').select('name').eq('business_id', biz.id).maybeSingle(),
        supabase
          .from('notification_channels')
          .select('address, verified')
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
          .select('id, step, channel, sent_at, success, error, responded_at')
          .eq('business_id', biz.id)
          .order('sent_at', { ascending: false })
          .limit(HISTORY_MAX_ROWS),
      ]);
      setTrustedName(contact?.name ?? null);
      if (tgRow) setTgChannel(tgRow as ChannelRow);
      if (logRows) setHistory(logRows as HistoryRow[]);

      const savedAddress = (emailChannel as ChannelRow | null)?.address;
      if (settings) {
        const row = settings as SettingsRow;
        setForm({
          quiet_days: row.quiet_days,
          reminder_count: row.reminder_count,
          reminder_gap_hours: row.reminder_gap_hours,
          final_wait_hours: row.final_wait_hours,
          emailChannel: row.channels?.email !== false,
          email: savedAddress ?? session.user.email ?? '',
        });
        setStatus(row.status);
        setPausedUntil(row.paused_until);
        setLastActivity(row.last_activity_at);
        setRemindersSent(row.reminders_sent ?? 0);
        setLastReminderAt(row.last_reminder_at ?? null);
      } else {
        setForm((prev) => ({ ...prev, email: savedAddress ?? prev.email }));
      }
      if (emailChannel) {
        setChannel(emailChannel as ChannelRow);
      }
      setLoading(false);
    };
    void load();
  }, [session]);

  const totalDays = useMemo(() => {
    const reminderSpan = ((form.reminder_count - 1) * form.reminder_gap_hours + form.final_wait_hours) / 24;
    return form.quiet_days + reminderSpan;
  }, [form]);

  const nextStepLabel = useMemo(() => {
    if (status === 'handover_triggered') return 'Waiting for you to close the handover';
    if (status === 'reminding') {
      if (remindersSent < form.reminder_count && lastReminderAt) {
        const next = new Date(
          new Date(lastReminderAt).getTime() + form.reminder_gap_hours * 3600 * 1000
        );
        return `Reminder ${remindersSent + 1}, ${fmtShortDate(next)}`;
      }
      if (lastReminderAt) {
        const opens = new Date(
          new Date(lastReminderAt).getTime() + form.final_wait_hours * 3600 * 1000
        );
        return `Handover opens ${fmtShortDate(opens)}`;
      }
      return '—';
    }
    if (!lastActivity) return '—';
    const lastAct = new Date(lastActivity).getTime();
    const pausedEnd = pausedUntil ? new Date(pausedUntil).getTime() : 0;
    const base = Math.max(lastAct, pausedEnd);
    const due = new Date(base + form.quiet_days * 24 * 3600 * 1000);
    return `Reminder 1, ${fmtShortDate(due)}`;
  }, [status, remindersSent, lastReminderAt, lastActivity, pausedUntil, form]);

  const maxPauseDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 90);
    return d.toISOString().slice(0, 10);
  }, []);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!businessId) return;
    setBusy(true);
    setError(null);
    setSavedMsg(false);
    const { error: updError } = await supabase
      .from('safety_settings')
      .update({
        quiet_days: form.quiet_days,
        reminder_count: form.reminder_count,
        reminder_gap_hours: form.reminder_gap_hours,
        final_wait_hours: form.final_wait_hours,
        channels: {
          email: form.emailChannel,
          telegram: tgConnected,
          whatsapp: false,
          sms: false,
        },
      })
      .eq('business_id', businessId);
    if (!updError) {
      // The ladder reads the channel table, so keep the email switch in sync there.
      await supabase
        .from('notification_channels')
        .update({ enabled: form.emailChannel })
        .eq('business_id', businessId)
        .eq('type', 'email');
    }
    setBusy(false);
    if (updError) {
      setError('That combination was rejected. Please check your choices and try again.');
      return;
    }
    setSavedMsg(true);
    window.setTimeout(() => setSavedMsg(false), 3000);
  };

  const handleSavePause = async () => {
    if (!businessId || !pauseDate) return;
    setBusy(true);
    setError(null);
    const { error: updError } = await supabase
      .from('safety_settings')
      .update({ paused_until: new Date(`${pauseDate}T23:59:59`).toISOString() })
      .eq('business_id', businessId);
    setBusy(false);
    if (updError) {
      setError('Could not pause monitoring. Please try again.');
      return;
    }
    setPausedUntil(new Date(`${pauseDate}T23:59:59`).toISOString());
  };

  const handleResume = async () => {
    if (!businessId) return;
    setBusy(true);
    setError(null);
    const { error: updError } = await supabase
      .from('safety_settings')
      .update({ paused_until: null })
      .eq('business_id', businessId);
    setBusy(false);
    if (updError) {
      setError('Could not resume monitoring. Please try again.');
      return;
    }
    setPausedUntil(null);
  };

  const addressChanged =
    channel !== null && form.email.trim().toLowerCase() !== channel.address.toLowerCase();
  const emailVerified = channel?.verified === true && !addressChanged;

  const saveEmail = async (): Promise<string | null> => {
    if (!businessId) return 'Please try signing in again.';
    const address = form.email.trim().toLowerCase();
    if (!address || !address.includes('@')) {
      return 'Please enter a valid email address.';
    }
    const { error: upsertError } = await supabase
      .from('notification_channels')
      .upsert(
        { business_id: businessId, type: 'email', address, verified: false, enabled: true },
        { onConflict: 'business_id,type' }
      );
    if (upsertError) {
      return 'Could not save your email. Please try again.';
    }
    setChannel({ address, verified: channel?.verified === true && !addressChanged });
    return null;
  };

  const handleSaveEmail = async () => {
    setChannelBusy(true);
    setChannelMsg(null);
    const failure = await saveEmail();
    setChannelBusy(false);
    setChannelMsg(
      failure
        ? { kind: 'error', text: failure }
        : {
            kind: 'success',
            text: 'Email saved. Now press "Send confirmation email" to verify it.',
          }
    );
  };

  const callSendTestMessage = async (purpose: 'verify' | 'reminder_test'): Promise<string> => {
    const { data, error: fnError } = await supabase.functions.invoke('send-test-message', {
      body: { channel: 'email', purpose },
    });
    if (fnError && !(data && typeof (data as { error?: unknown }).error === 'string')) {
      return 'Could not reach the mail service. Please try again later.';
    }
    const message = (data as { error?: unknown } | null)?.error;
    return typeof message === 'string' ? message : '';
  };

  const handleSendConfirmation = async () => {
    if (!businessId) return;
    setChannelBusy(true);
    setChannelMsg(null);
    const failure = await saveEmail();
    if (failure) {
      setChannelBusy(false);
      setChannelMsg({ kind: 'error', text: failure });
      return;
    }
    const message = await callSendTestMessage('verify');
    setChannelBusy(false);
    setChannelMsg(
      message
        ? { kind: 'error', text: message }
        : { kind: 'success', text: 'Confirmation email sent. Check your inbox and tap the big button in it.' }
    );
  };

  const handleSendTestReminder = async () => {
    setChannelBusy(true);
    setChannelMsg(null);
    const message = await callSendTestMessage('reminder_test');
    setChannelBusy(false);
    setChannelMsg(
      message
        ? { kind: 'error', text: message }
        : { kind: 'success', text: 'Test reminder sent. It clearly says it is a test.' }
    );
  };

  const handleConnectTelegram = async () => {
    setTgBusy(true);
    setTgMsg(null);
    const { data, error: fnError } = await supabase.functions.invoke('telegram-link', {
      body: {},
    });
    setTgBusy(false);
    const failure = (data as { error?: unknown } | null)?.error;
    if (fnError || typeof failure === 'string') {
      setTgMsg({ kind: 'error', text: typeof failure === 'string' ? failure : 'Could not create a link code. Please try again.' });
      return;
    }
    const payload = data as { code?: unknown; deepLink?: unknown; expiresAt?: unknown };
    if (
      typeof payload.code !== 'string' ||
      typeof payload.deepLink !== 'string' ||
      typeof payload.expiresAt !== 'string'
    ) {
      setTgMsg({ kind: 'error', text: 'Unexpected response. Please try again.' });
      return;
    }
    setTgLink({ code: payload.code, deepLink: payload.deepLink, expiresAt: payload.expiresAt });
  };

  const handleDisconnectTelegram = async () => {
    if (!businessId) return;
    setTgBusy(true);
    setTgMsg(null);
    const { error: delError } = await supabase
      .from('notification_channels')
      .delete()
      .eq('business_id', businessId)
      .eq('type', 'telegram');
    setTgBusy(false);
    if (delError) {
      setTgMsg({ kind: 'error', text: 'Could not disconnect Telegram. Please try again.' });
      setTgConfirm(false);
      return;
    }
    setTgChannel(null);
    setTgLink(null);
    setTgConfirm(false);
    setTgMsg({ kind: 'success', text: 'Telegram disconnected.' });
  };

  const handleSendTelegramReminder = async () => {
    setTgBusy(true);
    setTgMsg(null);
    const { data, error: fnError } = await supabase.functions.invoke('send-test-message', {
      body: { channel: 'telegram', purpose: 'reminder_test' },
    });
    setTgBusy(false);
    const failure = (data as { error?: unknown } | null)?.error;
    if (fnError && !failure) {
      setTgMsg({ kind: 'error', text: 'Could not reach Telegram. Please try again later.' });
      return;
    }
    setTgMsg(
      typeof failure === 'string'
        ? { kind: 'error', text: failure }
        : { kind: 'success', text: "Test reminder sent to Telegram. Tap \"I'm okay\" there." }
    );
  };

  // Live status: poll every 3s while a link code is active, so the badge
  // flips to "Connected" as soon as the owner finishes /start in Telegram.
  const tgCodeActive = tgLink !== null && new Date(tgLink.expiresAt) > new Date();
  useEffect(() => {
    if (!tgCodeActive || !businessId) return;
    const interval = window.setInterval(async () => {
      const { data } = await supabase
        .from('notification_channels')
        .select('verified')
        .eq('business_id', businessId)
        .eq('type', 'telegram')
        .maybeSingle();
      if (data?.verified) setTgChannel(data as ChannelRow);
    }, 3000);
    return () => window.clearInterval(interval);
  }, [tgCodeActive, businessId]);

  const tgConnected = tgChannel?.verified === true;
  const tgCountdown = useMemo(() => {
    if (!tgLink) return '';
    const secs = Math.max(0, Math.floor((new Date(tgLink.expiresAt).getTime() - Date.now()) / 1000));
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }, [tgLink]);
  // Re-render every second while the countdown runs.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!tgCodeActive) return;
    const t = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [tgCodeActive]);

  const isPaused = pausedUntil !== null && new Date(pausedUntil) > new Date();
  const paused = isPaused;

  const anyVerifiedChannel =
    (form.emailChannel && channel?.verified === true && !addressChanged) || tgConnected;
  const monitoringOffReason = !trustedName
    ? 'Monitoring is off: add a trusted person first.'
    : !anyVerifiedChannel
      ? 'Monitoring is off: verify a reminder channel first.'
      : null;
  
  const trustedFirstName = trustedName?.trim()
    ? trustedName.trim().split(/\s+/)[0]
    : 'Your trusted person';

  const channelsLine = useMemo(() => {
    const on: string[] = [];
    if (form.emailChannel) on.push('Email');
    if (tgConnected) on.push('Telegram');
    return on.length > 0 ? on.join(' and ') : 'No channel turned on yet';
  }, [form.emailChannel, tgConnected]);

  const timeline = useMemo(() => {
    const steps: { day: number; title: string; sub: string; end?: boolean }[] = [];
    steps.push({ day: form.quiet_days, title: 'First reminder', sub: channelsLine });
    for (let i = 1; i < form.reminder_count; i++) {
      steps.push({
        day: form.quiet_days + (i * form.reminder_gap_hours) / 24,
        title: `${ORDINALS[i] ?? `Reminder ${i + 1}`} reminder`,
        sub: `${form.reminder_gap_hours} hours later`,
      });
    }
    steps.push({
      day:
        form.quiet_days +
        ((form.reminder_count - 1) * form.reminder_gap_hours + form.final_wait_hours) / 24,
      title: `${trustedFirstName} receives your private link`,
      sub: `After a final ${form.final_wait_hours}-hour wait`,
      end: true,
    });
    return steps;
  }, [form, channelsLine, trustedFirstName]);

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
        <p className="text-muted">{error ?? 'Please try signing in again.'}</p>
      </div>
    );
  }

  const historyPageCount = Math.max(1, Math.ceil(history.length / HISTORY_PAGE_SIZE));
  const safeHistoryPage = Math.min(historyPage, historyPageCount - 1);
  const historyPageRows = history.slice(
    safeHistoryPage * HISTORY_PAGE_SIZE,
    (safeHistoryPage + 1) * HISTORY_PAGE_SIZE
  );

  const statusWord =
    status === 'handover_triggered' ? 'Handover opened' : paused ? 'Paused' : 'Active';
  const statusDotColor =
    status === 'handover_triggered' || paused ? '#F4A261' : '#5CD08A';
  const statusLine = monitoringOffReason
    ? monitoringOffReason
    : status === 'handover_triggered'
      ? 'Handover has been triggered'
      : paused && pausedUntil
        ? `Monitoring is paused until ${fmtDate(pausedUntil)}`
        : 'Monitoring is on';

  const msgStyle = (kind: 'success' | 'error'): React.CSSProperties => ({
    margin: '12px 0 0',
    fontSize: 14,
    color: kind === 'success' ? '#1E6B3F' : '#B42318',
    overflowWrap: 'break-word',
  });

  return (
    <div>
      <div className="sh-eye">Safety settings</div>
      <h1 className="s sf-h1" style={{ margin: '10px 0 12px', maxWidth: 760 }}>
        What should happen if you stop using the site?
      </h1>
      <p style={{ margin: '0 0 20px', fontSize: 18, color: '#5A4638', maxWidth: 640 }}>
        Nothing is sent yet. This page only records your plan.
      </p>
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          background: '#F6E4D0',
          borderRadius: 999,
          padding: '10px 18px',
          fontSize: 14,
          marginBottom: 40,
          color: '#2A1A12',
        }}
      >
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B53D0B" strokeWidth="2">
          <path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6l8-3z" />
        </svg>
        Handover only records the time you use the site. It never records what you read or type.
      </div>

      <form onSubmit={handleSave}>
        <div className="sf-g" style={{ gridTemplateColumns: '1.5fr 1fr', alignItems: 'start' }}>
          <div className="sf-col">
            <section className="sf-card sf-k2">
              <h2 className="s" style={{ fontSize: 28, marginBottom: 6 }}>Your timing</h2>
              <p style={{ margin: '0 0 24px', color: '#5A4638', fontSize: 15 }}>
                Choose how long we wait before each step.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 }}>
                <div>
                  <label htmlFor="quiet_days">Quiet period before the first reminder</label>
                  <select
                    id="quiet_days"
                    className="sf-in"
                    value={form.quiet_days}
                    onChange={(e) => setForm({ ...form, quiet_days: Number(e.target.value) })}
                  >
                    {QUIET_DAYS.map((d) => (
                      <option key={d} value={d}>
                        {d} days
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="reminder_count">Number of reminders</label>
                  <select
                    id="reminder_count"
                    className="sf-in"
                    value={form.reminder_count}
                    onChange={(e) => setForm({ ...form, reminder_count: Number(e.target.value) })}
                  >
                    {REMINDER_COUNTS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="gap_hours">Gap between reminders</label>
                  <select
                    id="gap_hours"
                    className="sf-in"
                    value={form.reminder_gap_hours}
                    onChange={(e) => setForm({ ...form, reminder_gap_hours: Number(e.target.value) })}
                  >
                    {GAP_HOURS.map((h) => (
                      <option key={h} value={h}>
                        {h} hours
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="final_wait">Final wait after the last reminder</label>
                  <select
                    id="final_wait"
                    className="sf-in"
                    value={form.final_wait_hours}
                    onChange={(e) => setForm({ ...form, final_wait_hours: Number(e.target.value) })}
                  >
                    {FINAL_WAIT_HOURS.map((h) => (
                      <option key={h} value={h}>
                        {h} hours
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            <section className="sf-card sf-k3">
              <h2 className="s" style={{ fontSize: 28, marginBottom: 6 }}>How we reach you</h2>
              <p style={{ margin: '0 0 20px', color: '#5A4638', fontSize: 15 }}>
                We use every channel you turn on, so one tap is enough.
              </p>

              <div className="sf-panel">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <b>Email</b>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={form.emailChannel}
                    aria-label="Email reminders"
                    className="sf-tg"
                    onClick={() => setForm({ ...form, emailChannel: !form.emailChannel })}
                  >
                    <span className="sf-tr">
                      <span className="sf-kn" />
                    </span>
                  </button>
                </div>
                <label htmlFor="em" style={{ position: 'absolute', left: -9999 }}>
                  Email address
                </label>
                <input
                  id="em"
                  type="email"
                  className="sf-in"
                  style={{ margin: '12px 0', height: 48, fontSize: 15 }}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder={loginEmail || 'you@example.com'}
                />
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  {emailVerified ? (
                    <span className="sf-pg">✓ Verified</span>
                  ) : (
                    <span className="sf-soon">Not verified</span>
                  )}
                  {addressChanged && (
                    <button
                      type="button"
                      className="sf-btn2"
                      onClick={() => void handleSaveEmail()}
                      disabled={channelBusy}
                    >
                      Save this email
                    </button>
                  )}
                  <button
                    type="button"
                    className="sf-btn2"
                    onClick={() => void handleSendConfirmation()}
                    disabled={channelBusy || !form.email.trim() || (channel !== null && !addressChanged && emailVerified)}
                  >
                    {channelBusy ? 'Sending...' : 'Send confirmation email'}
                  </button>
                  <button
                    type="button"
                    className="sf-btn2"
                    onClick={() => void handleSendTestReminder()}
                    disabled={channelBusy || !emailVerified}
                  >
                    Send test reminder
                  </button>
                </div>
                {!emailVerified && (
                  <p style={{ margin: '10px 0 0', fontSize: 14, color: '#5A4638' }}>
                    Not verified, reminders won&rsquo;t go here.
                  </p>
                )}
                {channelMsg && <p style={msgStyle(channelMsg.kind)}>{channelMsg.text}</p>}
              </div>

              <div className="sf-panel">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                  <b>Telegram</b>
                  {tgConnected ? (
                    <span className="sf-pg">&bull; Connected</span>
                  ) : (
                    <button
                      type="button"
                      className="sf-btn2"
                      onClick={() => void handleConnectTelegram()}
                      disabled={tgBusy || tgCodeActive}
                    >
                      {tgBusy && !tgLink ? 'Creating...' : 'Connect Telegram'}
                    </button>
                  )}
                </div>

                {tgLink && tgCodeActive && !tgConnected && (
                  <div
                    style={{
                      background: '#fff',
                      border: '1px solid #EADBC9',
                      borderRadius: 14,
                      padding: 16,
                      marginBottom: 12,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 15, fontWeight: 700 }}>
                        Connect within <span style={{ fontVariantNumeric: 'tabular-nums' }}>{tgCountdown}</span>
                      </span>
                      <a
                        href={tgLink.deepLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="sf-btn2"
                        style={{ textDecoration: 'none' }}
                      >
                        Open Telegram
                      </a>
                    </div>
                    <p style={{ margin: '10px 0 0', fontSize: 14, color: '#5A4638', overflowWrap: 'break-word' }}>
                      or open the bot in Telegram and send{' '}
                      <code style={{ background: '#FBF5EE', borderRadius: 6, padding: '2px 6px' }}>
                        /start {tgLink.code}
                      </code>{' '}
                      to it.
                    </p>
                    <p style={{ margin: '8px 0 0', fontSize: 13, color: '#6B5545' }}>
                      Waiting for you to press Start in Telegram...
                    </p>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="sf-btn2"
                    onClick={() => void handleSendTelegramReminder()}
                    disabled={tgBusy || !tgConnected}
                  >
                    {tgBusy ? 'Sending...' : 'Send test reminder'}
                  </button>
                  {tgConnected && !tgConfirm && (
                    <button
                      type="button"
                      className="sf-btn2 red"
                      onClick={() => setTgConfirm(true)}
                      disabled={tgBusy}
                    >
                      Disconnect
                    </button>
                  )}
                </div>
                {tgConnected && tgConfirm && (
                  <p style={{ margin: '10px 0 0', fontSize: 14, color: '#5A4638' }}>
                    Disconnect Telegram? You will stop getting reminders there.{' '}
                    <button
                      type="button"
                      onClick={() => void handleDisconnectTelegram()}
                      disabled={tgBusy}
                      style={{
                        background: 'none',
                        border: 0,
                        font: 'inherit',
                        fontSize: 14,
                        fontWeight: 700,
                        color: '#B42318',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        padding: 0,
                        minHeight: 44,
                      }}
                    >
                      Yes, disconnect
                    </button>{' '}
                    <button
                      type="button"
                      onClick={() => setTgConfirm(false)}
                      style={{
                        background: 'none',
                        border: 0,
                        font: 'inherit',
                        fontSize: 14,
                        fontWeight: 700,
                        color: '#2A1A12',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        padding: 0,
                        minHeight: 44,
                      }}
                    >
                      Cancel
                    </button>
                  </p>
                )}
                {tgMsg && <p style={msgStyle(tgMsg.kind)}>{tgMsg.text}</p>}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 20px', color: '#5A4638' }}>
                <span>WhatsApp</span>
                <span className="sf-soon">Coming soon</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 20px', color: '#5A4638' }}>
                <span>SMS</span>
                <span className="sf-soon">Coming soon</span>
              </div>
            </section>

            <div className="sf-k4" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <button
                type="submit"
                className="sf-btn sf-o"
                style={{ minHeight: 54, padding: '0 34px', fontSize: 17 }}
                disabled={busy}
              >
                {busy ? 'Saving...' : 'Save settings'}
              </button>
              {savedMsg && <span style={{ fontSize: 14, fontWeight: 700, color: '#1E6B3F' }}>Saved</span>}
              <span style={{ fontSize: 14, color: '#5A4638' }}>
                Changes apply to future reminders only.
              </span>
              {error && (
                <p style={{ flexBasis: '100%', margin: 0, fontSize: 15, color: '#B42318' }}>{error}</p>
              )}
            </div>

            <section className="sf-card sf-k6">
              <h2 className="s" style={{ fontSize: 28, marginBottom: 6 }}>Pause monitoring</h2>
              <p style={{ margin: '0 0 20px', color: '#5A4638', fontSize: 15 }}>
                Taking a long break? Pause reminders for up to 90 days.
              </p>
              {!paused ? (
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <label htmlFor="pd" style={{ position: 'absolute', left: -9999 }}>
                    Pause until
                  </label>
                  <input
                    id="pd"
                    type="date"
                    className="sf-in"
                    style={{ flex: '1 1 220px', width: 'auto' }}
                    value={pauseDate}
                    min={new Date().toISOString().slice(0, 10)}
                    max={maxPauseDate}
                    onChange={(e) => setPauseDate(e.target.value)}
                  />
                  <button
                    type="button"
                    className="sf-btn2"
                    style={{ minHeight: 52 }}
                    onClick={() => void handleSavePause()}
                    disabled={busy || !pauseDate}
                  >
                    Save pause
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="sf-btn2"
                  onClick={() => void handleResume()}
                  disabled={busy}
                >
                  Resume now
                </button>
              )}
            </section>
          </div>

          <div className="sf-col">
            <section
              className="sf-card sf-k1"
              style={{ background: '#2A1A12', borderColor: '#2A1A12', color: '#FBF5EE' }}
            >
              <div className="sh-eye" style={{ color: '#F4A261' }}>Where things stand</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '10px 0 18px' }}>
                <span
                  style={{ width: 12, height: 12, borderRadius: '50%', background: statusDotColor, flexShrink: 0 }}
                />
                <span className="s" style={{ fontSize: 40 }}>{statusWord}</span>
              </div>
              <p style={{ margin: '0 0 18px', color: '#D9C7B5', fontSize: 15 }}>{statusLine}</p>
              <div className="sf-dk">
                <span>Last activity</span>
                <b>{lastActivity ? fmtActivity(lastActivity) : '—'}</b>
              </div>
              <div className="sf-dk">
                <span>Reminders sent</span>
                <b>{remindersSent} of {form.reminder_count}</b>
              </div>
              <div className="sf-dk" style={{ paddingBottom: 0 }}>
                <span>Next step</span>
                <b style={{ textAlign: 'right' }}>{nextStepLabel}</b>
              </div>
            </section>

            <section className="sf-card sf-k5" style={{ background: '#F6E4D0', borderColor: '#F6E4D0' }}>
              <div className="sh-eye">What would happen</div>
              <p className="s" style={{ fontSize: 24, lineHeight: 1.25, margin: '10px 0 24px' }}>
                {trustedFirstName} gets access about{' '}
                <b style={{ fontWeight: 500 }}>{fmtNum(totalDays)} days</b> after your last activity.
              </p>
              {timeline.map((step, i) => (
                <div key={i} className={`sf-st${step.end ? ' sf-end' : ''}`} style={{ minHeight: 44 }}>
                  <div className="sf-ln">
                    <span className="sf-dot" />
                    {!step.end && <span className="sf-bar" />}
                  </div>
                  <div style={{ paddingBottom: step.end ? 0 : 20, minWidth: 0 }}>
                    <div className="sf-d">DAY {fmtNum(step.day)}</div>
                    <div style={{ fontWeight: 700 }}>{step.title}</div>
                    <div style={{ fontSize: 14, color: '#5A4638' }}>{step.sub}</div>
                  </div>
                </div>
              ))}
            </section>
          </div>
        </div>
      </form>

      <section className="sf-card sf-k7" style={{ marginTop: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
          <h2 className="s" style={{ fontSize: 28 }}>History</h2>
          <span style={{ fontSize: 14, color: '#5A4638' }}>
            {history.length} entries &middot; page {safeHistoryPage + 1} of {historyPageCount}
          </span>
        </div>
        {history.length === 0 ? (
          <p style={{ margin: '8px 0 0', color: '#5A4638' }}>Nothing has been sent yet.</p>
        ) : (
          <>
            {historyPageRows.map((row) => {
              const status = row.success === true ? 'delivered' : row.success === false ? 'failed' : 'other';
              return (
                <div key={row.id} className="sf-hr">
                  <span className="sf-w">{row.sent_at ? fmtHistoryDateTime(row.sent_at) : '—'}</span>
                  <b>{stepLabel(row.step)}</b>
                  <span className="sf-soon">{channelLabel(row.channel)}</span>
                  {status === 'delivered' ? (
                    <span className="sf-ok"><i />Delivered</span>
                  ) : status === 'failed' ? (
                    <span className="sf-fail"><i />Failed{row.error ? `: ${row.error}` : ''}</span>
                  ) : (
                    <span className="sf-flat"><i />{row.responded_at ? 'Answered' : 'Pending'}</span>
                  )}
                </div>
              );
            })}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button
                type="button"
                className="sf-btn2"
                onClick={() => setHistoryPage(Math.max(0, safeHistoryPage - 1))}
                disabled={safeHistoryPage === 0}
              >
                Previous
              </button>
              <button
                type="button"
                className="sf-btn2"
                onClick={() => setHistoryPage(Math.min(historyPageCount - 1, safeHistoryPage + 1))}
                disabled={safeHistoryPage >= historyPageCount - 1}
              >
                Next
              </button>
            </div>
          </>
        )}
      </section>

      <p style={{ margin: '56px 0 0', fontSize: 14, color: '#6B5545' }}>
        Handover is a practical guide and does not replace a will, power of attorney, or legal advice.
      </p>
    </div>
  );
}
