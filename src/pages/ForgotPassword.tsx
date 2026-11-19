import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { usePageTitle } from '@/lib/pageTitle';
import { AuthLayout } from '@/components/AuthLayout';

export function ForgotPassword() {
  usePageTitle('Reset your password');
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const trimmed = email.trim();

    if (!trimmed) {
      setEmailError('Please enter your email address.');
      emailRef.current?.focus();
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError('Please enter a valid email address.');
      emailRef.current?.focus();
      return;
    }
    setEmailError(null);
    setBusy(true);

    const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);

    if (error) {
      setFormError('We couldn’t send the email right now. Please try again.');
      return;
    }
    setSent(true);
  };

  return (
    <AuthLayout
      eyebrow="Reset password"
      heading={sent ? 'Check your email' : 'Reset your password'}
      subtitle={
        sent
          ? `If an account exists for ${email.trim()}, a reset link is on its way.`
          : 'Enter the email you signed up with and we’ll send you a link to set a new password.'
      }
      footer={
        <p className="au-sw">
          <Link to="/login">Back to log in</Link>
        </p>
      }
    >
      {sent ? (
        <p className="au-notice">
          Check your inbox and spam folder. The link expires after a short while. If it doesn’t
          arrive, come back to the log in page and request another one.
        </p>
      ) : (
        <form className="au-form" onSubmit={handleSubmit} noValidate>
          <div className="au-fields">
            <div className="au-field">
              <label htmlFor="reset-email">Email</label>
              <input
                ref={emailRef}
                id="reset-email"
                className="au-in"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={emailError ? true : undefined}
                aria-describedby={emailError ? 'reset-email-error' : undefined}
              />
              {emailError && (
                <p className="au-err" id="reset-email-error">
                  {emailError}
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
            {busy ? 'Sending the link...' : 'Send reset link'}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}