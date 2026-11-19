import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { usePageTitle } from '@/lib/pageTitle';

const ERR_STYLE: CSSProperties = { color: '#B42318', fontSize: 14, margin: '6px 0 0' };
const OK_STYLE: CSSProperties = { color: '#2F6B3A', fontSize: 14, margin: '14px 0 0', fontWeight: 500 };
const HELP_STYLE: CSSProperties = { margin: '8px 0 0', fontSize: 14, color: '#5A4638' };

interface PasswordErrors {
  current?: string;
  next?: string;
  confirm?: string;
}

export function Account() {
  usePageTitle('Account');
  const { session } = useAuth();

  const metaName = ((session?.user.user_metadata?.full_name as string | undefined) ?? '').trim();
  const userId = session?.user.id;
  const email = session?.user.email ?? '';

  const [name, setName] = useState(metaName);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameFormError, setNameFormError] = useState<string | null>(null);
  const [nameSaved, setNameSaved] = useState(false);
  const [nameBusy, setNameBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [passwordErrors, setPasswordErrors] = useState<PasswordErrors>({});
  const [passwordFormError, setPasswordFormError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const currentRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!userId) return;
    const load = async () => {
      const { data } = await supabase
        .from('businesses')
        .select('owner_name')
        .eq('owner_id', userId)
        .maybeSingle();
      const owner = ((data as { owner_name: string | null } | null)?.owner_name ?? '').trim();
      if (owner) setName(owner);
    };
    void load();
  }, [userId]);

  const handleNameSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setNameError(null);
    setNameFormError(null);
    setNameSaved(false);

    const trimmed = name.trim();
    if (!trimmed) {
      setNameError('Please enter your name.');
      nameRef.current?.focus();
      return;
    }
    if (!session) {
      setNameFormError('You need to be signed in to do that.');
      return;
    }

    setNameBusy(true);
    const { error } = await supabase.auth.updateUser({ data: { full_name: trimmed } });
    if (error) {
      setNameBusy(false);
      setNameFormError('Something went wrong saving your name. Please try again.');
      return;
    }

    const { error: bizError } = await supabase
      .from('businesses')
      .update({ owner_name: trimmed })
      .eq('owner_id', session.user.id);
    setNameBusy(false);

    if (bizError) {
      setNameFormError(
        'Your name was saved to your login, but the binder could not be updated. Please try again.'
      );
      return;
    }
    setNameSaved(true);
  };

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setShowCurrent(false);
    setShowNext(false);
    setShowConfirm(false);
    setPasswordFormError(null);
    setPasswordSaved(false);

    const errors: PasswordErrors = {};
    if (!current) {
      errors.current = 'Please enter your current password.';
    }
    if (!next) {
      errors.next = 'Please enter a new password.';
    } else if (next.length < 6) {
      errors.next = 'Use at least 6 characters.';
    } else if (current && next === current) {
      errors.next = 'Please choose a password different from your current one.';
    }
    if (!confirm) {
      errors.confirm = 'Please confirm your new password.';
    } else if (next !== confirm) {
      errors.confirm = 'Those passwords do not match. Please try them again.';
    }

    setPasswordErrors(errors);
    if (errors.current || errors.next || errors.confirm) {
      if (errors.current) currentRef.current?.focus();
      else if (errors.next) nextRef.current?.focus();
      else confirmRef.current?.focus();
      return;
    }

    if (!email) {
      setPasswordFormError('You need to be signed in to change your password.');
      return;
    }

    setPasswordBusy(true);
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email,
      password: current,
    });
    if (verifyError) {
      setPasswordBusy(false);
      setPasswordErrors({ current: 'That current password did not work.' });
      currentRef.current?.focus();
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: next });
    setPasswordBusy(false);

    if (updateError) {
      setPasswordFormError('Something went wrong saving your new password. Please try again.');
      return;
    }
    setCurrent('');
    setNext('');
    setConfirm('');
    setPasswordSaved(true);
  };

  return (
    <div>
      <div className="sh-eye">Account</div>
      <h1 className="s sf-h1" style={{ margin: '10px 0 12px', maxWidth: 760 }}>
        Your account
      </h1>
      <p style={{ margin: '0 0 28px', fontSize: 18, color: '#5A4638', maxWidth: 640 }}>
        Update the name shown in your binder, and change the password you use to sign in.
      </p>

      <div style={{ display: 'grid', gap: 24, maxWidth: 760 }}>
        <section className="sf-card">
          <div className="sh-eye">Your details</div>

          <form onSubmit={(e) => void handleNameSubmit(e)} noValidate style={{ marginTop: 20 }}>
            <div style={{ display: 'grid', gap: 20 }}>
              <div>
                <label htmlFor="account-name">Name</label>
                <input
                  ref={nameRef}
                  id="account-name"
                  className="sf-in"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-invalid={nameError ? true : undefined}
                  aria-describedby={nameError ? 'account-name-error' : undefined}
                />
                {nameError && (
                  <p style={ERR_STYLE} id="account-name-error">
                    {nameError}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="account-email">Email</label>
                <input
                  id="account-email"
                  className="sf-in"
                  type="email"
                  value={email}
                  readOnly
                  aria-describedby="account-email-help"
                  style={{ background: '#FBF5EE', color: '#5A4638' }}
                />
                <p style={HELP_STYLE} id="account-email-help">
                  Your sign-in email can’t be changed here.
                </p>
              </div>
            </div>

            {nameFormError && (
              <p style={{ ...ERR_STYLE, marginTop: 14 }} role="alert">
                {nameFormError}
              </p>
            )}
            {nameSaved && (
              <p style={OK_STYLE} role="status">
                Your name is saved.
              </p>
            )}

            <button
              type="submit"
              className="sf-btn sf-o"
              disabled={nameBusy}
              style={{ marginTop: 24 }}
            >
              {nameBusy ? 'Saving...' : 'Save name'}
            </button>
          </form>
        </section>

        <section className="sf-card">
          <div className="sh-eye">Password</div>

          <form onSubmit={(e) => void handlePasswordSubmit(e)} noValidate style={{ marginTop: 20 }}>
            <div style={{ display: 'grid', gap: 20 }}>
              <div>
                <label htmlFor="account-current-password">Current password</label>
                <div className="au-pw">
                  <input
                    ref={currentRef}
                    id="account-current-password"
                    className="sf-in"
                    type={showCurrent ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={current}
                    onChange={(e) => setCurrent(e.target.value)}
                    aria-invalid={passwordErrors.current ? true : undefined}
                    aria-describedby={
                      passwordErrors.current ? 'account-current-password-error' : undefined
                    }
                  />
                  <button
                    type="button"
                    className="au-show"
                    aria-pressed={showCurrent}
                    aria-label={showCurrent ? 'Hide password' : 'Show password'}
                    onClick={() => setShowCurrent((value) => !value)}
                  >
                    {showCurrent ? 'Hide' : 'Show'}
                  </button>
                </div>
                {passwordErrors.current && (
                  <p style={ERR_STYLE} id="account-current-password-error">
                    {passwordErrors.current}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="account-new-password">New password</label>
                <div className="au-pw">
                  <input
                    ref={nextRef}
                    id="account-new-password"
                    className="sf-in"
                    type={showNext ? 'text' : 'password'}
                    placeholder="At least 6 characters"
                    autoComplete="new-password"
                    value={next}
                    onChange={(e) => setNext(e.target.value)}
                    aria-invalid={passwordErrors.next ? true : undefined}
                    aria-describedby={
                      passwordErrors.next
                        ? 'account-new-password-help account-new-password-error'
                        : 'account-new-password-help'
                    }
                  />
                  <button
                    type="button"
                    className="au-show"
                    aria-pressed={showNext}
                    aria-label={showNext ? 'Hide password' : 'Show password'}
                    onClick={() => setShowNext((value) => !value)}
                  >
                    {showNext ? 'Hide' : 'Show'}
                  </button>
                </div>
                <p style={HELP_STYLE} id="account-new-password-help">
                  Use at least 6 characters.
                </p>
                {passwordErrors.next && (
                  <p style={ERR_STYLE} id="account-new-password-error">
                    {passwordErrors.next}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="account-confirm-password">Confirm new password</label>
                <div className="au-pw">
                  <input
                    ref={confirmRef}
                    id="account-confirm-password"
                    className="sf-in"
                    type={showConfirm ? 'text' : 'password'}
                    placeholder="Type it again"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    aria-invalid={passwordErrors.confirm ? true : undefined}
                    aria-describedby={
                      passwordErrors.confirm ? 'account-confirm-password-error' : undefined
                    }
                  />
                  <button
                    type="button"
                    className="au-show"
                    aria-pressed={showConfirm}
                    aria-label={showConfirm ? 'Hide password' : 'Show password'}
                    onClick={() => setShowConfirm((value) => !value)}
                  >
                    {showConfirm ? 'Hide' : 'Show'}
                  </button>
                </div>
                {passwordErrors.confirm && (
                  <p style={ERR_STYLE} id="account-confirm-password-error">
                    {passwordErrors.confirm}
                  </p>
                )}
              </div>
            </div>

            {passwordFormError && (
              <p style={{ ...ERR_STYLE, marginTop: 14 }} role="alert">
                {passwordFormError}
              </p>
            )}
            {passwordSaved && (
              <p style={OK_STYLE} role="status">
                Your password is updated.
              </p>
            )}

            <button
              type="submit"
              className="sf-btn sf-o"
              disabled={passwordBusy}
              style={{ marginTop: 24 }}
            >
              {passwordBusy ? 'Saving...' : 'Save password'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}