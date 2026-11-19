import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Logo } from '@/components/Logo';

type StatusIcon = 'mail' | 'shield' | 'alert' | 'none';

interface StatusPageProps {
  icon: StatusIcon;
  error?: boolean;
  sand?: boolean;
  eyebrow: string;
  heading: string;
  paragraph?: ReactNode;
  loading?: boolean;
  loadingText?: string;
  binder?: boolean;
  footerText?: string;
}

function StatusIconSvg({ kind }: { kind: StatusIcon }) {
  if (kind === 'mail') {
    return (
      <svg
        aria-hidden="true"
        width="30"
        height="30"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 7l9 6 9-6" />
      </svg>
    );
  }
  if (kind === 'shield') {
    return (
      <svg
        aria-hidden="true"
        width="30"
        height="30"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6l8-3z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    );
  }
  if (kind === 'alert') {
    return (
      <svg
        aria-hidden="true"
        width="30"
        height="30"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5M12 16h.01" />
      </svg>
    );
  }
  return null;
}

export function StatusPage({
  icon,
  error = false,
  sand = false,
  eyebrow,
  heading,
  paragraph,
  loading = false,
  loadingText = 'Checking...',
  binder = false,
  footerText,
}: StatusPageProps) {
  const { session } = useAuth();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!loading) headingRef.current?.focus();
  }, [loading, heading]);

  const signedIn = session !== null;

  const icoClass = error ? 'sp-ico sp-ico-err' : sand ? 'sp-ico sp-ico-sand' : 'sp-ico';

  return (
    <div className="sp-page">
      <header className="sp-top">
        {binder ? (
          <span className="sp-wordmark">
            <Logo className="sp-logo" />
          </span>
        ) : (
          <>
            <Link to="/" className="sp-wordmark" aria-label="Handover home">
              <Logo className="sp-logo" />
            </Link>
            <Link to={signedIn ? '/binder' : '/login'} className="sp-nav">
              {signedIn ? 'Open binder' : 'Log in'}
            </Link>
          </>
        )}
      </header>

      <main className="sp-mid">
        <section className="sp-card">
          {loading ? (
            <>
              <div className="sp-loading" aria-hidden="true">
                <span className="sp-spin" />
              </div>
              <div className="sp-eye">One moment</div>
              <h1
                ref={headingRef}
                tabIndex={-1}
                className={binder ? 's sp-h1 sp-h1-binder' : 's sp-h1'}
              >
                {loadingText}
              </h1>
            </>
          ) : (
            <>
              <div className={icoClass} aria-hidden="true">
                <StatusIconSvg kind={icon} />
              </div>
              <div className="sp-eye">{eyebrow}</div>
              <h1
                ref={headingRef}
                tabIndex={-1}
                className={binder ? 's sp-h1 sp-h1-binder' : 's sp-h1'}
              >
                {heading}
              </h1>
              {paragraph && <p className="sp-p">{paragraph}</p>}
              {!binder && (
                <Link to={signedIn ? '/binder' : '/login'} className="sp-btn">
                  {signedIn ? 'Go to your binder' : 'Log in to Handover'}
                </Link>
              )}
            </>
          )}
        </section>
      </main>

      <footer className="sp-foot">
        <p>
          {footerText ??
            'Handover is a practical guide and does not replace a will, power of attorney, or legal advice.'}
        </p>
      </footer>
    </div>
  );
}