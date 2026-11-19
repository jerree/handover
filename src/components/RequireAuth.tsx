import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';

export function RequireAuth() {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    const expired = location.pathname !== '/';
    return (
      <Navigate
        to="/login"
        state={{
          from: location.pathname,
          message: expired
            ? 'You were signed out to keep your binder safe. Please sign in again.'
            : undefined,
        }}
        replace
      />
    );
  }

  return <Outlet />;
}
