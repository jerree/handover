import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { usePageTitle } from '@/lib/pageTitle';
import { FaqIllustration } from '@/components/FaqIllustration';
import { Logo } from '@/components/Logo';

const LADDER_STEPS = [
  { day: 'Day 0', body: 'You use Handover. The clock resets.', highlight: false },
  { day: 'Day 7', body: 'Reminder one, by email and Telegram.', highlight: false },
  { day: 'Day 8', body: 'Reminder two. One tap on \u201cI\u2019m okay\u201d stops everything.', highlight: false },
  { day: 'Day 9', body: 'Reminder three, the last chance.', highlight: false },
  { day: 'Day 10', body: 'Your trusted person receives a private link.', highlight: true },
];

const FAQ = [
  {
    q: 'What if I\u2019m just on holiday?',
    a: 'Pause monitoring until a date you choose, and nothing is sent.',
  },
  {
    q: 'Can my trusted person see everything straight away?',
    a: 'No. They only get access after every reminder goes unanswered.',
  },
  {
    q: 'Does this replace a will?',
    a: 'No. It is a practical guide for running your business, not legal advice.',
  },
  {
    q: 'What does it cost?',
    a: 'Nothing, it is free.',
  },
];

const NAV_LINKS = [
  { href: '#how', label: 'How it works' },
  { href: '#ladder', label: 'The safety ladder' },
  { href: '#privacy', label: 'Privacy' },
  { href: '#faq', label: 'FAQ' },
];

