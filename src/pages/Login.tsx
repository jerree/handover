import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { AuthForm } from '@/components/AuthForm';
import { usePageTitle } from '@/lib/pageTitle';

export function Login() {
  usePageTitle('Sign in');
  const navigate = useNavigate();

  const handleLogin = async (email: string, password: string): Promise<string | null> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('email not confirmed')) {
        return 'Your email is not confirmed yet. Open the confirmation link we emailed you, then sign in.';
      }
      if (msg.includes('invalid login credentials')) {
        return 'That email and password combination did not work. Please try again.';
      }
      return error.message;
    }
    navigate('/binder', { replace: true });
    return null;
  };

  return (
    <AuthForm
      eyebrow="Log in"
      heading="Welcome back"
      subtitle="Sign in to keep your binder up to date."
      submitLabel="Sign in"
      submittingLabel="Signing in..."
      onSubmit={handleLogin}
      forgotTo="/forgot-password"
      switchTo="/signup"
      switchText="New to Handover?"
      switchLinkText="Create an account"
    />
  );
}