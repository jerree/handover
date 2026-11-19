/*
# Create Handover core tables (multi-user, owner-scoped)

1. Plain-English summary
   Handover lets solo business owners record how their business runs ("binder entries")
   across 7 sections. Each owner signs in with email/password and only ever sees and
   edits their own business and its rows. This migration creates every table the app
   will need, all protected by Row Level Security.

2. New Tables
- `businesses` — one business per owner: id, owner_id, name, type, description, created_at.
- `binder_entries` — entries in a binder section: business_id, section
  (first_72 | people | money | routines | locations | promises | templates), title, body,
  contact_name, contact_phone, contact_email, priority (int, default 0), source_text, updated_at.
- `trusted_contacts` — people who may be given access later: business_id, name, email,
  relationship, access_token (unique), created_at.
- `safety_settings` — quiet-period configuration, one row per business: business_id (primary key),
  quiet_days (default 7), reminder_count (default 3), reminder_gap_hours (default 24),
  final_wait_hours (default 24), channels (jsonb, default {"email":true,"telegram":false}),
  paused_until, status (default 'active'), last_activity_at, reminders_sent (default 0),
  last_reminder_at.
- `activity_events` — audit trail of owner activity: business_id, kind, created_at.
- `notification_channels` — where notices can be sent: business_id, type, address,
  verified (default false), enabled (default true).
- `escalation_log` — record of escalation steps: business_id, step, channel, sent_at, responded_at.
- `handover_events` — record of handover triggers: business_id, triggered_at, trigger_type, accessed_at.

3. Security
- Row Level Security is ENABLED on every table.
- All policies are scoped `TO authenticated` and use `auth.uid()`.
- `businesses`: owner-scoped CRUD via `owner_id = auth.uid()`.
- All child tables: owner-scoped CRUD via a subquery checking the parent business belongs
  to the signed-in owner (`EXISTS (... businesses.owner_id = auth.uid())`).
- `safety_settings` uses business_id as its primary key; policies use the same subquery.

4. Important notes
- No destructive operations; all statements are idempotent-safe (IF NOT EXISTS / DROP POLICY IF EXISTS first).
- Foreign keys cascade on business delete so removing a business cleans up its rows.
*/

-- Businesses: one owner, one business
CREATE TABLE IF NOT EXISTS businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Binder entries across the 7 sections
CREATE TABLE IF NOT EXISTS binder_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  section text NOT NULL CHECK (section IN ('first_72','people','money','routines','locations','promises','templates')),
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  contact_name text NOT NULL DEFAULT '',
  contact_phone text NOT NULL DEFAULT '',
  contact_email text NOT NULL DEFAULT '',
  priority integer NOT NULL DEFAULT 0,
  source_text text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Trusted people who may receive the binder
CREATE TABLE IF NOT EXISTS trusted_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL DEFAULT '',
  relationship text NOT NULL DEFAULT '',
  access_token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Quiet-period / escalation settings (one row per business)
CREATE TABLE IF NOT EXISTS safety_settings (
  business_id uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  quiet_days integer NOT NULL DEFAULT 7,
  reminder_count integer NOT NULL DEFAULT 3,
  reminder_gap_hours integer NOT NULL DEFAULT 24,
  final_wait_hours integer NOT NULL DEFAULT 24,
  channels jsonb NOT NULL DEFAULT '{"email":true,"telegram":false}'::jsonb,
  paused_until timestamptz,
  status text NOT NULL DEFAULT 'active',
  last_activity_at timestamptz,
  reminders_sent integer NOT NULL DEFAULT 0,
  last_reminder_at timestamptz
);

-- Audit trail of owner activity
CREATE TABLE IF NOT EXISTS activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Channels notifications can be sent through
CREATE TABLE IF NOT EXISTS notification_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  type text NOT NULL,
  address text NOT NULL,
  verified boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true
);

-- Log of escalation steps
CREATE TABLE IF NOT EXISTS escalation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  step text NOT NULL,
  channel text NOT NULL DEFAULT '',
  sent_at timestamptz,
  responded_at timestamptz
);

-- Log of handover triggers / accesses
CREATE TABLE IF NOT EXISTS handover_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  trigger_type text NOT NULL DEFAULT '',
  accessed_at timestamptz
);

-- Indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_binder_entries_business_section ON binder_entries (business_id, section);
CREATE INDEX IF NOT EXISTS idx_businesses_owner ON businesses (owner_id);
CREATE INDEX IF NOT EXISTS idx_trusted_contacts_business ON trusted_contacts (business_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_business ON activity_events (business_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notification_channels_business ON notification_channels (business_id);
CREATE INDEX IF NOT EXISTS idx_escalation_log_business ON escalation_log (business_id);
CREATE INDEX IF NOT EXISTS idx_handover_events_business ON handover_events (business_id);

-- Enable RLS everywhere
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE binder_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE trusted_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalation_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE handover_events ENABLE ROW LEVEL SECURITY;

-- businesses: owner-scoped CRUD
DROP POLICY IF EXISTS "select_own_businesses" ON businesses;
CREATE POLICY "select_own_businesses" ON businesses FOR SELECT
  TO authenticated USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "insert_own_businesses" ON businesses;
CREATE POLICY "insert_own_businesses" ON businesses FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "update_own_businesses" ON businesses;
CREATE POLICY "update_own_businesses" ON businesses FOR UPDATE
  TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "delete_own_businesses" ON businesses;
CREATE POLICY "delete_own_businesses" ON businesses FOR DELETE
  TO authenticated USING (auth.uid() = owner_id);

-- Child tables: scoped through the parent business's owner
DROP POLICY IF EXISTS "select_own_binder_entries" ON binder_entries;
CREATE POLICY "select_own_binder_entries" ON binder_entries FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM businesses b WHERE b.id = binder_entries.business_id AND b.owner_id = auth.uid()));

DROP POLICY IF EXISTS "insert_own_binder_entries" ON binder_entries;
CREATE POLICY "insert_own_binder_entries" ON binder_entries FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM businesses b WHERE b.id = binder_entries.business_id AND b.owner_id = auth.uid()));

DROP POLICY IF EXISTS "update_own_binder_entries" ON binder_entries;
CREATE POLICY "update_own_binder_entries" ON binder_entries FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM businesses b WHERE b.id = binder_entries.business_id AND b.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM businesses b WHERE b.id = binder_entries.business_id AND b.owner_id = auth.uid()));

DROP POLICY IF EXISTS "delete_own_binder_entries" ON binder_entries;
CREATE POLICY "delete_own_binder_entries" ON binder_entries FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM businesses b WHERE b.id = binder_entries.business_id AND b.owner_id = auth.uid()));

DROP POLICY IF EXISTS "select_own_trusted_contacts" ON trusted_contacts;
CREATE POLICY "select_own_trusted_contacts" ON trusted_contacts FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM businesses b WHERE b.id = trusted_contacts.business_id AND b.owner_id = auth.uid()));

DROP POLICY IF EXISTS "insert_own_trusted_contacts" ON trusted_contacts;
CREATE POLICY "insert_own_trusted_contacts" ON trusted_contacts FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM businesses b WHERE b.id = trusted_contacts.business_id AND b.owner_id = auth.uid()));

DROP POLICY IF EXISTS "update_own_trusted_contacts" ON trusted_contacts;
CREATE POLICY "update_own_trusted_contacts" ON trusted_contacts FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM businesses b WHERE b.id = trusted_contacts.business_id AND b.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM businesses b WHERE b.id = trusted_contacts.business_id AND b.owner_id = auth.uid()));

DROP POLICY IF EXISTS "delete_own_trusted_contacts" ON trusted_contacts;
CREATE POLICY "delete_own_trusted_contacts" ON trusted_contacts FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM businesses b WHERE b.id = trusted_contacts.business_id AND b.owner_id = auth.uid()));

DROP POLICY IF EXISTS "select_own_safety_settings" ON safety_settings;
CREATE POLICY "select_own_safety_settings" ON safety_settings FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM businesses b WHERE b.id = safety_settings.business_id AND b.owner_id = auth.uid()));

DROP POLICY IF EXISTS "insert_own_safety_settings" ON safety_settings;
CREATE POLICY "insert_own_safety_settings" ON safety_settings FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM businesses b WHERE b.id = safety_settings.business_id AND b.owner_id = auth.uid()));

DROP POLICY IF EXISTS "update_own_safety_settings" ON safety_settings;
CREATE POLICY "update_own_safety_settings" ON safety_settings FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM businesses b WHERE b.id = safety_settings.business_id AND b.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM businesses b WHERE b.id = safety_settings.business_id AND b.owner_id = auth.uid()));

