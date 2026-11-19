/*
# Add question tracking for interview back/edit support

1. Plain-English summary
   Owners can now go back to earlier interview questions and re-edit their answers.
   To make re-editing replace (not duplicate) the entries an answer previously created,
   each interview-created entry now remembers which question it came from, and the
   interview remembers the owner's latest answer text per question.

2. Modified Tables
- `binder_entries`: new nullable column `question_id` (text). Entries created by the
  guided interview store their question id here; entries added by hand stay null and
  are never touched when an answer is re-submitted.
- `interview_progress`: new column `answers` (jsonb, default '{}') mapping question
  index to the owner's latest saved answer text ('' for skipped questions).

3. Security
- No policy changes: both tables already have owner-scoped RLS, and the new columns
  inherit the same protection.

4. Important notes
- Additive only; no data is removed or transformed.
*/

ALTER TABLE binder_entries ADD COLUMN IF NOT EXISTS question_id text;

ALTER TABLE interview_progress ADD COLUMN IF NOT EXISTS answers jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_binder_entries_question ON binder_entries (business_id, question_id);