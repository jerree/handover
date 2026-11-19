import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useActivityTracking } from '@/lib/activity';
import { usePageTitle } from '@/lib/pageTitle';
import { AuthLayout } from '@/components/AuthLayout';

export function Onboarding() {
  usePageTitle('Set up your binder');
  const navigate = useNavigate();
  const { session, signOut } = useAuth();
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [description, setDescription] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [checking, setChecking] = useState(true);
  const nameRef = useRef<HTMLInputElement>(null);
  const { track } = useActivityTracking({ businessId: null, kind: 'view' });

  useEffect(() => {
    // If the owner already created a business, skip ahead.
    const check = async () => {
      const { data, error } = await supabase
        .from('businesses')
        .select('id')
        .eq('owner_id', session!.user.id)
        .maybeSingle();
      if (!error && data) {
        navigate('/binder', { replace: true });
        return;
      }
      setChecking(false);
    };
    void check();
  }, [session, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setNameError('Please enter your business name.');
      nameRef.current?.focus();
      return;
    }
    setNameError(null);
    setBusy(true);

    const ownerName =
      ((session?.user.user_metadata?.full_name as string | undefined) ?? '').trim();
    const { data, error: insertError } = await supabase
      .from('businesses')
      .insert({
        name: name.trim(),
        type: type.trim(),
        description: description.trim(),
        owner_name: ownerName,
      })
      .select('id')
      .single();

    setBusy(false);
    if (insertError || !data) {
      setError('Something went wrong creating your business. Please try again.');
      return;
    }

    // Give every new business a safety settings row with defaults.
    await supabase.from('safety_settings').insert({ business_id: (data as { id: string }).id });
    track('edit');

    navigate('/binder', { replace: true });
  };

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      navigate('/login', { replace: true });
    }
  };

  if (checking) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <AuthLayout
      pill="Step 1 of 1"
      heading="Tell us about your business"
      subtitle="Just the basics. You can fill in the details in your binder, little by little."
      footer={
        <p className="au-sw">
          <button
            type="button"
            className="au-signout"
            onClick={() => void handleSignOut()}
            disabled={signingOut}
          >
            {signingOut ? 'Signing out...' : 'Sign out'}
          </button>
        </p>
      }
    >
      <form className="au-form" onSubmit={handleSubmit} noValidate>
        <div className="au-fields">
          <div className="au-field">
            <label htmlFor="biz-name">Business name</label>
            <input
              ref={nameRef}
              id="biz-name"
              className="au-in"
              type="text"
              placeholder="e.g. Bluebird Bakery"
              autoComplete="organization"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? 'biz-name-error' : undefined}
            />
            {nameError && (
              <p className="au-err" id="biz-name-error">
                {nameError}
              </p>
            )}
          </div>

          <div className="au-field">
            <label htmlFor="biz-type">
              What kind of business is it? <small>(optional)</small>
            </label>
            <input
              id="biz-type"
              className="au-in"
              type="text"
              placeholder="e.g. Bakery, freelance design, online shop"
              value={type}
              onChange={(e) => setType(e.target.value)}
            />
          </div>

          <div className="au-field">
            <label htmlFor="biz-description">
              A short description <small>(optional)</small>
            </label>
            <textarea
              id="biz-description"
              className="au-in au-ta"
              rows={3}
              placeholder="A sentence or two about what you do and who your customers are."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        {error && (
          <p className="au-err au-err-form" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="au-btn" disabled={busy}>
          {busy ? (
            'Creating your binder...'
          ) : (
            <>
              Create my binder
              <ArrowRight size={18} aria-hidden="true" />
            </>
          )}
        </button>
      </form>
    </AuthLayout>
  );
}