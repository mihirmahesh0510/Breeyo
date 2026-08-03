-- Post-migration script: grants, RLS policies, and FORCE settings.
-- Run after every `prisma migrate deploy` or `prisma migrate dev`.

-- ============================================================
-- 1. GRANT table access to breeyo_app
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO breeyo_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO breeyo_app;

-- ============================================================
-- 2. ENABLE Row-Level Security on tenant-scoped tables
-- ============================================================
ALTER TABLE clinic_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_members FORCE ROW LEVEL SECURITY;

ALTER TABLE auth_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_audit_log FORCE ROW LEVEL SECURITY;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;

-- ============================================================
-- 3. RLS POLICIES for clinic_members
-- ============================================================
DROP POLICY IF EXISTS clinic_members_select ON clinic_members;
CREATE POLICY clinic_members_select ON clinic_members
  FOR SELECT USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS clinic_members_insert ON clinic_members;
CREATE POLICY clinic_members_insert ON clinic_members
  FOR INSERT WITH CHECK (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS clinic_members_update ON clinic_members;
CREATE POLICY clinic_members_update ON clinic_members
  FOR UPDATE USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS clinic_members_delete ON clinic_members;
CREATE POLICY clinic_members_delete ON clinic_members
  FOR DELETE USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

-- ============================================================
-- 4. RLS POLICIES for auth_audit_log
-- ============================================================
DROP POLICY IF EXISTS audit_log_select ON auth_audit_log;
CREATE POLICY audit_log_select ON auth_audit_log
  FOR SELECT USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS audit_log_insert ON auth_audit_log;
CREATE POLICY audit_log_insert ON auth_audit_log
  FOR INSERT WITH CHECK (
    clinic_id = current_setting('app.clinic_id', true)::uuid
    OR clinic_id IS NULL
  );

-- ============================================================
-- 5. RLS POLICIES for notifications
-- ============================================================
DROP POLICY IF EXISTS notifications_select ON notifications;
CREATE POLICY notifications_select ON notifications
  FOR SELECT USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS notifications_insert ON notifications;
CREATE POLICY notifications_insert ON notifications
  FOR INSERT WITH CHECK (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS notifications_update ON notifications;
CREATE POLICY notifications_update ON notifications
  FOR UPDATE USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

-- ============================================================
-- 6. device_tokens: NO RLS (user-scoped, not clinic-scoped)
-- ============================================================
-- Device tokens are bound to userId, not clinicId.
-- A user's push token works across all their clinics.
