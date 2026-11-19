import { useEffect } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { AppShell } from '@/components/AppShell';
import { RequireAuth } from '@/components/RequireAuth';
import { HandoverBannerGate } from '@/components/HandoverBanner';
import { Landing } from '@/pages/Landing';
import { SignUp } from '@/pages/SignUp';
import { Login } from '@/pages/Login';
import { ForgotPassword } from '@/pages/ForgotPassword';
import { ResetPassword } from '@/pages/ResetPassword';
import { Onboarding } from '@/pages/Onboarding';
import { BinderDashboard } from '@/pages/BinderDashboard';
import { SectionPage } from '@/pages/SectionPage';
import { Interview } from '@/pages/Interview';
import { Trusted } from '@/pages/Trusted';
import { Safety } from '@/pages/Safety';
import { Account } from '@/pages/Account';
import { PreviewHandover } from '@/pages/PreviewHandover';
import { HandoverPage } from '@/pages/HandoverPage';
import { ConfirmPage } from '@/pages/ConfirmPage';
import { DemoControls } from '@/pages/DemoControls';
import { NotFound } from '@/pages/NotFound';
import { DEMO_MODE } from '@/lib/demo';
import { supabase } from '@/lib/supabase';
import { CursorFx } from '@/components/CursorFx';

function App() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') navigate('/reset-password', { replace: true });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);
  const isLanding = pathname === '/';
  const hasShell =
    pathname.startsWith('/binder') ||
    pathname === '/interview' ||
    pathname === '/trusted' ||
    pathname === '/safety' ||
    pathname === '/account' ||
    (DEMO_MODE && pathname === '/demo-controls');
  const isPublicHandover = pathname.startsWith('/handover/') || pathname.startsWith('/c/');
  const isStatusPage = pathname.startsWith('/c/');
  const isAuthPage =
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/onboarding' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password';
  const showCursorFx = !isPublicHandover && !isAuthPage;

  return (
    <div className="min-h-screen flex flex-col">
      {!isLanding && !hasShell && !isStatusPage && !isAuthPage && <Header />}
      <HandoverBannerGate />
      {showCursorFx && <CursorFx />}
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          <Route element={<RequireAuth />}>
            <Route path="/onboarding" element={<Onboarding />} />
            <Route element={<AppShell />}>
              <Route path="/binder" element={<BinderDashboard />} />
              <Route path="/binder/:section" element={<SectionPage />} />
              <Route path="/interview" element={<Interview />} />
              <Route path="/trusted" element={<Trusted />} />
              <Route path="/safety" element={<Safety />} />
              <Route path="/account" element={<Account />} />
              {DEMO_MODE && <Route path="/demo-controls" element={<DemoControls />} />}
            </Route>
            <Route path="/preview-handover" element={<PreviewHandover />} />
          </Route>

          <Route path="/handover/:token" element={<HandoverPage />} />
          <Route path="/c/:token" element={<ConfirmPage />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      {!isLanding && !hasShell && !isStatusPage && !isAuthPage && (
        <footer className="border-t border-brand-100 mt-8">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
            <p className="text-sm text-muted">
              Handover is a practical guide and does not replace a will, power of attorney, or
              legal advice.
            </p>
          </div>
        </footer>
      )}
    </div>
  );
}

export default App;