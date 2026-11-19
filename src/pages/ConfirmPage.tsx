import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { StatusPage } from '@/components/StatusPage';
import { usePageTitle } from '@/lib/pageTitle';

type ConfirmState =
  | 'loading'
  | 'checked_in'
  | 'verified'
  | 'already_used'
  | 'expired'
  | 'handover_open';

function formatQuietDays(days: number): string {
  const value = Math.round(days * 100) / 100;
  return `${value} ${value === 1 ? 'day' : 'days'}`;
}

export function ConfirmPage() {
  usePageTitle('Confirm check-in');
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<ConfirmState>('loading');
  const [quietDays, setQuietDays] = useState<number | null>(null);

  useEffect(() => {
    const run = async () => {
      if (!token) {
        setState('expired');
        return;
      }
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/confirm-checkin`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ token }),
          }
        );
        if (!response.ok) {
          setState('expired');
          return;
        }
        const body = (await response.json()) as { state?: unknown; quiet_days?: unknown };
        const valid: ConfirmState[] = [
          'checked_in',
          'verified',
          'already_used',
          'expired',
          'handover_open',
        ];
        setState(
          valid.includes(body.state as ConfirmState) ? (body.state as ConfirmState) : 'expired'
        );
        if (body.state === 'checked_in' && typeof body.quiet_days === 'number') {
          setQuietDays(body.quiet_days);
        }
      } catch {
        setState('expired');
      }
    };
    void run();
  }, [token]);

  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  if (state === 'loading') {
    return <StatusPage loading icon="none" eyebrow="One moment" heading="Checking..." />;
  }

  if (state === 'checked_in') {
    return (
      <StatusPage
        icon="shield"
        eyebrow="Thanks"
        heading={'You\u2019re all set.'}
        paragraph={
          <>
            Your next reminder, if needed, would come after about{' '}
            <b className="sp-strong">{formatQuietDays(quietDays ?? 7)}</b> of no activity.
          </>
        }
      />
    );
  }

  if (state === 'verified') {
    return (
      <StatusPage
        icon="mail"
        eyebrow="Email confirmed"
        heading={'You\u2019ll get safety reminders here.'}
      />
    );
  }

  if (state === 'already_used') {
    return <StatusPage icon="mail" eyebrow="Already confirmed" heading="Thank you." />;
  }

  if (state === 'handover_open') {
    return (
      <StatusPage
        icon="alert"
        error
        eyebrow="Something went wrong"
        heading="Your binder was already opened for your trusted person."
        paragraph="Please log in to close the handover."
      />
    );
  }

  return (
    <StatusPage
      icon="alert"
      error
      eyebrow="Something went wrong"
      heading="This link has expired."
      paragraph="Log in to Handover to stay on track."
    />
  );
}