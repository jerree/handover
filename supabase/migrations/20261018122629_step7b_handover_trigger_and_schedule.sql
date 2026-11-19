/*
# Step 7B: Safety ladder, part 2 — handover trigger + schedule tracking

1. Plain-English summary
   When the owner stops answering reminders and the final wait expires, the app
   must open the handover exactly once, email the trusted person their link,
   and notify the owner on every verified channel. This migration adds the
   columns and table needed for that, plus a small table the scheduled run
   stamps so the owner can see the hourly schedule is alive.

2. Modified Tables
- `handover_events`: new columns
  - `notified_at` (timestamptz, nullable) — when the trusted person's email
    succeeded.
  - `notify_attempts` (int, not null, default 0) — how many email attempts made.
  - `notify_error` (text, nullable) — short safe error of the last failure.
- `escalation_log`: the `step` CHECK constraint (added NOT VALID in 7A) now
  also allows 'handover'; re-validated going forward for new rows.

3. New Tables
- `ladder_runs` (schedule heartbeat)
  - `id` (int, primary key, singleton row id = 1)
  - `last_run_at` (timestamptz, not null, default now())
  - `last_mode` (text, not null, default 'scheduled') — 'scheduled' or 'manual'
  - RLS enabled, no policies: only edge functions (service role) touch it; the
    frontend is NOT given access (the /safety page reads it through an edge
    function, never directly).

4. Security
- RLS enabled on `ladder_runs` with NO policies — fully closed to clients.
- No changes to existing table policies.

5. Important notes
- Additive only; no data removed.
- The hourly cron and CRON_SECRET are set up by the user in the Supabase
  dashboard; nothing secret is stored in project files.
*/

ALTER TABLE public.handover_events
  ADD COLUMN IF NOT EXISTS notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS notify_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notify_error text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'escalation_log_step_check'
      AND conrelid = 'public.escalation_log'::regclass
  ) THEN
    ALTER TABLE public.escalation_log DROP CONSTRAINT escalation_log_step_check;
  END IF;
  ALTER TABLE public.escalation_log
    ADD CONSTRAINT escalation_log_step_check
    CHECK (step IN ('reminder_1', 'reminder_2', 'reminder_3', 'handover'));
END;
$$;

CREATE TABLE IF NOT EXISTS public.ladder_runs (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_run_at timestamptz NOT NULL DEFAULT now(),
  last_mode text NOT NULL DEFAULT 'scheduled'
);

ALTER TABLE public.ladder_runs ENABLE ROW LEVEL SECURITY;
