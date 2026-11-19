import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/Logo';

interface AuthLayoutProps {
  eyebrow?: string;
  heading?: string;
  subtitle?: string;
  pill?: string;
  notice?: string | null;
  switchTo?: string;
  switchText?: string;
  switchLinkText?: string;
  footer?: ReactNode;
  children: ReactNode;
}

export function AuthLayout({
  eyebrow,
  heading,
  subtitle,
  pill,
  notice,
  switchTo,
  switchText,
  switchLinkText,
  footer,
  children,
}: AuthLayoutProps) {
  return (
    <div className="au-auth">
      <aside className="au-pane">
        <Link to="/" className="s au-brand" aria-label="Handover home">
          <Logo variant="dark" className="au-logo" />
        </Link>
        <div className="au-pitch">
          <h2 className="s au-pitch-h">
            Every small business runs on one person’s{' '}
            <em style={{ color: '#F4A261' }}>memory.</em>
          </h2>
          <p className="au-pitch-p">
            Handover turns what you know into a plain-language binder, checks on you quietly, and
            hands it to someone you trust if you can’t be reached.
          </p>
        </div>
        <p className="au-tag">Takes about ten minutes</p>
      </aside>

      <div className="au-right">
        <main className="au-mid">
          <section className="au-card">
            {pill && <span className="au-pill">{pill}</span>}
            {eyebrow && <div className="au-eye">{eyebrow}</div>}
            {heading && (
              <h1 className="s au-h1" style={pill ? { margin: '16px 0 12px' } : undefined}>
                {heading}
              </h1>
            )}
            {subtitle && <p className="au-sub">{subtitle}</p>}
            {notice && <p className="au-notice">{notice}</p>}
            {children}
            {footer ??
              (switchTo && switchText && switchLinkText ? (
                <p className="au-sw">
                  {switchText} <Link to={switchTo}>{switchLinkText}</Link>
                </p>
              ) : null)}
          </section>
        </main>
        <footer className="au-foot">
          Handover is a practical guide and does not replace a will, power of attorney, or legal
          advice.
        </footer>
      </div>
    </div>
  );
}