import { Link } from 'react-router-dom';
import { LogOut, LayoutDashboard } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Logo } from '@/components/Logo';

export function Header() {
  const { session, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-20 bg-page/90 backdrop-blur border-b border-brand-100">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 md:px-8 h-16 flex items-center justify-between min-w-0">
        <Link
          to={session ? '/binder' : '/'}
          className="flex items-center hover:opacity-90 transition-opacity"
          aria-label="Handover home"
        >
           <Logo className="hd-logo" hMark />
        </Link>

        {session && (
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/binder"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-muted hover:text-brand-600 hover:bg-brand-50 transition-colors"
            >
              <LayoutDashboard size={16} />
              Dashboard
            </Link>
            <button
              onClick={() => void signOut()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-muted hover:text-brand-600 hover:bg-brand-50 transition-colors"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
