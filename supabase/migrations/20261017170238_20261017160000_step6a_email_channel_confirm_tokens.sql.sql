/*
# Step 6A: Email channel + one-tap confirm page

1. New Tables
- `confirm_tokens`
  - `id` (uuid, primary key)
  - `business_id` (uuid, not null, references businesses)
  - `token_hash` (text, not null; SHA-256 hex of the raw token — raw tokens are never stored)
  - `kind` (text, not null; 'verify_email' or 'checkin')
  - `channel` (text, not null, default 'email')
  - `created_at` (timestamptz, default now())
  - `expires_at` (timestamptz, not null)
  - `used_at` (timestamptz, null until consumed)
  - unique index on token_hash (lookup key for the public confirm function)

2. Modified Tables
- `activity_events`: the kind check constraint now also allows
  'confirm_link' and 'telegram_confirm' (existing kinds unchanged).
- `escalation_log`: `responded_at` added (it did not exist).

3. Security
- RLS enabled on `confirm_tokens` with NO policies: owners and the public
  cannot read or write it through the Data API. Only edge functions using the
  service role key touch this table.
- No changes to RLS on existing tables.

4. Important notes
- Raw confirm tokens are generated inside edge functions only and only their
  SHA-256 hash is stored here.
- Rate limiting for confirm links uses the existing `rate_limits` helper used
  by other functions.
*/

CREATE TABLE IF NOT EXISTS public.confirm_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('verify_email', 'checkin')),
  channel text NOT NULL DEFAULT 'email',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

CREATE INDEX IF NOT EXISTS confirm_tokens_business_id_idx ON public.confirm_tokens (business_id);

ALTER TABLE public.confirm_tokens ENABLE ROW LEVEL SECURITY;

-- No policies: the table is fully closed to clients; service-role edge functions only.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'activity_events_kind_check' AND conrelid = 'public.activity_events'::regclass
  ) THEN
    ALTER TABLE public.activity_events ADD CONSTRAINT activity_events_kind_check
      CHECK (kind = ANY (ARRAY['login','edit','view','confirm_link','telegram_confirm']));
  ELSE
    ALTER TABLE public.activity_events DROP CONSTRAINT activity_events_kind_check;
    ALTER TABLE public.activity_events ADD CONSTRAINT activity_events_kind_check
      CHECK (kind = ANY (ARRAY['login','edit','view','confirm_link','telegram_confirm']));
  END IF;
END $$;

ALTER TABLE public.escalation_log ADD COLUMN IF NOT EXISTS responded_at timestamptz;
