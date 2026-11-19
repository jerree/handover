/*
# First 72 Hours AI cache

1. Plain-English summary
   Adds a small table that remembers the AI-written "First 72 Hours" action list for
   each business, so the list is generated once and reused until a binder entry
   changes. Stale content is replaced on the next request; the page falls back to
   the plain list when no valid cached content exists.

2. Tables
- `first72_cache`: one row per business.
  - business_id: references businesses, cascade on delete, primary key.
  - content: the generated action list as JSON.
  - generated_at: when it was generated; compared against binder entry changes.

3. Row Level Security
- RLS enabled. Only the owning business's signed-in owner may read or write their
  row, using the same owner check as every other child table. The server (edge
  functions) uses the service role key, which bypasses RLS.

4. Important notes
- The cache is considered stale when any binder_entries row for the business has
  updated_at > generated_at. Deletions are covered too: handover-access compares
  generated_at with the newest entry updated_at on every request, and owners can
  force regeneration with "Refresh First 72 Hours" on the trusted person page.
- No existing tables are changed.
*/

CREATE TABLE IF NOT EXISTS first72_cache (
  business_id uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  content jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE first72_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_first72_cache" ON first72_cache;
CREATE POLICY "select_own_first72_cache" ON first72_cache FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM businesses b WHERE b.id = first72_cache.business_id AND b.owner_id = auth.uid()));

DROP POLICY IF EXISTS "insert_own_first72_cache" ON first72_cache;
CREATE POLICY "insert_own_first72_cache" ON first72_cache FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM businesses b WHERE b.id = first72_cache.business_id AND b.owner_id = auth.uid()));

DROP POLICY IF EXISTS "update_own_first72_cache" ON first72_cache;
CREATE POLICY "update_own_first72_cache" ON first72_cache FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM businesses b WHERE b.id = first72_cache.business_id AND b.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM businesses b WHERE b.id = first72_cache.business_id AND b.owner_id = auth.uid()));

DROP POLICY IF EXISTS "delete_own_first72_cache" ON first72_cache;
CREATE POLICY "delete_own_first72_cache" ON first72_cache FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM businesses b WHERE b.id = first72_cache.business_id AND b.owner_id = auth.uid()));