/*
# Unique notification channel per business and type

1. Modified Tables
- `notification_channels`: adds a unique index on (business_id, type) so the
  Safety page can safely upsert "the email channel" for a business without
  creating duplicate rows.

2. Security
- No RLS changes.
*/

CREATE UNIQUE INDEX IF NOT EXISTS notification_channels_business_type_idx
ON public.notification_channels (business_id, type);
