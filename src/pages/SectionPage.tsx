import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2, X, AlertTriangle, Contact2 } from 'lucide-react';
import { supabase, SECTIONS } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useActivityTracking } from '@/lib/activity';
import { usePageTitle } from '@/lib/pageTitle';
import type { BinderEntry } from '@/lib/supabase';

interface EntryFormValues {
  title: string;
  body: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
}

const EMPTY_FORM: EntryFormValues = {
  title: '',
  body: '',
  contact_name: '',
  contact_phone: '',
  contact_email: '',
};

export function SectionPage() {
  usePageTitle('Binder section');
  const { section } = useParams<{ section: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();

  const def = SECTIONS.find((s) => s.id === section);
  const validSection = def && SECTIONS.some((s) => s.id === section) ? section! : null;

  const [entries, setEntries] = useState<BinderEntry[]>([]);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<EntryFormValues>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { track } = useActivityTracking({ businessId, kind: 'view' });

  useEffect(() => {
    if (!validSection || !session) return;
    const load = async () => {
      setLoading(true);
      const { data: biz } = await supabase
        .from('businesses')
        .select('id')
        .eq('owner_id', session.user.id)
        .maybeSingle();
      if (!biz) {
        navigate('/onboarding', { replace: true });
        return;
      }
      setBusinessId(biz.id);

      const { data: rows, error: rowsError } = await supabase
        .from('binder_entries')
        .select('*')
        .eq('business_id', biz.id)
        .eq('section', validSection)
        .order('priority', { ascending: false })
        .order('updated_at', { ascending: false });

      if (!rowsError && rows) {
        setEntries(rows as BinderEntry[]);
      }
      setLoading(false);
    };
    void load();
  }, [validSection, session, navigate]);

  if (!def || !validSection) {
    return <NavigateOrEmpty />;
  }

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setFormOpen(true);
    setError(null);
  };

  const openEdit = (entry: BinderEntry) => {
    setForm({
      title: entry.title,
      body: entry.body,
      contact_name: entry.contact_name,
      contact_phone: entry.contact_phone,
      contact_email: entry.contact_email,
    });
    setEditingId(entry.id);
    setFormOpen(true);
    setError(null);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!businessId) return;
    setBusy(true);
    setError(null);

    const values = {
      section: validSection,
      title: form.title.trim(),
      body: form.body.trim(),
      contact_name: form.contact_name.trim(),
      contact_phone: form.contact_phone.trim(),
      contact_email: form.contact_email.trim(),
    };

    let dbError: { message: string } | null = null;
    if (editingId) {
      const { error: updError } = await supabase
        .from('binder_entries')
        .update({ ...values, updated_at: new Date().toISOString() })
        .eq('id', editingId);
      dbError = updError;
    } else {
      const { data: inserted, error: insError } = await supabase
        .from('binder_entries')
        .insert({ ...values, business_id: businessId })
        .select()
        .single();
      dbError = insError;
      if (!insError && inserted) {
        setEntries((prev) => [inserted as BinderEntry, ...prev]);
      }
    }

    setBusy(false);
    if (dbError) {
      setError('We could not save that entry. Please try again.');
      return;
    }
    track('edit');
    if (editingId) {
      setEntries((prev) =>
        prev.map((entry) =>
          entry.id === editingId ? { ...entry, ...values, updated_at: new Date().toISOString() } : entry
        )
      );
    }
    closeForm();
  };

  const confirmDelete = async () => {
    if (!deletingId) return;
    setBusy(true);
    const { error: delError } = await supabase
      .from('binder_entries')
      .delete()
      .eq('id', deletingId);
    setBusy(false);
    if (delError) {
      setError('We could not delete that entry. Please try again.');
      setDeletingId(null);
      return;
    }
    setEntries((prev) => prev.filter((entry) => entry.id !== deletingId));
    track('edit');
    setDeletingId(null);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <Link
        to="/binder"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-brand-600 transition-colors"
      >
        <ArrowLeft size={16} />
        Back to binder
      </Link>

      <div className="mt-4 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-charcoal">{def.title}</h1>
          <p className="mt-1 text-muted">{def.blurb}</p>
        </div>
        {!formOpen && (
          <button
            onClick={openAdd}
            className="shrink-0 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            Add entry
          </button>
        )}
      </div>

      {/* Entry form */}
      {formOpen && (
        <div className="mt-6 bg-white border border-brand-200 rounded-2xl shadow-sm p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-charcoal">
              {editingId ? 'Edit entry' : 'New entry'}
            </h2>
            <button
              onClick={closeForm}
              className="p-2 rounded-lg text-muted hover:text-charcoal hover:bg-brand-50 transition-colors"
              aria-label="Close form"
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label htmlFor="entry-title" className="block text-sm font-semibold text-charcoal mb-1.5">
                Title
              </label>
              <input
                id="entry-title"
                type="text"
                required
                maxLength={120}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder={def.placeholder}
                className="w-full rounded-xl border border-brand-100 bg-page/60 px-4 py-3 text-charcoal placeholder:text-muted/60 focus:border-brand-400 transition-colors"
              />
            </div>

            <div>
              <label htmlFor="entry-body" className="block text-sm font-semibold text-charcoal mb-1.5">
                Details <span className="font-normal text-muted">(optional)</span>
              </label>
              <textarea
                id="entry-body"
                rows={4}
                maxLength={5000}
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                placeholder="Whatever someone would need to know — plain and simple."
                className="w-full rounded-xl border border-brand-100 bg-page/60 px-4 py-3 text-charcoal placeholder:text-muted/60 focus:border-brand-400 transition-colors resize-y"
              />
            </div>

            <div className="rounded-xl bg-brand-50 border border-brand-100 p-4">
              <p className="flex items-start gap-2 text-sm text-charcoal">
                <Contact2 size={16} className="mt-0.5 shrink-0 text-brand-500" />
                <span>
                  <span className="font-semibold">A person to reach?</span> You can add their name
                  and how to get in touch. Optional.
                </span>
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <input
                  type="text"
                  maxLength={120}
                  value={form.contact_name}
                  onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                  placeholder="Name"
                  aria-label="Contact name"
                  className="w-full rounded-lg border border-brand-100 bg-white px-3 py-2.5 text-charcoal placeholder:text-muted/60 focus:border-brand-400 transition-colors"
                />
                <input
                  type="tel"
                  maxLength={40}
                  value={form.contact_phone}
                  onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                  placeholder="Phone"
                  aria-label="Contact phone"
                  className="w-full rounded-lg border border-brand-100 bg-white px-3 py-2.5 text-charcoal placeholder:text-muted/60 focus:border-brand-400 transition-colors"
                />
                <input
                  type="email"
                  maxLength={120}
                  value={form.contact_email}
                  onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                  placeholder="Email"
                  aria-label="Contact email"
                  className="w-full rounded-lg border border-brand-100 bg-white px-3 py-2.5 text-charcoal placeholder:text-muted/60 focus:border-brand-400 transition-colors"
                />
              </div>
            </div>

            <p className="text-sm text-muted">
              Don't enter passwords or card numbers. Write where they are kept instead.
            </p>

            {error && (
              <p className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
                {error}
              </p>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {busy ? 'Saving...' : editingId ? 'Save changes' : 'Save entry'}
              </button>
              <button
                type="button"
                onClick={closeForm}
                className="inline-flex items-center justify-center rounded-xl border border-brand-200 bg-white px-5 py-3 font-semibold text-charcoal hover:border-brand-400 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Entry list */}
      <div className="mt-6 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
          </div>
        ) : entries.length === 0 ? (
          <div className="bg-white border border-dashed border-brand-200 rounded-2xl p-8 text-center">
            <p className="text-charcoal font-semibold">Nothing here yet</p>
            <p className="mt-1 text-muted">
              {formOpen
                ? 'Save your first entry with the form above.'
                : 'This section is empty. One small note is a great start.'}
            </p>
            {!formOpen && (
              <button
                onClick={openAdd}
                className="mt-4 inline-flex rounded-xl bg-brand-100 px-4 py-2.5 font-semibold text-brand-700 hover:bg-brand-200 transition-colors"
              >
                Write the first entry
              </button>
            )}
          </div>
        ) : (
          entries.map((entry) => (
            <article
              key={entry.id}
              className="bg-white border border-brand-100 rounded-2xl p-5 sm:p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-bold text-charcoal break-words">{entry.title}</h3>
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => openEdit(entry)}
                    className="p-2 rounded-lg text-muted hover:text-brand-600 hover:bg-brand-50 transition-colors"
                    aria-label={`Edit ${entry.title}`}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => setDeletingId(entry.id)}
                    className="p-2 rounded-lg text-muted hover:text-red-600 hover:bg-red-50 transition-colors"
                    aria-label={`Delete ${entry.title}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {entry.body && (
                <p className="mt-2 text-charcoal/90 leading-relaxed whitespace-pre-wrap">
                  {entry.body}
                </p>
              )}

              {(entry.contact_name || entry.contact_phone || entry.contact_email) && (
                <div className="mt-3 rounded-xl bg-brand-50 border border-brand-100 px-4 py-3 text-sm">
                  <p className="font-semibold text-charcoal">
                    {entry.contact_name || 'Contact'}
                  </p>
                  <p className="mt-0.5 text-muted">
                    {[entry.contact_phone, entry.contact_email].filter(Boolean).join(' · ')}
                  </p>
                </div>
              )}

              <p className="mt-3 text-xs text-muted">
                Updated{' '}
                {new Date(entry.updated_at).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </p>
            </article>
          ))
        )}
      </div>

      {/* Delete confirmation */}
      {deletingId && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-charcoal/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-xl">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center">
                <AlertTriangle size={20} />
              </span>
              <h3 className="text-lg font-bold text-charcoal">Delete this entry?</h3>
            </div>
            <p className="mt-3 text-muted">
              This note will be removed from your binder. This cannot be undone.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => void confirmDelete()}
                disabled={busy}
                className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 font-semibold text-white hover:bg-red-700 transition-colors disabled:opacity-60"
              >
                {busy ? 'Deleting...' : 'Delete'}
              </button>
              <button
                onClick={() => setDeletingId(null)}
                disabled={busy}
                className="flex-1 rounded-xl border border-brand-200 bg-white px-4 py-2.5 font-semibold text-charcoal hover:border-brand-400 transition-colors disabled:opacity-60"
              >
                Keep it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NavigateOrEmpty() {
  return (
    <div className="max-w-xl mx-auto px-4 py-16 text-center">
      <p className="text-muted">We couldn't find that section.</p>
      <Link
        to="/binder"
        className="mt-4 inline-flex rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700 transition-colors"
      >
        Back to my binder
      </Link>
    </div>
  );
}
