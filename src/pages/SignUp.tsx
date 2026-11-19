import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { AuthForm } from '@/components/AuthForm';
import { usePageTitle } from '@/lib/pageTitle';

export function SignUp() {
  usePageTitle('Create account');
  const navigate = useNavigate();

  const handleSignUp = async (email: string, password: string, name: string): Promise<string | null> => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });
    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('already') && msg.includes('registered')) {
        return 'That email is already registered. Try signing in instead, or use a different email.';
      }
      // Show the real password rule (e.g. the project may require letters and numbers).
      return error.message;
    }
    if (!data.session) {
      // Email confirmation is switched on: the account exists but cannot sign
      // in until the link in the confirmation email is opened.
      navigate('/login', {
        replace: true,
        state: {
          message: `Almost done — we emailed a confirmation link to ${email}. Open it, then sign in here.`,
        },
      });
      return null;
    }
    navigate('/onboarding', { replace: true });
    return null;
  };

  return (
    <AuthForm
      eyebrow="Create account"
      heading="Create your account"
      subtitle="A few quiet minutes now can save someone days of guessing later."
      submitLabel="Create account"
      submittingLabel="Creating account..."
      askName
      askConfirmPassword
      onSubmit={handleSignUp}
      switchTo="/login"
      switchText="Already have an account?"
      switchLinkText="Sign in"
    />
  );
}