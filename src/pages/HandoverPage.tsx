import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  BINDER_LEGAL,
  HandoverView,
  LockedState,
  type HandoverData,
} from '@/components/HandoverView';
import { StatusPage } from '@/components/StatusPage';
import { usePageTitle } from '@/lib/pageTitle';

export function HandoverPage() {
  usePageTitle('Handover');
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<'loading' | 'locked' | 'open' | 'error'>('loading');
  const [data, setData] = useState<HandoverData | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!token) {
        setState('error');
        return;
      }
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/handover-access`,
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
          setState('error');
          return;
        }
        const body = (await response.json()) as
          | { state: 'locked' }
          | {
              state: 'open';
              business_name: string;
              owner_name: string;
              trusted_name: string;
              entries: HandoverData['entries'];
              first72?: HandoverData['first72'];
            };
        if (body.state === 'locked') {
          setState('locked');
        } else if (body.state === 'open' && Array.isArray(body.entries)) {
          setData({
            business_name: body.business_name,
            owner_name: body.owner_name,
            trusted_name: body.trusted_name,
            entries: body.entries,
            first72: Array.isArray(body.first72) ? body.first72 : [],
          });
          setState('open');
        } else {
          setState('error');
        }
      } catch {
        setState('error');
      }
    };
    void load();
  }, [token]);

  useEffect(() => {
    document.querySelector('meta[name="robots"]')?.remove();
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  if (state === 'loading') {
    return (
      <StatusPage
        binder
        loading
        icon="none"
        eyebrow="One moment"
        heading="Loading..."
        loadingText="Loading..."
        footerText={BINDER_LEGAL}
      />
    );
  }

  if (state === 'open' && data) {
    return <HandoverView data={data} />;
  }

  if (state === 'locked') {
    return <LockedState />;
  }

  // An unknown token or any other failure shows the same closed message to a visitor.
  return <LockedState error />;
}