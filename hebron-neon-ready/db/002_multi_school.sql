-- Release 1: REVIEW AND BACK UP FIRST. Apply ONLY to a staging Neon branch initially.
-- Safe, additive migration. No account is automatically granted platform access.
BEGIN;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS logo_path text;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE schools ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE TABLE IF NOT EXISTS platform_admins (
 user_id uuid PRIMARY KEY REFERENCES staff_users(id) ON DELETE RESTRICT,
 is_active boolean NOT NULL DEFAULT true,
 granted_at timestamptz NOT NULL DEFAULT now(),
 granted_by uuid REFERENCES staff_users(id)
);
CREATE TABLE IF NOT EXISTS user_school_memberships (
 user_id uuid NOT NULL REFERENCES staff_users(id),
 school_id uuid NOT NULL REFERENCES schools(id),
 role text NOT NULL CHECK (role IN ('teacher','accountant','office','store','canteen','sports','principal')),
 is_active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,school_id,role)
);
-- Preserve current assignments, without changing existing login semantics.
INSERT INTO user_school_memberships(user_id,school_id,role)
 SELECT u.id,u.school_id,unnest(u.roles) FROM staff_users u
 WHERE u.roles <@ ARRAY['teacher','accountant','office','store','canteen','sports','principal']::text[]
ON CONFLICT DO NOTHING;
COMMIT;
-- OPERATOR ACTIONS AFTER REVIEW (not automatically executed):
-- 1. Confirm the existing principal login email and staff ID.
-- 2. INSERT INTO platform_admins(user_id) VALUES ('<verified-staff-uuid>');
-- 3. INSERT INTO schools(name,timezone,logo_path) VALUES
--    ('True Light English Medium School','Asia/Kolkata','/true-light-logo.png');
-- 4. Review old principal accounts and revoke excess access separately.
