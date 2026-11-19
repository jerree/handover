import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, LockOpen } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { DEMO_MODE } from '@/lib/demo';
import { usePageTitle } from '@/lib/pageTitle';

const CHIPS = ['Sibling', 'Partner', 'Parent', 'Friend', 'Colleague', 'Other'] as const;
type Chip = (typeof CHIPS)[number];

const REMOVE_STYLE: React.CSSProperties = {
  color: '#B42318',
  fontWeight: 700,
  background: 'none',
  border: 0,
  font: 'inherit',
  fontSize: 'inherit',
  cursor: 'pointer',
  textDecoration: 'underline',
  padding: 0,
  minHeight: 44,
};

export function Trusted() {
  usePageTitle('Trusted person');
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [chip, setChip] = useState<Chip | null>(null);
  const [customRelationship, setCustomRelationship] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [hasContact, setHasContact] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [pillOpened, setPillOpened] = useState(false);
  const [linkMsg, setLinkMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (linkMsg?.kind !== 'success') return;
    const timer = window.setTimeout(() => setLinkMsg(null), 5000);
    return () => window.clearTimeout(timer);
  }, [linkMsg]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!session) return;
      const { data: biz, error: bizError } = await supabase
        .from('businesses')
        .select('id, name, owner_name')
        .eq('owner_id', session.user.id)
        .maybeSingle();
      if (cancelled) return;
      if (bizError || !biz) {
        setError('We could not load your business. Please try signing in again.');
        setLoading(false);
        return;
      }
      setBusinessId(biz.id);
      setBusinessName(biz.name);
      setOwnerName(biz.owner_name ?? '');

      const { data: contact } = await supabase
        .from('trusted_contacts')
        .select('name, email, relationship, access_token')
        .eq('business_id', biz.id)
        .maybeSingle();
      if (cancelled) return;
      if (contact) {
        setName(contact.name);
        setEmail(contact.email);
        const savedRel = (contact.relationship ?? '').trim();
        const matched = CHIPS.find((c) => c.toLowerCase() === savedRel.toLowerCase());
        if (matched) {
          setChip(matched);
        } else if (savedRel) {
          setChip('Other');
          setCustomRelationship(savedRel);
        }
        setToken(contact.access_token);
        setHasContact(true);
      }

      const { data: settings } = await supabase
        .from('safety_settings')
        .select('status')
        .eq('business_id', biz.id)
        .maybeSingle();
      if (cancelled) return;
      if (settings?.status === 'handover_triggered') setPillOpened(true);
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const callFunction = async (action: 'save' | 'rotate', payload: Record<string, string> = {}) => {
    const { data, error: fnError } = await supabase.functions.invoke('trusted-contact', {
      body: { action, ...payload },
    });
    if (fnError || !data || typeof (data as { access_token?: unknown }).access_token !== 'string') {
      const message =
        typeof (data as { error?: unknown })?.error === 'string'
          ? (data as { error: string }).error
          : 'Something went wrong. Please try again.';
      throw new Error(message);
    }
    return (data as { access_token: string }).access_token;
  };

  const validate = (): boolean => {
    if (!name.trim()) {
      setError("Your trusted person's name is required.");
      return false;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const relationship = chip === 'Other' ? customRelationship.trim() : chip ?? '';
      const newToken = await callFunction('save', {
        owner_name: ownerName,
        name,
        email,
        relationship,
      });
      setToken(newToken);
      setHasContact(true);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    if (!businessId) return;
    setBusy(true);
    setError(null);
    const { error: delError } = await supabase
      .from('trusted_contacts')
      .delete()
      .eq('business_id', businessId);
    setBusy(false);
    if (delError) {
      setError('Could not remove your trusted person. Please try again.');
      setConfirmRemove(false);
      return;
    }
    setName('');
    setEmail('');
    setChip(null);
    setCustomRelationship('');
    setToken(null);
    setHasContact(false);
    setConfirmRemove(false);
  };

const handleRotate = async () => {
    setBusy(true);
    setLinkMsg(null);
    try {
      const newToken = await callFunction('rotate');
      setToken(newToken);
      setConfirmRotate(false);
      setLinkMsg({ kind: 'success', text: 'New link created. The old link no longer works.' });
    } catch (err) {
      setLinkMsg({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Could not create a new link. Please try again.',
      });
    } finally {
      setBusy(false);
    }
  };

  const toggleHandover = async () => {
    if (!businessId || statusBusy) return;
    setStatusBusy(true);
    setLinkMsg(null);
    const nextOpen = !pillOpened;
    const { error: updError } = await supabase
      .from('safety_settings')
      .update(
        nextOpen
          ? { status: 'handover_triggered' }
          : {
              status: 'active',
              reminders_sent: 0,
              last_reminder_at: null,
              last_activity_at: new Date().toISOString(),
            }
      )
      .eq('business_id', businessId);
    setStatusBusy(false);
    if (updError) {
      setLinkMsg({ kind: 'error', text: 'Could not update the handover link. Please try again.' });
      return;
    }
    setPillOpened(nextOpen);
    setLinkMsg(
      nextOpen
        ? { kind: 'success', text: 'Link is now open. Anyone with it can read the binder.' }
        : { kind: 'success', text: 'Link is locked again.' }
    );
  };

  const handoverLink = token ? `${window.location.origin}/handover/${token}` : null;

  const copyLink = async () => {
    if (!handoverLink) return;
    let copiedOk = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(handoverLink);
        copiedOk = true;
      }
    } catch {
      copiedOk = false;
    }
    if (!copiedOk) {
      try {
        const area = document.createElement('textarea');
        area.value = handoverLink;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.top = '-9999px';
        document.body.appendChild(area);
        area.select();
        copiedOk = document.execCommand('copy');
        document.body.removeChild(area);
      } catch {
        copiedOk = false;
      }
    }
    setCopied(copiedOk);
    if (copiedOk) {
      window.setTimeout(() => setCopied(false), 2000);
    } else {
      setLinkMsg({
        kind: 'error',
        text: 'Could not copy automatically. Press and hold the link to copy it.',
      });
    }
  };

  const trustName = name.trim() || 'your trusted person';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="sh-eye">Trusted person</div>
      <h1 className="s tp-h1" style={{ fontSize: 56, margin: '10px 0 12px', maxWidth: 760 }}>
        Who should get your plan if you can&rsquo;t be reached?
      </h1>
      <p style={{ margin: '0 0 40px', fontSize: 18, color: '#5A4638', maxWidth: 640 }}>
        Choose one person you trust. They see your {businessName || 'business'} binder only after
        every reminder goes unanswered.
      </p>

      <div className="sh-g" style={{ gridTemplateColumns: '1.1fr 0.9fr', alignItems: 'start' }}>
        <section className="tp-card">
          <h2 className="s" style={{ fontSize: 30, margin: '0 0 28px' }}>Their details</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            <div>
              <label htmlFor="owner_name" className="tp-label">Your name</label>
              <input
                id="owner_name"
                type="text"
                className="tp-in"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="e.g. Alex Rivera"
              />
            </div>
            <div>
              <label htmlFor="trusted_name" className="tp-label">Their name</label>
              <input
                id="trusted_name"
                type="text"
                className="tp-in"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Sam Chen"
              />
            </div>
            <div>
              <label htmlFor="trusted_email" className="tp-label">Their email</label>
              <input
                id="trusted_email"
                type="email"
                className="tp-in"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. sam@example.com"
              />
            </div>
            <div>
              <span className="tp-label" id="relationship-label">Relationship</span>
              <div
                style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}
                role="group"
                aria-labelledby="relationship-label"
              >
                {CHIPS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`tp-chip${chip === c ? ' on' : ''}`}
                    aria-pressed={chip === c}
                    onClick={() => setChip(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
              {chip === 'Other' && (
                <div style={{ marginTop: 14 }}>
                  <label htmlFor="custom_relationship" className="tp-label">Relationship</label>
                  <input
                    id="custom_relationship"
                    type="text"
                    className="tp-in"
                    value={customRelationship}
                    onChange={(e) => setCustomRelationship(e.target.value)}
                    placeholder="e.g. Business partner"
                  />
                </div>
              )}
            </div>
          </div>
          {error && <p style={{ color: '#B42318', fontSize: 14, marginTop: 14 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap', marginTop: 32 }}>
            <button
              type="button"
              className="tp-btn tp-o"
              onClick={() => void handleSave()}
              disabled={busy}
            >
              {busy ? 'Saving...' : 'Save changes'}
            </button>
            {saved && <span style={{ fontSize: 14, fontWeight: 500 }}>Saved</span>}
            {hasContact && !confirmRemove && (
              <button type="button" style={REMOVE_STYLE} onClick={() => setConfirmRemove(true)}>
                Remove trusted person
              </button>
            )}
            {confirmRemove && (
              <span style={{ fontSize: 14 }}>
                Remove {name.trim() || 'them'}? Their link will stop working.{' '}
                <button
                  type="button"
                  style={REMOVE_STYLE}
                  onClick={() => void handleRemove()}
                  disabled={busy}
                >
                  Yes, remove
                </button>{' '}
                <button type="button" style={REMOVE_STYLE} onClick={() => setConfirmRemove(false)}>
                  Cancel
                </button>
              </span>
            )}
          </div>
        </section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, minWidth: 0 }}>
          <section
            className="tp-card"
           
            style={{ background: '#2A1A12', borderColor: '#2A1A12', color: '#FBF5EE' }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <h2 className="s" style={{ fontSize: 30, margin: 0 }}>Handover link</h2>
              <span className="tp-pill">
                {pillOpened ? (
                  <>
                    <LockOpen size={14} strokeWidth={2.5} />
                    Opened
                  </>
                ) : (
                  <>
                    <Lock size={14} strokeWidth={2.5} />
                    Locked
                  </>
                )}
              </span>
            </div>
            {hasContact ? (
              <>
                <p style={{ color: '#D9C7B5', margin: '12px 0 20px' }}>
                  {trustName} opens this link when your binder is triggered. Until then it shows
                  only a calm &ldquo;not opened yet&rdquo; message.
                </p>
                <div className="tp-linkbox">{handoverLink ?? ''}</div>
                {linkMsg && (
                  <p
                    style={{
                      margin: '12px 0 0',
                      fontSize: 14,
                      fontWeight: 700,
                      color: linkMsg.kind === 'success' ? '#F4A261' : '#FFB4A2',
                    }}
                  >
                    {linkMsg.text}
                  </p>
                )}
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 20 }}>
                  <button
                    type="button"
                    className="tp-btn tp-o"
                    onClick={() => void copyLink()}
                    disabled={!handoverLink}
                  >
                    {copied ? 'Copied' : 'Copy link'}
                  </button>
                  {!confirmRotate ? (
                    <button
                      type="button"
                      className="tp-btn tp-gh"
                      onClick={() => setConfirmRotate(true)}
                      disabled={busy}
                    >
                      Create a new link
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="tp-btn tp-gh"
                        onClick={() => void handleRotate()}
                        disabled={busy}
                      >
                        {busy ? 'Creating...' : 'The old link stops working. Confirm'}
                      </button>
                      <button
                        type="button"
                        className="tp-btn tp-gh"
                        onClick={() => setConfirmRotate(false)}
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
                {DEMO_MODE && (
                  <button
                    type="button"
                    className="tp-btn tp-gh"
                    style={{ marginTop: 12, width: '100%' }}
                    onClick={() => void toggleHandover()}
                    disabled={statusBusy || busy}
                  >
                    {statusBusy
                      ? 'Updating...'
                      : pillOpened
                        ? 'Demo: lock the link again'
                        : 'Demo: open the link now'}
                  </button>
                )}
                <p style={{ margin: '18px 0 0', fontSize: 14, color: '#D9C7B5' }}>
                  A new link makes the old one stop working immediately.{' '}
                  <Link to="/preview-handover" style={{ color: '#F4A261', fontWeight: 700 }}>
                    Preview what {trustName} will see
                  </Link>
                </p>
              </>
            ) : (
              <p style={{ color: '#D9C7B5', margin: '12px 0 20px' }}>
                Save their details to create a private link.
              </p>
            )}
          </section>

          <section className="tp-card" style={{ background: '#F6E4D0', borderColor: '#F6E4D0' }}>
            <h2 className="s" style={{ fontSize: 26, margin: '0 0 18px' }}>How access works</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, color: '#5A4638' }}>
              <div><b style={{ color: '#2A1A12' }}>1. You go quiet.</b> We note it after the days you chose.</div>
              <div><b style={{ color: '#2A1A12' }}>2. We ask if you&rsquo;re okay.</b> By email and Telegram, one tap to stop.</div>
              <div><b style={{ color: '#2A1A12' }}>3. {trustName} gets the link.</b> No account needed, only the link.</div>
            </div>
          </section>
        </div>
      </div>

      <p style={{ margin: '56px 0 0', fontSize: 14, color: '#6B5545' }}>
        Handover is a practical guide and does not replace a will, power of attorney, or legal
        advice.
      </p>
    </div>
  );
}