DROP POLICY IF EXISTS "delete_own_safety_settings" ON safety_settings;
CREATE POLICY "delete_own_safety_settings" ON safety_settings FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM businesses b WHERE b.id = safety_settings.business_id AND b.owner_id = auth.uid()));

DROP POLICY IF EXISTS "select_own_activity_events" ON activity_events;
CREATE POLICY "select_own_activity_events" ON activity_events FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM businesses b WHERE b.id = activity_events.business_id AND b.owner_id = auth.uid()));

DROP POLICY IF EXISTS "insert_own_activity_events" ON activity_events;
CREATE POLICY "insert_own_activity_events" ON activity_events FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM businesses b WHERE b.id = activity_events.business_id AND b.owner_id = auth.uid()));

DROP POLICY IF EXISTS "update_own_activity_events" ON activity_events;
CREATE POLICY "update_own_activity_events" ON activity_events FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM businesses b WHERE b.id = activity_events.business_id AND b.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM businesses b WHERE b.id = activity_events.business_id AND b.owner_id = auth.uid()));

DROP POLICY IF EXISTS "delete_own_activity_events" ON activity_events;
CREATE POLICY "delete_own_activity_events" ON activity_events FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM businesses b WHERE b.id = activity_events.business_id AND b.owner_id = auth.uid()));

DROP POLICY IF EXISTS "select_own_notification_channels" ON notification_channels;
CREATE POLICY "select_own_notification_channels" ON notification_channels FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM businesses b WHERE b.id = notification_channels.business_id AND b.owner_id = auth.uid()));

DROP POLICY IF EXISTS "insert_own_notification_channels" ON notification_channels;
CREATE POLICY "insert_own_notification_channels" ON notification_channels FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM businesses b WHERE b.id = notification_channels.business_id AND b.owner_id = auth.uid()));

DROP POLICY IF EXISTS "update_own_notification_channels" ON notification_channels;
CREATE POLICY "update_own_notification_channels" ON notification_channels FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM businesses b WHERE b.id = notification_channels.business_id AND b.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM businesses b WHERE b.id = notification_channels.business_id AND b.owner_id = auth.uid()));

DROP POLICY IF EXISTS "delete_own_notification_channels" ON notification_channels;
CREATE POLICY "delete_own_notification_channels" ON notification_channels FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM businesses b WHERE b.id = notification_channels.business_id AND b.owner_id = auth.uid()));

DROP POLICY IF EXISTS "select_own_escalation_log" ON escalation_log;
CREATE POLICY "select_own_escalation_log" ON escalation_log FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM businesses b WHERE b.id = escalation_log.business_id AND b.owner_id = auth.uid()));

DROP POLICY IF EXISTS "insert_own_escalation_log" ON escalation_log;
CREATE POLICY "insert_own_escalation_log" ON escalation_log FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM businesses b WHERE b.id = escalation_log.business_id AND b.owner_id = auth.uid()));

DROP POLICY IF EXISTS "update_own_escalation_log" ON escalation_log;
CREATE POLICY "update_own_escalation_log" ON escalation_log FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM businesses b WHERE b.id = escalation_log.business_id AND b.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM businesses b WHERE b.id = escalation_log.business_id AND b.owner_id = auth.uid()));

DROP POLICY IF EXISTS "delete_own_escalation_log" ON escalation_log;
CREATE POLICY "delete_own_escalation_log" ON escalation_log FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM businesses b WHERE b.id = escalation_log.business_id AND b.owner_id = auth.uid()));

DROP POLICY IF EXISTS "select_own_handover_events" ON handover_events;
CREATE POLICY "select_own_handover_events" ON handover_events FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM businesses b WHERE b.id = handover_events.business_id AND b.owner_id = auth.uid()));

DROP POLICY IF EXISTS "insert_own_handover_events" ON handover_events;
CREATE POLICY "insert_own_handover_events" ON handover_events FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM businesses b WHERE b.id = handover_events.business_id AND b.owner_id = auth.uid()));

DROP POLICY IF EXISTS "update_own_handover_events" ON handover_events;
CREATE POLICY "update_own_handover_events" ON handover_events FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM businesses b WHERE b.id = handover_events.business_id AND b.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM businesses b WHERE b.id = handover_events.business_id AND b.owner_id = auth.uid()));

DROP POLICY IF EXISTS "delete_own_handover_events" ON handover_events;
CREATE POLICY "delete_own_handover_events" ON handover_events FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM businesses b WHERE b.id = handover_events.business_id AND b.owner_id = auth.uid()));