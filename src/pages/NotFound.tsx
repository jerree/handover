import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { usePageTitle } from '@/lib/pageTitle';

export function NotFound() {
  usePageTitle('Page not found');

  return (
    <div className="max-w-xl mx-auto px-4 py-20 text-center">
      <p className="text-6xl font-bold text-brand-200">404</p>
      <h1 className="mt-4 text-2xl font-bold text-charcoal">This page doesn't exist</h1>
      <p className="mt-2 text-muted leading-relaxed">
        The link may be old, or the address may be mistyped.
      </p>
      <Link
        to="/"
        className="mt-8 inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-700 transition-colors"
      >
        <ArrowLeft size={18} />
        Go to the home page
      </Link>
    </div>
  );
}
