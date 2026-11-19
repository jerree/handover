import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Copy, Mail, Phone } from 'lucide-react';
import { StatusPage } from '@/components/StatusPage';
import { Logo } from '@/components/Logo';

export interface HandoverEntry {
  id: string;
  section: string;
  title: string;
  body: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  priority: number;
}

export interface First72Item {
  action: string;
  why: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
}

export interface HandoverData {
  business_name: string;
  owner_name: string;
  trusted_name: string;
  entries: HandoverEntry[];
  first72: First72Item[];
}

export const TABS = [
  { id: 'first_72', label: 'First 72 hours' },
  { id: 'people', label: 'People' },
  { id: 'money', label: 'Money' },
  { id: 'routines', label: 'How things run' },
  { id: 'locations', label: 'Places & access' },
  { id: 'promises', label: 'Promises & deadlines' },
  { id: 'templates', label: 'Messages' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export const BINDER_LEGAL =
  'This binder is a practical guide and does not replace a will, power of attorney, or legal advice.';

function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

function ContactPanel({
  name,
  phone,
  email,
}: {
  name: string;
  phone: string;
  email: string;
}) {
  if (!name && !phone && !email) return null;
  return (
    <div className="hv-ct">
      {name && <b>{name}</b>}
      {phone && <span>{phone}</span>}
      {email && <span>{email}</span>}
      {(phone || email) && (
        <div className="hv-row">
          {phone && (
            <a className="hv-btn" href={telHref(phone)}>
              <Phone size={18} aria-hidden="true" />
              Call
            </a>
          )}
          {email && (
            <a className="hv-btn2" href={`mailto:${email}`}>
              <Mail size={18} aria-hidden="true" />
              Email
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button type="button" className="hv-btn2 hv-copy" onClick={() => void copy()}>
      <Copy size={16} aria-hidden="true" />
      {copied ? 'Copied' : 'Copy message'}
    </button>
  );
}

function EntryArticle({
  title,
  body,
  name,
  phone,
  email,
  copyText,
}: {
  title: string;
  body: string;
  name: string;
  phone: string;
  email: string;
  copyText?: string;
}) {
  return (
    <article className="hv-ent">
      <h3 className="s">{title}</h3>
      {body && <p>{body}</p>}
      <ContactPanel name={name} phone={phone} email={email} />
      {copyText && copyText.trim() !== '' && <CopyButton text={copyText} />}
    </article>
  );
}

export function HandoverView({ data }: { data: HandoverData }) {
  const [tab, setTab] = useState<TabId>(TABS[0].id);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const bySection = useMemo(() => {
    const map: Record<string, HandoverEntry[]> = {};
    for (const entry of data.entries) {
      if (!map[entry.section]) map[entry.section] = [];
      map[entry.section].push(entry);
    }
    return map;
  }, [data.entries]);

  const urgentItems = useMemo(
    () => (bySection.first_72 ?? []).slice().sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0)),
    [bySection]
  );

  const selectTab = (index: number) => {
    setTab(TABS[index].id);
    const el = tabRefs.current[index];
    el?.focus();
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  const onTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (e.key === 'ArrowRight') next = (index + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    else return;
    e.preventDefault();
    selectTab(next);
  };

  const heading =
    data.owner_name || data.trusted_name
      ? `${data.owner_name || 'The owner'} set this up so you’d know what to do. You are not alone in this.`
      : 'This binder was set up so you’d know what to do. You are not alone in this.';

  const entries = bySection[tab] ?? [];

  return (
    <div className="hv-page">
      <header className="hv-top">
        <Logo className="hv-logo" />
      </header>

      <main className="hv-wrap">
        {data.business_name && <div className="hv-eye">{data.business_name}</div>}
        <h1 ref={headingRef} tabIndex={-1} className="s hv-h1">
          {heading}
        </h1>

        <div className="hv-tabs" role="tablist" aria-label="Binder sections">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`hv-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="hv-panel"
              tabIndex={tab === t.id ? 0 : -1}
              className="hv-tab"
              onClick={() => setTab(t.id)}
              onKeyDown={(e) => onTabKeyDown(e, i)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div role="tabpanel" id="hv-panel" aria-labelledby={`hv-tab-${tab}`}>
          {tab === 'first_72' ? (
            data.first72 && data.first72.length > 0 ? (
              <ol className="hv-ol">
                {data.first72.map((item, i) => (
                  <li key={i} className="hv-li">
                    <span className="hv-num" aria-hidden="true">
                      {i + 1}
                    </span>
                    <EntryArticle
                      title={item.action}
                      body={item.why}
                      name={item.contact_name}
                      phone={item.contact_phone}
                      email={item.contact_email}
                    />
                  </li>
                ))}
              </ol>
            ) : urgentItems.length > 0 ? (
              <ol className="hv-ol">
                {urgentItems.map((entry, i) => (
                  <li key={entry.id} className="hv-li">
                    <span className="hv-num" aria-hidden="true">
                      {i + 1}
                    </span>
                    <EntryArticle
                      title={entry.title}
                      body={entry.body}
                      name={entry.contact_name}
                      phone={entry.contact_phone}
                      email={entry.contact_email}
                    />
                  </li>
                ))}
              </ol>
            ) : (
              <div className="hv-ent hv-empty">No entries yet.</div>
            )
          ) : entries.length === 0 ? (
            <div className="hv-ent hv-empty">No entries in this section yet.</div>
          ) : (
            <ol className="hv-ol">
              {entries.map((entry, i) => (
                <li key={entry.id} className="hv-li">
                  <span className="hv-num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <EntryArticle
                    title={entry.title}
                    body={entry.body}
                    name={entry.contact_name}
                    phone={entry.contact_phone}
                    email={entry.contact_email}
                    copyText={tab === 'templates' ? entry.body || entry.title : undefined}
                  />
                </li>
              ))}
            </ol>
          )}
        </div>
      </main>

      <footer className="hv-foot">{BINDER_LEGAL}</footer>
    </div>
  );
}

export function LockedState({ error = false }: { error?: boolean }) {
  return (
    <StatusPage
      binder
      icon={error ? 'alert' : 'shield'}
      error={error}
      sand={!error}
      eyebrow={error ? 'Link not found' : 'Not opened yet'}
      heading="This binder has not been opened at its owner’s request yet."
      paragraph="If you have been given this link, keep it somewhere safe. When it is needed, it will open on its own."
      footerText={BINDER_LEGAL}
    />
  );
}