export function Landing() {
  const { session, signOut } = useAuth();
  usePageTitle(null);

  const loggedIn = !!session;
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  const ctaLabel = loggedIn ? 'Open your binder' : 'Create your binder';
  const ctaTo = loggedIn ? '/binder' : '/signup';

  return (
    <div className="lp">
      <header className={`lp-nav${scrolled ? ' lp-nav-scrolled' : ''}`}>
        <div className="lp-w lp-nav-row">
          <Link to="/" className="lp-s lp-brand" aria-label="Handover home">
            <Logo className="lp-logo" hMark />
          </Link>
          <nav className="lp-links" aria-label="Primary">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href}>
                {l.label}
              </a>
            ))}
            {loggedIn ? (
              <>
                <Link to="/binder">Dashboard</Link>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    void signOut();
                  }}
                >
                  Sign out
                </a>
              </>
            ) : (
              <Link to="/login">Log in</Link>
            )}
            <Link to={ctaTo} className="lp-btn lp-o lp-nav-cta">
              {ctaLabel}
            </Link>
          </nav>
          <button
            type="button"
            className="lp-burger"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            aria-controls="lp-menu"
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? 'Close' : 'Menu'}
          </button>
        </div>
        {menuOpen && (
          <nav id="lp-menu" className="lp-menu" aria-label="Primary mobile">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} onClick={closeMenu}>
                {l.label}
              </a>
            ))}
            {loggedIn ? (
              <>
                <Link to="/binder" onClick={closeMenu}>
                  Dashboard
                </Link>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    void signOut();
                    closeMenu();
                  }}
                >
                  Sign out
                </a>
              </>
            ) : (
              <Link to="/login" onClick={closeMenu}>
                Log in
              </Link>
            )}
            <Link to={ctaTo} className="lp-btn lp-o lp-menu-cta" onClick={closeMenu}>
              {ctaLabel}
            </Link>
          </nav>
        )}
      </header>

      <section className="lp-w lp-hero">
        <div className="lp-hero-copy">
          <div className="lp-eye">For solo and family-run businesses</div>
          <h1 className="lp-s lp-h1" style={{ margin: '20px 0 24px' }}>
            Every small business runs on one person&rsquo;s <em style={{ color: '#D9480F' }}>memory.</em>
          </h1>
          <p className="lp-hero-sub">
            Handover turns what you know into a plain-language binder, checks on you quietly, and hands
            it to someone you trust if you can&rsquo;t be reached.
          </p>
          <div className="lp-hero-cta">
            <Link to={ctaTo} className="lp-btn lp-o">
              {ctaLabel}
            </Link>
            <a href="#how" className="lp-btn lp-l">
              See how it works
            </a>
          </div>
          <p className="lp-hero-note">Takes about ten minutes.</p>
        </div>

        <div className="lp-hero-vis">
          <div className="lp-phone">
            <div className="lp-phone-screen">
              <div className="lp-eye" style={{ fontSize: 11 }}>
                First 72 hours
              </div>
              <div className="lp-s" style={{ fontSize: 26, margin: '6px 0 4px' }}>
                Bluebird Bakery
              </div>
              <div style={{ fontSize: 13, color: '#6B5545', marginBottom: 18 }}>
                What to do first, and who to call.
              </div>
              <div style={{ background: '#fff', borderRadius: 16, padding: 14, marginBottom: 10 }}>
                <b style={{ fontSize: 14 }}>1. Call the flour supplier</b>
                <div style={{ fontSize: 12, color: '#6B5545', margin: '4px 0 10px' }}>
                  Order by Tuesday 5pm or Thursday&rsquo;s baking stops.
                </div>
                <span
                  style={{
                    display: 'inline-block',
                    background: '#D9480F',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 700,
                    padding: '8px 16px',
                    borderRadius: 99,
                  }}
                >
                  Call Mr. Adeyemi
                </span>
              </div>
              <div style={{ background: '#fff', borderRadius: 16, padding: 14, marginBottom: 10 }}>
                <b style={{ fontSize: 14 }}>2. Tell the cafe about Wednesday</b>
                <div style={{ fontSize: 12, color: '#6B5545', marginTop: 4 }}>
                  40 rolls and 12 loaves at 7am.
                </div>
              </div>
              <div style={{ background: '#fff', borderRadius: 16, padding: 14 }}>
                <b style={{ fontSize: 14 }}>3. Pay the rent on the 1st</b>
              </div>
            </div>
          </div>
          <div className="lp-notif">
            <div style={{ fontSize: 12, color: '#6B5545', fontWeight: 700 }}>
              Handover &middot; just now
            </div>
            <div style={{ fontSize: 15, margin: '6px 0 12px' }}>
              <b>Are you okay?</b> We haven&rsquo;t seen you on Handover for 3 days.
            </div>
            <span
              style={{
                display: 'inline-block',
                background: '#2A1A12',
                color: '#fff',
                fontSize: 13,
                fontWeight: 700,
                padding: '10px 20px',
                borderRadius: 99,
              }}
            >
              I&rsquo;m okay
            </span>
          </div>
        </div>
      </section>

      <section className="lp-band">
        <div className="lp-w lp-band-row">
          <span>Bakeries</span>
          <span>Salons</span>
          <span>Workshops</span>
          <span>Market stalls</span>
          <span>Freelancers</span>
          <span>Family shops</span>
        </div>
      </section>

      <section className="lp-dark">
        <div className="lp-w lp-sec">
          <h2 className="lp-s lp-h2 lp-dark-title">
            When the owner goes quiet, so does the business.
          </h2>
          <div className="lp-g lp-g3">
            <div className="lp-dark-item">
              <h3 className="lp-s lp-h3">Suppliers wait</h3>
              <p>
                Orders aren&rsquo;t placed and bills aren&rsquo;t paid because only one person knows
                how.
              </p>
            </div>
            <div className="lp-dark-item">
              <h3 className="lp-s lp-h3">Customers drift</h3>
              <p>Promises and deposits sit in someone&rsquo;s head, and nobody can honour them.</p>
            </div>
            <div className="lp-dark-item">
              <h3 className="lp-s lp-h3">Family is lost</h3>
              <p>Nobody knows where the keys, the papers or the logins are kept.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="how" className="lp-w lp-sec">
        <div className="lp-eye">How it works</div>
        <h2 className="lp-s lp-h2 lp-how-h">Three steps. No forms to file.</h2>
        <div className="lp-g lp-steps">
          <div className="lp-step">
            <div className="lp-s lp-num" style={{ color: '#D9480F' }}>
              1
            </div>
            <h3 className="lp-s lp-h3">Talk it through</h3>
            <p>
              Answer a few questions out loud or in writing. Handover tidies your answers into
              suppliers, bills, routines and promises.
            </p>
          </div>
          <div className="lp-step">
            <div className="lp-s lp-num" style={{ color: '#D9480F' }}>
              2
            </div>
            <h3 className="lp-s lp-h3">Pick who to trust</h3>
            <p>
              Choose one person and decide how long we wait and how we reach you, by email or
              Telegram.
            </p>
          </div>
          <div className="lp-step">
            <div className="lp-s lp-num" style={{ color: '#D9480F' }}>
              3
            </div>
            <h3 className="lp-s lp-h3">Stay in the loop</h3>
            <p>
              Use the site as normal. If you go quiet, we ask if you&rsquo;re okay before anyone sees
              a thing.
            </p>
          </div>
        </div>
      </section>

      <section id="ladder" className="lp-ladder">
        <div className="lp-w lp-sec">
          <div className="lp-eye">The safety ladder</div>
          <h2 className="lp-s lp-h2 lp-ladder-h">
            You decide every step before anyone else gets access.
          </h2>
          <p className="lp-ladder-sub">
            Example with the default timing. Change the quiet period, the number of reminders and the
            gaps to suit you.
          </p>
          <div className="lp-g lp-lad">
            {LADDER_STEPS.map((step) => (
              <div key={step.day} className={step.highlight ? 'h' : undefined}>
                <b style={step.highlight ? { color: '#B53D0B' } : undefined}>{step.day}</b>
                <p style={{ margin: '6px 0 0', color: '#5A4638' }}>{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="privacy" className="lp-w lp-sec">
        <div className="lp-eye">Built to be trusted</div>
        <h2 className="lp-s lp-h2 lp-priv-h">Calm by design, private by default.</h2>
        <div className="lp-g lp-priv">
          <div className="lp-card lp-card-dark">
            <h3 className="lp-s lp-h3">We note when you show up, never what you do.</h3>
            <p>
              Handover records only the time you last used it. It never records what you read or
              type.
            </p>
          </div>
          <div className="lp-card">
            <h3 className="lp-s lp-h3">No secrets in the binder</h3>
            <p>Passwords and card numbers are stripped out. You note where they are kept instead.</p>
          </div>
          <div className="lp-card lp-card-tint">
            <h3 className="lp-s lp-h3">Pause for holidays</h3>
            <p>Going away? Pause monitoring until you are back.</p>
          </div>
          <div className="lp-card lp-card-tint">
            <h3 className="lp-s lp-h3">Works on any phone</h3>
            <p>Your trusted person needs no account, only the link.</p>
          </div>
          <div className="lp-card">
            <h3 className="lp-s lp-h3">Locked until it&rsquo;s needed</h3>
            <p>The handover link opens only after every reminder goes unanswered.</p>
          </div>
        </div>
      </section>

      <section id="faq" style={{ borderTop: '1px solid #E8D9C8' }}>
        <div className="lp-w lp-g lp-faq-grid">
          <div className="lp-faq-ill">
            <h2 className="lp-s lp-h2">Questions people ask</h2>
            <FaqIllustration />
          </div>
          <div>
            {FAQ.map((item) => (
              <div key={item.q} className="lp-faq-item">
                <b>{item.q}</b>
                <p>{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-w lp-cta-wrap">
        <div className="lp-cta">
          <h2 className="lp-s lp-h2">Write it down before you need it.</h2>
          <p>Ten minutes now could save your business later.</p>
          <Link to={ctaTo} className="lp-btn">
            {ctaLabel}
          </Link>
        </div>
      </section>

      <footer className="lp-foot-wrap">
        <div className="lp-w">
          <div className="lp-g lp-foot">
            <div>
              <div className="lp-s lp-foot-brand">
                <Logo variant="dark" className="lp-foot-logo" />
              </div>
              <p className="lp-foot-blurb">
                So a business can keep going when its owner can&rsquo;t be reached.
              </p>
            </div>
            <div className="lp-foot-col">
              <b style={{ color: '#FBF5EE' }}>Product</b>
              <p>
                <a href="#how">How it works</a>
                <a href="#ladder">The safety ladder</a>
                <a href="#privacy">Privacy</a>
                <a href="#faq">FAQ</a>
              </p>
            </div>
            <div className="lp-foot-col">
              <b style={{ color: '#FBF5EE' }}>Account</b>
              <p>
                {loggedIn ? (
                  <>
                    <Link to="/binder">Open your binder</Link>
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        void signOut();
                      }}
                    >
                      Sign out
                    </a>
                  </>
                ) : (
                  <>
                    <Link to="/login">Log in</Link>
                    <Link to="/signup">Create your binder</Link>
                  </>
                )}
              </p>
            </div>
          </div>
          <p className="lp-foot-legal">
            Handover is a practical guide and does not replace a will, power of attorney, or legal
            advice.
          </p>
        </div>
      </footer>
    </div>
  );
}
