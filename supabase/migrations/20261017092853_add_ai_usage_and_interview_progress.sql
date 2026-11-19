/*
# Add AI usage limits and interview progress tracking

1. Plain-English summary
   The guided interview sends the owner's answers to an AI helper that tidies them into
   binder entries. This migration adds two small tables: one to keep track of how many
   AI calls each business has used today (so costs stay capped at 10 per day), and one
   to remember which interview questions an owner has already answered, so they can
   leave and come back without losing their place.

2. New Tables
- `ai_usage` — one row per business per day: business_id, day (date), count (number of
  AI calls used that day). Primary key on (business_id, day).
- `interview_progress` — one row per business: business_id (primary key), answered
  (jsonb array of answered question indexes), updated_at.

3. Security
- Row Level Security is ENABLED on both tables.
- All policies are scoped `TO authenticated` and use `auth.uid()`.
- Owner-scoped CRUD via a subquery checking the parent business belongs to the
  signed-in owner (`EXISTS (... businesses.owner_id = auth.uid())`), matching the
  pattern used by every other child table.

4. Important notes
- No destructive operations; statements are idempotent-safe.
- The AI API key itself is never stored in the database; it lives in an edge function
  secret named AI_API_KEY.
*/

CREATE TABLE IF NOT EXISTS ai_usage (
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  day date NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (business_id, day)
);

CREATE TABLE IF NOT EXISTS interview_progress (
  business_id uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  answered jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_ai_usage" ON ai_usage;
CREATE POLICY "select_own_ai_usage" ON ai_usage FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM businesses b WHERE b.id = ai_usage.business_id AND b.owner_id = auth.uid()));

DROP POLICY IF EXISTS "insert_own_ai_usage" ON ai_usage;
CREATE POLICY "insert_own_ai_usage" ON ai_usage FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM businesses b WHERE b.id = ai_usage.business_id AND b.owner_id = auth.uid()));

DROP POLICY IF EXISTS "update_own_ai_usage" ON ai_usage;
CREATE POLICY "update_own_ai_usage" ON ai_usage FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM businesses b WHERE b.id = ai_usage.business_id AND b.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM businesses b WHERE b.id = ai_usage.business_id AND b.owner_id = auth.uid()));

DROP POLICY IF EXISTS "delete_own_ai_usage" ON ai_usage;
CREATE POLICY "delete_own_ai_usage" ON ai_usage FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM businesses b WHERE b.id = ai_usage.business_id AND b.owner_id = auth.uid()));

DROP POLICY IF EXISTS "select_own_interview_progress" ON interview_progress;
CREATE POLICY "select_own_interview_progress" ON interview_progress FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM businesses b WHERE b.id = interview_progress.business_id AND b.owner_id = auth.uid()));

DROP POLICY IF EXISTS "insert_own_interview_progress" ON interview_progress;
CREATE POLICY "insert_own_interview_progress" ON interview_progress FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM businesses b WHERE b.id = interview_progress.business_id AND b.owner_id = auth.uid()));

DROP POLICY IF EXISTS "update_own_interview_progress" ON interview_progress;
CREATE POLICY "update_own_interview_progress" ON interview_progress FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM businesses b WHERE b.id = interview_progress.business_id AND b.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM businesses b WHERE b.id = interview_progress.business_id AND b.owner_id = auth.uid()));

DROP POLICY IF EXISTS "delete_own_interview_progress" ON interview_progress;
CREATE POLICY "delete_own_interview_progress" ON interview_progress FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM businesses b WHERE b.id = interview_progress.business_id AND b.owner_id = auth.uid()));