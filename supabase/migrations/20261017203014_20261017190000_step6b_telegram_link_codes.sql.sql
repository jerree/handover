/*
# Step 6B: Telegram link codes

1. New Tables
- `telegram_link_codes`
  - `id` (uuid, primary key)
  - `business_id` (uuid, not null, references businesses, on delete cascade)
  - `code_hash` (text, not null, unique; SHA-256 hex of the raw code — raw codes
    are never stored here)
  - `created_at` (timestamptz, not null, default now())
  - `expires_at` (timestamptz, not null; codes live 15 minutes)
  - `used_at` (timestamptz, null until the code was consumed by the bot)

2. Security
- RLS enabled on `telegram_link_codes` with NO policies: owners and the public
  cannot read or write it through the Data API. Codes are created, validated
  and consumed only inside edge functions using the service role key.
- No changes to RLS on existing tables.

3. Important notes
- Raw link codes (8-10 random characters) are generated inside the
  "telegram-link" edge function and only their SHA-256 hash is stored.
- Single use: the webhook claims a code with a conditional update on used_at.
- Rate limiting (5 codes per business per hour) uses the existing
  `record_rate_hit` helper from the trusted-person migration.
*/

CREATE TABLE IF NOT EXISTS public.telegram_link_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  code_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

CREATE INDEX IF NOT EXISTS telegram_link_codes_business_id_idx
ON public.telegram_link_codes (business_id);

ALTER TABLE public.telegram_link_codes ENABLE ROW LEVEL SECURITY;

-- No policies: the table is fully closed to clients; service-role edge functions only.
