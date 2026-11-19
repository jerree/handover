/*
# Trusted person + handover foundations

1. Plain-English summary
   This prepares the database for the trusted-person page and the public handover page.
   The owner can record their own name on their business, and the handover link checker
   gets a small rate-limit table so the public page cannot be hammered.

2. Modified Tables
- `businesses`: new column `owner_name` (text, default '') — the owner's own name as it
  should appear on the handover page.

3. New Tables
- `rate_limit_windows` — internal abuse protection for the public handover-access check:
  one row per IP per minute with a request count. Not exposed through the app's normal
  data API (Row Level Security is on with no policies, so only server code can touch it).

4. Security
- `rate_limit_windows` has RLS enabled and NO policies: the anon and authenticated
  roles cannot read or write it at all; only server-side code (which bypasses RLS)
  uses it.
- A helper function `record_rate_hit(ip)` atomically counts one request for an IP in
  the current minute and returns the count. Its EXECUTE privilege is revoked from the
  anon and authenticated roles so only server code can call it.

5. Important notes
- `trusted_contacts`, `safety_settings` and `handover_events` already exist from the
  core migration and are reused as-is; tokens are generated in server code only.
- Additive only; no data is removed or transformed.
*/

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS owner_name text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS rate_limit_windows (
  key text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

ALTER TABLE rate_limit_windows ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION record_rate_hit(p_key text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  window_start timestamptz := date_trunc('minute', now());
  cnt integer;
BEGIN
  INSERT INTO rate_limit_windows (key, window_start, count)
  VALUES (p_key, window_start, 1)
  ON CONFLICT (key, window_start)
  DO UPDATE SET count = rate_limit_windows.count + 1
  RETURNING count INTO cnt;
  RETURN cnt;
END;
$$;

REVOKE EXECUTE ON FUNCTION record_rate_hit FROM anon, authenticated;