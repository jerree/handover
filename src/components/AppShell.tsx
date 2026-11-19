import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useHandoverBanner } from '@/components/HandoverBanner';
import { DEMO_MODE } from '@/lib/demo';
import type { ReactNode } from 'react';
import { Logo } from '@/components/Logo';

function BinderIcon() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4z" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 5h16v11H9l-5 4V5z" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6l8-3z" />
    </svg>
  );
}

function FlaskIcon() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3" /></svg>
  );
}

function GearIcon() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z" />
    </svg>
  );
}

const NAV = [
  { to: '/binder', label: 'Binder', icon: <BinderIcon /> },
  { to: '/interview', label: 'Guided interview', icon: <ChatIcon /> },
  { to: '/trusted', label: 'Trusted person', icon: <PersonIcon /> },
  { to: '/safety', label: 'Safety settings', icon: <ShieldIcon /> },
  { to: '/account', label: 'Account', icon: <GearIcon /> },
];

export function AppShell({ children }: { children?: ReactNode }) {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  const [ownerName, setOwnerName] = useState('');
  const { banner, closeHandover, busy: bannerBusy } = useHandoverBanner();

  useEffect(() => {
    const load = async () => {
      if (!session) return;
      const { data: biz } = await supabase
        .from('businesses')
        .select('owner_name')
        .eq('owner_id', session.user.id)
        .maybeSingle();
      setOwnerName((biz as { owner_name: string | null } | null)?.owner_name ?? '');
    };
    void load();
  }, [session]);

  const metaName =
    ((session?.user.user_metadata?.full_name as string | undefined) ?? '').trim();
  const firstName =
    metaName ||
    ownerName.trim() ||
    (session?.user.email ? session.user.email.split('@')[0] : '');

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const navLinks = (
    <>
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/binder'}
          className={({ isActive }) => (isActive ? 'on' : undefined)}
        >
          {item.icon}
          {item.label}
        </NavLink>
      ))}
      {DEMO_MODE && (
        <NavLink to="/demo-controls" className={({ isActive }) => (isActive ? 'on' : undefined)}>
          <FlaskIcon />
          Demo controls
        </NavLink>
      )}
      <button type="button" className="sh-out-m" onClick={() => void handleSignOut()}>
        Sign out
      </button>
    </>
  );

  return (
    <div className="sh-shell">
      <aside className="sh-side">
        <div className="s sh-hd">
          <Logo variant="dark" className="sh-logo" />
        </div>
        {navLinks}
        <div className="sh-bt">
          <div style={{ color: '#FBF5EE', fontWeight: 700 }}>{firstName}</div>
          <div>{session?.user.email ?? ''}</div>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              void handleSignOut();
            }}
            style={{ padding: 0, minHeight: 36, marginTop: 6, fontSize: 14, textDecoration: 'underline' }}
          >
            Sign out
          </a>
        </div>
      </aside>
      <main className="sh-main">
        {banner && (
          <div
            className="sh-c"
            style={{ borderColor: '#F4A261', marginBottom: 20 }}
          >
            <p style={{ color: '#2A1A12' }}>
              Your binder was opened for {banner.trustedName}. Are you back?
            </p>
            <button
              type="button"
              onClick={() => void closeHandover()}
              disabled={bannerBusy}
              className="sh-btn"
            >
              I'm back, close the handover
            </button>
          </div>
        )}
        {children ?? <Outlet />}
      </main>
    </div>
  );
}