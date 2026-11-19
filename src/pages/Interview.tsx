import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, PartyPopper } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useActivityTracking } from '@/lib/activity';
import { INTERVIEW_QUESTIONS } from '@/lib/interviewQuestions';
import { usePageTitle } from '@/lib/pageTitle';
import type { BinderEntry } from '@/lib/supabase';

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

function getRecognition(): SpeechRecognitionLike | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return null;
  return new Ctor();
}

type Status = 'loading' | 'done' | 'question';

export function Interview() {
  usePageTitle('Guided interview');
  const navigate = useNavigate();
  const { session } = useAuth();

  const [status, setStatus] = useState<Status>('loading');
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [answered, setAnswered] = useState<Set<number>>(new Set());
  const [savedAnswers, setSavedAnswers] = useState<Record<number, string>>({});
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [current, setCurrent] = useState(0);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gotIt, setGotIt] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const { track } = useActivityTracking({ businessId, kind: 'view' });

  const answerRef = useRef<HTMLTextAreaElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const micSupported = typeof window !== 'undefined' && getRecognition() !== null;

  useEffect(() => {
    if (status === 'question') answerRef.current?.focus();
  }, [status, current]);

  useEffect(() => {
    const load = async () => {
      if (!session) return;
      const { data: biz, error: bizError } = await supabase
        .from('businesses')
        .select('id')
        .eq('owner_id', session.user.id)
        .maybeSingle();
      if (bizError || !biz) {
        navigate('/onboarding', { replace: true });
        return;
      }
      setBusinessId(biz.id);

      const { data: progress } = await supabase
        .from('interview_progress')
        .select('answered, answers')
        .eq('business_id', biz.id)
        .maybeSingle();

      const answeredSet = new Set<number>(
        Array.isArray(progress?.answered)
          ? (progress.answered as unknown[]).filter((n): n is number => typeof n === 'number')
          : []
      );
      const saved: Record<number, string> = {};
      if (progress?.answers && typeof progress.answers === 'object') {
        for (const [key, value] of Object.entries(progress.answers as Record<string, unknown>)) {
          const idx = Number(key);
          if (Number.isInteger(idx) && typeof value === 'string') saved[idx] = value;
        }
      }
      setAnswered(answeredSet);
      setSavedAnswers(saved);
      setDrafts({ ...saved });

      const firstOpen = INTERVIEW_QUESTIONS.findIndex((_, i) => !answeredSet.has(i));
      if (firstOpen === -1) {
        setStatus('done');
      } else {
        setCurrent(firstOpen);
        setText(saved[firstOpen] ?? '');
        setStatus('question');
      }
    };
    void load();
  }, [session, navigate]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  const markAnswered = useCallback(
    async (
      index: number,
      currentAnswered: Set<number>,
      currentSaved: Record<number, string>,
      answerText: string
    ) => {
      const next = new Set(currentAnswered);
      next.add(index);
      const nextSaved = { ...currentSaved, [index]: answerText };
      setAnswered(next);
      setSavedAnswers(nextSaved);
      if (businessId) {
        await supabase.from('interview_progress').upsert({
          business_id: businessId,
          answered: Array.from(next),
          answers: nextSaved,
          updated_at: new Date().toISOString(),
        });
      }
      return next;
    },
    [businessId]
  );

  const goTo = (index: number) => {
    setDrafts((prev) => ({ ...prev, [current]: text }));
    setCurrent(index);
    setText(drafts[index] ?? '');
    setError(null);
    setGotIt(null);
    setBusy(false);
  };

  const advanceAfter = useCallback(
    (fromIndex: number, updatedAnswered: Set<number>, updatedDrafts: Record<number, string>) => {
      let nextIdx = -1;
      for (let i = fromIndex + 1; i < INTERVIEW_QUESTIONS.length; i++) {
        if (!updatedAnswered.has(i)) {
          nextIdx = i;
          break;
        }
      }
      if (nextIdx === -1 && fromIndex + 1 < INTERVIEW_QUESTIONS.length) {
        nextIdx = fromIndex + 1;
      }
      if (nextIdx === -1) {
        setStatus('done');
      } else {
        setCurrent(nextIdx);
        setText(updatedDrafts[nextIdx] ?? '');
        setStatus('question');
      }
      setBusy(false);
    },
    []
  );

  const handleNext = async () => {
    const answer = text.trim();
    if (!answer || !businessId) return;
    const q = INTERVIEW_QUESTIONS[current];
    setBusy(true);
    setError(null);

    let entries: Partial<BinderEntry>[] | null = null;
    let tidyFailed = false;

    try {
      const { data: aiData, error: aiError } = await supabase.functions.invoke('structure-entry', {
        body: { section: q.section, question: q.prompt, raw_text: answer },
      });
      if (aiError || !aiData || !Array.isArray((aiData as { entries?: unknown }).entries)) {
        tidyFailed = true;
      } else {
        entries = (aiData as { entries: Partial<BinderEntry>[] }).entries;
      }
    } catch {
      tidyFailed = true;
    }

    const questionId = String(current);

    const { error: deleteError } = await supabase
      .from('binder_entries')
      .delete()
      .eq('business_id', businessId)
      .eq('question_id', questionId);
    if (deleteError) {
      setError('We could not replace your previous entries. Please try again.');
      setBusy(false);
      return;
    }

    const rowsToInsert =
      entries && entries.length > 0
        ? entries.map((entry) => ({
            business_id: businessId,
            section: q.section,
            title: entry.title ?? q.prompt,
            body: entry.body ?? '',
            contact_name: entry.contact_name ?? '',
            contact_phone: entry.contact_phone ?? '',
            contact_email: entry.contact_email ?? '',
            priority: typeof entry.priority === 'number' ? entry.priority : 0,
            source_text: answer,
            question_id: questionId,
          }))
        : [
            {
              business_id: businessId,
              section: q.section,
              title: q.prompt,
              body: answer,
              contact_name: '',
              contact_phone: '',
              contact_email: '',
              priority: 0,
              source_text: answer,
              question_id: questionId,
            },
          ];

    const { error: insertError } = await supabase.from('binder_entries').insert(rowsToInsert);

    if (insertError) {
      setError('We could not save that answer. Please try again.');
      setBusy(false);
      return;
    }

    const updatedAnswered = await markAnswered(current, answered, savedAnswers, answer);
    track('edit');
    const updatedDrafts = { ...drafts, [current]: answer };
    setDrafts(updatedDrafts);
    setGotIt(tidyFailed ? 'Saved. Tidying is unavailable right now.' : 'Got it.');
    window.setTimeout(() => setGotIt(null), 1800);
    advanceAfter(current, updatedAnswered, updatedDrafts);
  };

  const handleSkip = async () => {
    if (busy) return;
    setBusy(true);
    const updatedAnswered = await markAnswered(current, answered, savedAnswers, '');
    const updatedDrafts = { ...drafts, [current]: '' };
    setDrafts(updatedDrafts);
    advanceAfter(current, updatedAnswered, updatedDrafts);
  };

  const handleBack = () => {
    if (busy || current === 0) return;
    goTo(current - 1);
  };

  const toggleMic = () => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const recognition = getRecognition();
    if (!recognition) return;
    recognitionRef.current = recognition;
    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setText(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.start();
    setListening(true);
  };

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (status === 'done') {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 sm:py-24 text-center">
        <span className="inline-flex w-14 h-14 rounded-2xl bg-brand-100 text-brand-600 items-center justify-center">
          <PartyPopper size={26} />
        </span>
        <h1 className="mt-5 text-3xl sm:text-4xl font-bold text-charcoal">
          Your binder is taking shape
        </h1>
        <p className="mt-3 text-lg text-muted leading-relaxed">
          You've answered every question for now. You can come back any time — and edit anything
          in your binder.
        </p>
        <Link
          to="/binder"
          className="mt-8 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3.5 font-semibold text-white hover:bg-brand-700 transition-colors"
        >
          Back to my binder
          <ArrowRight size={18} />
        </Link>
        <div className="mt-4">
          <button
            onClick={() => {
              const lastIndex = INTERVIEW_QUESTIONS.length - 1;
              setStatus('question');
              setCurrent(lastIndex);
              setText(drafts[lastIndex] ?? '');
              setError(null);
              setGotIt(null);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-brand-200 bg-white px-5 py-3 font-semibold text-charcoal hover:border-brand-400 transition-colors"
          >
            <ArrowLeft size={16} />
            Back to last question
          </button>
        </div>
      </div>
    );
  }

  const q = INTERVIEW_QUESTIONS[current];
  const total = INTERVIEW_QUESTIONS.length;
  const answeredCount = answered.size;
  const isLast = current === total - 1;
  const nextDisabled = busy || !text.trim();

  return (
    <div style={{ maxWidth: 800 }}>
      <div className="sh-eye">Guided interview</div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          margin: '22px 0 12px',
          fontSize: 14,
          fontWeight: 700,
          color: '#5A4638',
        }}
      >
        <span>
          Question {current + 1} of {total}
        </span>
        <span>{answeredCount} answered</span>
      </div>
      <div
        className="iv-seg"
        role="progressbar"
        aria-label="Interview progress"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={current + 1}
      >
        {INTERVIEW_QUESTIONS.map((_, i) => (
          <i key={i} className={i === current ? 'c' : answered.has(i) ? 'a' : undefined} />
        ))}
      </div>
      <h1 className="s iv-h1" style={{ margin: '36px 0 14px', overflowWrap: 'break-word' }}>
        {q.prompt}
      </h1>
      <p id="iv-hint" style={{ margin: '0 0 28px', fontSize: 18, color: '#5A4638' }}>
        Type it however it comes: a list, a ramble, half sentences. We&rsquo;ll tidy it up.
      </p>
      <div className="iv-ta">
        <label htmlFor="ans" style={{ position: 'absolute', left: -9999 }}>
          Your answer
        </label>
        <textarea
          id="ans"
          ref={answerRef}
          aria-describedby="iv-hint"
          placeholder="Just start writing&hellip;"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {micSupported && (
          <button
            className="iv-sp"
            type="button"
            aria-pressed={listening}
            style={listening ? { color: '#B53D0B' } : undefined}
            onClick={toggleMic}
          >
            {listening && <span className="iv-pulse" aria-hidden="true" />}
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
            </svg>
            {listening ? 'Listening...' : 'Speak'}
          </button>
        )}
      </div>
      <div className="iv-note">
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B53D0B" strokeWidth="2">
          <path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6l8-3z" />
        </svg>
        Don&rsquo;t enter passwords or card numbers. Write where they are kept instead.
      </div>

      {savedAnswers[current] && (
        <p style={{ margin: '0 0 14px', fontSize: 14, color: '#5A4638' }}>
          Saving replaces the entries this answer created.
        </p>
      )}
      {gotIt && (
        <p style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: '#1E6B3F' }}>
          {gotIt}
        </p>
      )}
      {error && <p style={{ margin: '0 0 14px', fontSize: 14, color: '#B42318' }}>{error}</p>}

      <div
        className="iv-act"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
      >
        <button className="iv-btn2" type="button" onClick={handleBack} disabled={busy || current === 0}>
          &larr; Back
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', minWidth: 0 }}>
          <span aria-live="polite" style={{ fontSize: 14, color: '#5A4638' }}>
            {nextDisabled && !busy ? 'Write an answer, or skip this one.' : ''}
          </span>
          <button className="iv-btn2" type="button" onClick={() => void handleSkip()} disabled={busy}>
            Skip
          </button>
          <button
            className="iv-btn iv-o nx"
            type="button"
            onClick={() => void handleNext()}
            disabled={nextDisabled}
          >
            {busy ? 'Saving...' : isLast ? 'Finish' : 'Next'}
            {!busy && <ArrowRight size={18} />}
          </button>
        </div>
      </div>

      <p style={{ margin: '48px 0 0', fontSize: 14, color: '#6B5545' }}>
        Handover is a practical guide and does not replace a will, power of attorney, or legal advice.
      </p>
    </div>
  );
}
