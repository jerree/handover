import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { usePageTitle } from '@/lib/pageTitle';
import { AuthLayout } from '@/components/AuthLayout';

interface FieldErrors {
  password?: string;
  confirm?: string;
}

export function ResetPassword() {
  usePageTitle('Set a new password');
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setHasSession(Boolean(data.session));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setHasSession(true);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setShowPassword(false);
    setShowConfirm(false);
    setFormError(null);

    const errors: FieldErrors = {};
    if (!password) {
      errors.password = 'Please enter a new password.';
    } else if (password.length < 6) {
      errors.password = 'Use at least 6 characters.';
    }
    if (!confirm) {
      errors.confirm = 'Please confirm your new password.';
    } else if (password !== confirm) {
      errors.confirm = 'Those passwords do not match. Please try them again.';
    }

    if (errors.password || errors.confirm) {
      setFieldErrors(errors);
      if (errors.password) passwordRef.current?.focus();
      else confirmRef.current?.focus();
      return;
    }

    setFieldErrors({});
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('session') || msg.includes('jwt') || msg.includes('expired')) {
        setFormError('This reset link has expired. Request a new one from the log in page.');
      } else if (msg.includes('different from the old')) {
        setFormError('That is your current password. Please choose a new one.');
      } else {
        setFormError('Something went wrong saving your new password. Please try again.');
      }
      return;
    }

    navigate('/binder', { replace: true });
  };

  return (
    <AuthLayout
      eyebrow="Reset password"
      heading="Set a new password"
      subtitle="Choose a new password for your account. You’ll be signed in once it’s saved."
      footer={
        <p className="au-sw">
          {hasSession === false ? (
            <Link to="/forgot-password">Request a new reset link</Link>
          ) : (
            <Link to="/login">Back to log in</Link>
          )}
        </p>
      }
    >
      {hasSession === false ? (
        <p className="au-notice">
          This reset link is missing or has expired. Request a new one from the log in page and
          open the fresh link from your email.
        </p>
      ) : (
        <form className="au-form" onSubmit={handleSubmit} noValidate>
          <div className="au-fields">
            <div className="au-field">
              <label htmlFor="new-password">New password</label>
              <div className="au-pw">
                <input
                  ref={passwordRef}
                  id="new-password"
                  className="au-in"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="At least 6 characters"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={fieldErrors.password ? true : undefined}
                  aria-describedby={
                    fieldErrors.password
                      ? 'new-password-help new-password-error'
                      : 'new-password-help'
                  }
                />
                <button
                  type="button"
                  className="au-show"
                  aria-pressed={showPassword}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <p className="au-help" id="new-password-help">
                Use at least 6 characters.
              </p>
              {fieldErrors.password && (
                <p className="au-err" id="new-password-error">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            <div className="au-field">
              <label htmlFor="confirm-new-password">Confirm new password</label>
              <div className="au-pw">
                <input
                  ref={confirmRef}
                  id="confirm-new-password"
                  className="au-in"
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="Type it again"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  aria-invalid={fieldErrors.confirm ? true : undefined}
                  aria-describedby={fieldErrors.confirm ? 'confirm-new-password-error' : undefined}
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
              {fieldErrors.confirm && (
                <p className="au-err" id="confirm-new-password-error">
                  {fieldErrors.confirm}
                </p>
              )}
            </div>
          </div>

          {formError && (
            <p className="au-err au-err-form" role="alert">
              {formError}
            </p>
          )}

          <button type="submit" className="au-btn" disabled={busy}>
            {busy ? 'Saving...' : 'Save new password'}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}