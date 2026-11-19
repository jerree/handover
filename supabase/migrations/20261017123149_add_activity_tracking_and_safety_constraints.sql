/*
# Activity tracking + safety settings guardrails

1. Plain-English summary
   This prepares the database for the monitoring feature. Safety settings now reject
   impossible values at the database level, every existing business gets a settings
   row, and a server function records owner activity with throttling and status rules.

2. Modified Tables
- `safety_settings`: new CHECK constraints so the database itself rejects bad values:
  quiet_days must be 3, 5, 7, 14 or 30; reminder_count must be 1, 2 or 3;
  reminder_gap_hours must be 12, 24, 48 or 72; final_wait_hours must be 24, 48 or 72.
  All existing rows already use allowed defaults, so the constraints are safe to add.
- `activity_events`: new CHECK constraint that kind must be 'login', 'edit' or 'view'.
  The table stores only the business, the kind and the time — never what the owner
  read or typed.

3. Backfill
- Every business that has no safety_settings row gets one created with defaults and
  last_activity_at set to now.

4. New Function
- `record_activity(p_business_id, p_kind)` — callable by signed-in owners only.
  Verifies the caller owns the business, then:
  - creates the safety_settings row if missing;
  - if status is 'handover_triggered', does nothing (the owner must close it manually);
  - throttles to at most one write per business every 5 minutes;
  - otherwise inserts an activity_events row, updates last_activity_at, and if the
    status was 'reminding' resets it to 'active' with reminders_sent 0.

5. Security
- The function is SECURITY DEFINER with a fixed search_path, runs the ownership check
  with auth.uid(), and its EXECUTE privilege is revoked from anon/public and granted
  only to authenticated. It never accepts a user id from the client.
- No new tables; no policies change.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'safety_settings_quiet_days_check') THEN
    ALTER TABLE safety_settings ADD CONSTRAINT safety_settings_quiet_days_check
      CHECK (quiet_days IN (3, 5, 7, 14, 30));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'safety_settings_reminder_count_check') THEN
    ALTER TABLE safety_settings ADD CONSTRAINT safety_settings_reminder_count_check
      CHECK (reminder_count IN (1, 2, 3));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'safety_settings_reminder_gap_hours_check') THEN
    ALTER TABLE safety_settings ADD CONSTRAINT safety_settings_reminder_gap_hours_check
      CHECK (reminder_gap_hours IN (12, 24, 48, 72));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'safety_settings_final_wait_hours_check') THEN
    ALTER TABLE safety_settings ADD CONSTRAINT safety_settings_final_wait_hours_check
      CHECK (final_wait_hours IN (24, 48, 72));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_events_kind_check') THEN
    ALTER TABLE activity_events ADD CONSTRAINT activity_events_kind_check
      CHECK (kind IN ('login', 'edit', 'view'));
  END IF;
END;
$$;

INSERT INTO safety_settings (business_id, last_activity_at)
SELECT b.id, now()
FROM businesses b
WHERE NOT EXISTS (SELECT 1 FROM safety_settings s WHERE s.business_id = b.id);

CREATE OR REPLACE FUNCTION record_activity(p_business_id uuid, p_kind text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_status text;
  last_act timestamptz;
BEGIN
  IF p_kind NOT IN ('login', 'edit', 'view') THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM businesses
    WHERE id = p_business_id AND owner_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  INSERT INTO safety_settings (business_id, last_activity_at)
  VALUES (p_business_id, now())
  ON CONFLICT (business_id) DO NOTHING;

  SELECT status, last_activity_at INTO current_status, last_act
  FROM safety_settings
  WHERE business_id = p_business_id;

  IF current_status = 'handover_triggered' THEN
    RETURN;
  END IF;

  IF last_act IS NOT NULL AND last_act > now() - interval '5 minutes' THEN
    RETURN;
  END IF;

  INSERT INTO activity_events (business_id, kind) VALUES (p_business_id, p_kind);

  UPDATE safety_settings
  SET last_activity_at = now(),
      status = CASE WHEN status = 'reminding' THEN 'active' ELSE status END,
      reminders_sent = CASE WHEN status = 'reminding' THEN 0 ELSE reminders_sent END
  WHERE business_id = p_business_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION record_activity(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION record_activity(uuid, text) TO authenticated;