import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AuthLayout } from '@/components/AuthLayout';

interface AuthFormProps {
  eyebrow: string;
  heading: string;
  subtitle: string;
  submitLabel: string;
  submittingLabel: string;
  onSubmit: (email: string, password: string, name: string) => Promise<string | null>;
  askName?: boolean;
  askConfirmPassword?: boolean;
  forgotTo?: string;
  switchTo: string;
  switchText: string;
  switchLinkText: string;
}

interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
  confirm?: string;
}

export function AuthForm({
  eyebrow,
  heading,
  subtitle,
  submitLabel,
  submittingLabel,
  onSubmit,
  askName = false,
  askConfirmPassword = false,
  forgotTo,
  switchTo,
  switchText,
  switchLinkText,
}: AuthFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const location = useLocation();
  const notice = (location.state as { message?: string } | null)?.message;

  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setShowPassword(false);
    setShowConfirm(false);
    setFormError(null);

    const errors: FieldErrors = {};
    const trimmedEmail = email.trim();

    if (askName && !name.trim()) {
      errors.name = 'Please enter your name.';
    }
    if (!trimmedEmail) {
      errors.email = 'Please enter your email address.';
    } else if (emailRef.current?.validity.typeMismatch) {
      errors.email = 'Please enter a valid email address.';
    }
    if (!password) {
      errors.password = 'Please enter a password.';
    } else if (password.length < 6) {
      errors.password = 'Use at least 6 characters.';
    }
    if (askConfirmPassword) {
      if (!confirmPassword) {
        errors.confirm = 'Please confirm your password.';
      } else if (password !== confirmPassword) {
        errors.confirm = 'Those passwords do not match. Please try them again.';
      }
    }

    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      if (errors.name) nameRef.current?.focus();
      else if (errors.email) emailRef.current?.focus();
      else if (errors.password) passwordRef.current?.focus();
      else if (errors.confirm) confirmRef.current?.focus();
      return;
    }

    setBusy(true);
    const message = await onSubmit(trimmedEmail, password, name.trim());
    setBusy(false);
    if (message) setFormError(message);
  };

  return (
    <AuthLayout
      eyebrow={eyebrow}
      heading={heading}
      subtitle={subtitle}
      notice={notice}
      switchTo={switchTo}
      switchText={switchText}
      switchLinkText={switchLinkText}
    >
      <form className="au-form" onSubmit={handleSubmit} noValidate>
        <div className="au-fields">
          {askName && (
            <div className="au-field">
              <label htmlFor="auth-name">Your name</label>
              <input
                ref={nameRef}
                id="auth-name"
                className="au-in"
                type="text"
                placeholder="e.g. Amara Chen"
                autoComplete="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={fieldErrors.name ? true : undefined}
                aria-describedby={fieldErrors.name ? 'auth-name-error' : undefined}
              />
              {fieldErrors.name && (
                <p className="au-err" id="auth-name-error">
                  {fieldErrors.name}
                </p>
              )}
            </div>
          )}

          <div className="au-field">
            <label htmlFor="auth-email">Email</label>
            <input
              ref={emailRef}
              id="auth-email"
              className="au-in"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={fieldErrors.email ? true : undefined}
              aria-describedby={fieldErrors.email ? 'auth-email-error' : undefined}
            />
            {fieldErrors.email && (
              <p className="au-err" id="auth-email-error">
                {fieldErrors.email}
              </p>
            )}
          </div>

          <div className="au-field">
            <label htmlFor="auth-password">Password</label>
            <div className="au-pw">
              <input
                ref={passwordRef}
                id="auth-password"
                className="au-in"
                type={showPassword ? 'text' : 'password'}
                placeholder={askConfirmPassword ? 'At least 6 characters' : ''}
                autoComplete={askConfirmPassword ? 'new-password' : 'current-password'}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={fieldErrors.password ? true : undefined}
                aria-describedby={
                  askConfirmPassword
                    ? `auth-password-help${fieldErrors.password ? ' auth-password-error' : ''}`
                    : fieldErrors.password
                      ? 'auth-password-error'
                      : undefined
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
            {askConfirmPassword && (
              <p className="au-help" id="auth-password-help">
                Use at least 6 characters.
              </p>
            )}
            {fieldErrors.password && (
              <p className="au-err" id="auth-password-error">
                {fieldErrors.password}
              </p>
            )}
          </div>

          {askConfirmPassword && (
            <div className="au-field">
              <label htmlFor="auth-confirm">Confirm password</label>
              <div className="au-pw">
                <input
                  ref={confirmRef}
                  id="auth-confirm"
                  className="au-in"
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="Type it again"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  aria-invalid={fieldErrors.confirm ? true : undefined}
                  aria-describedby={fieldErrors.confirm ? 'auth-confirm-error' : undefined}
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
                <p className="au-err" id="auth-confirm-error">
                  {fieldErrors.confirm}
                </p>
              )}
            </div>
          )}
        </div>

        {forgotTo && (
          <p className="au-forgot">
            <Link to={forgotTo}>Forgot password?</Link>
          </p>
        )}

        {formError && (
          <p className="au-err au-err-form" role="alert" aria-live="polite">
            {formError}
          </p>
        )}

        <button type="submit" className="au-btn" disabled={busy}>
          {busy ? submittingLabel : submitLabel}
        </button>
      </form>
    </AuthLayout>
  );
}