-- Step 8: sample data flag for demo controls
ALTER TABLE binder_entries ADD COLUMN IF NOT EXISTS is_sample boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_binder_entries_sample ON binder_entries (business_id, is_sample);