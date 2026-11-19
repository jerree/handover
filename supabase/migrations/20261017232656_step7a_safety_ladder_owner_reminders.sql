/*
# Step 7A: Safety ladder, part 1 — reminders to the owner

1. Plain-English summary
   This prepares the database for the automatic reminder ladder. When an owner goes
   quiet for their chosen quiet period, the app can send "Are you okay?" reminders
   to every verified channel, keep a delivery history, and record whether the owner
   answered. The handover stage itself is NOT built here (step 7B).

2. Modified Tables
- `escalation_log`: new columns
  - `success` (boolean, nullable) — whether the send attempt for that channel worked.
  - `error` (text, nullable) — a short, safe error description (never a secret,
    token or message body).
  A CHECK constraint limits `step` to 'reminder_1', 'reminder_2', 'reminder_3',
  'handover'. It is added NOT VALID so any legacy rows with other values keep the
  table valid; new rows must comply.
- `safety_settings`: new column `monitoring_note` (text, not null, default '') —
  an optional owner-written note shown in the status panel.

3. Security
- RLS is enabled on `escalation_log`.
- One SELECT policy: signed-in owners can read rows belonging to their own business.
  No INSERT / UPDATE / DELETE policies: clients can never write escalation history;
  only server-side edge functions (service role) write it.

4. Important notes
- Additive only; no data is removed or transformed.
- `confirm_tokens` (kind 'checkin', 14-day expiry) will be created by the
  "run-ladder" edge function per channel, exactly like the existing test sends.
*/

ALTER TABLE public.escalation_log ADD COLUMN IF NOT EXISTS success boolean;
ALTER TABLE public.escalation_log ADD COLUMN IF NOT EXISTS error text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'escalation_log_step_check') THEN
    ALTER TABLE public.escalation_log
      ADD CONSTRAINT escalation_log_step_check
      CHECK (step IN ('reminder_1', 'reminder_2', 'reminder_3', 'handover'))
      NOT VALID;
  END IF;
END;
$$;

ALTER TABLE public.safety_settings ADD COLUMN IF NOT EXISTS monitoring_note text NOT NULL DEFAULT '';

ALTER TABLE public.escalation_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owners_read_own_escalation_log" ON public.escalation_log;

CREATE POLICY "owners_read_own_escalation_log"
ON public.escalation_log FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.businesses
    WHERE businesses.id = escalation_log.business_id
      AND businesses.owner_id = auth.uid()
  )
);
