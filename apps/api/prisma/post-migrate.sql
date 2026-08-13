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

-- ============================================================
-- 7. Phase 3/4/5 tenant tables (added by Phase 6 plan 06-00, D-30)
-- ============================================================
-- Before this section only 3 of 28 tables had RLS, so every patient, EMR,
-- clinical and inventory table was fail-open for the breeyo_app role.
--
-- Two per-phase scripts previously lived in prisma/rls/ and were run by CI
-- after this file. They are folded in here and deleted:
--   * phase-03-patient-queue-rls.sql keyed its policies on a DIFFERENTLY NAMED
--     GUC that nothing in the codebase ever sets, so its policies could never
--     match and every read would have returned zero rows once RLS was enabled.
--     Re-keyed onto `app.clinic_id` here -- the name prisma-rls.ts actually
--     binds. Do not reintroduce the old name.
--   * phase-05-inventory-rls.sql used the correct GUC but only a single
--     permissive ALL policy per table and no FORCE.
-- Both are upgraded to the ENABLE + FORCE + four-per-operation-policy shape
-- used by clinic_members above.
--
-- Conventions (match section 3): GUC name `app.clinic_id`; cast the *setting*
-- to ::uuid, never the column to ::text; DROP POLICY IF EXISTS before every
-- CREATE so re-runs are idempotent; one policy per operation.

-- pg_trgm + fuzzy-search indexes (PAT-04, D-31), previously in prisma/rls/.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_pet_owner_name_trgm ON pet_owners USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_pet_owner_mobile_trgm ON pet_owners USING gin (mobile gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_pet_name_trgm ON pets USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_inventory_item_name_trgm ON inventory_items USING gin (name gin_trgm_ops);

-- Drop the superseded single-policy definitions from the two folded-in files
-- so a database that already ran them ends up in the same state as a fresh one.
DROP POLICY IF EXISTS pet_owner_tenant_isolation ON pet_owners;
DROP POLICY IF EXISTS pet_tenant_isolation ON pets;
DROP POLICY IF EXISTS queue_entry_tenant_isolation ON queue_entries;
DROP POLICY IF EXISTS inventory_items_tenant_isolation ON inventory_items;
DROP POLICY IF EXISTS inventory_barcodes_tenant_isolation ON inventory_barcodes;
DROP POLICY IF EXISTS stock_batches_tenant_isolation ON stock_batches;
DROP POLICY IF EXISTS stock_movements_tenant_isolation ON stock_movements;
DROP POLICY IF EXISTS clinic_inventory_categories_tenant_isolation ON clinic_inventory_categories;
DROP POLICY IF EXISTS clinic_inventory_units_tenant_isolation ON clinic_inventory_units;

-- ------------------------------------------------------------
-- 7a. Tables carrying their own clinic_id
-- ------------------------------------------------------------

-- pet_owners
ALTER TABLE pet_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE pet_owners FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pet_owners_select ON pet_owners;
CREATE POLICY pet_owners_select ON pet_owners
  FOR SELECT USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS pet_owners_insert ON pet_owners;
CREATE POLICY pet_owners_insert ON pet_owners
  FOR INSERT WITH CHECK (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS pet_owners_update ON pet_owners;
CREATE POLICY pet_owners_update ON pet_owners
  FOR UPDATE USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS pet_owners_delete ON pet_owners;
CREATE POLICY pet_owners_delete ON pet_owners
  FOR DELETE USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

-- pets
ALTER TABLE pets ENABLE ROW LEVEL SECURITY;
ALTER TABLE pets FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pets_select ON pets;
CREATE POLICY pets_select ON pets
  FOR SELECT USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS pets_insert ON pets;
CREATE POLICY pets_insert ON pets
  FOR INSERT WITH CHECK (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS pets_update ON pets;
CREATE POLICY pets_update ON pets
  FOR UPDATE USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS pets_delete ON pets;
CREATE POLICY pets_delete ON pets
  FOR DELETE USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

-- queue_entries
ALTER TABLE queue_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE queue_entries FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS queue_entries_select ON queue_entries;
CREATE POLICY queue_entries_select ON queue_entries
  FOR SELECT USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS queue_entries_insert ON queue_entries;
CREATE POLICY queue_entries_insert ON queue_entries
  FOR INSERT WITH CHECK (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS queue_entries_update ON queue_entries;
CREATE POLICY queue_entries_update ON queue_entries
  FOR UPDATE USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS queue_entries_delete ON queue_entries;
CREATE POLICY queue_entries_delete ON queue_entries
  FOR DELETE USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

-- consultations
ALTER TABLE consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS consultations_select ON consultations;
CREATE POLICY consultations_select ON consultations
  FOR SELECT USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS consultations_insert ON consultations;
CREATE POLICY consultations_insert ON consultations
  FOR INSERT WITH CHECK (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS consultations_update ON consultations;
CREATE POLICY consultations_update ON consultations
  FOR UPDATE USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS consultations_delete ON consultations;
CREATE POLICY consultations_delete ON consultations
  FOR DELETE USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

-- consultation_drafts
ALTER TABLE consultation_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultation_drafts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS consultation_drafts_select ON consultation_drafts;
CREATE POLICY consultation_drafts_select ON consultation_drafts
  FOR SELECT USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS consultation_drafts_insert ON consultation_drafts;
CREATE POLICY consultation_drafts_insert ON consultation_drafts
  FOR INSERT WITH CHECK (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS consultation_drafts_update ON consultation_drafts;
CREATE POLICY consultation_drafts_update ON consultation_drafts
  FOR UPDATE USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS consultation_drafts_delete ON consultation_drafts;
CREATE POLICY consultation_drafts_delete ON consultation_drafts
  FOR DELETE USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

-- vaccination_records
ALTER TABLE vaccination_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE vaccination_records FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vaccination_records_select ON vaccination_records;
CREATE POLICY vaccination_records_select ON vaccination_records
  FOR SELECT USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS vaccination_records_insert ON vaccination_records;
CREATE POLICY vaccination_records_insert ON vaccination_records
  FOR INSERT WITH CHECK (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS vaccination_records_update ON vaccination_records;
CREATE POLICY vaccination_records_update ON vaccination_records
  FOR UPDATE USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS vaccination_records_delete ON vaccination_records;
CREATE POLICY vaccination_records_delete ON vaccination_records
  FOR DELETE USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

-- deworming_records
ALTER TABLE deworming_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE deworming_records FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deworming_records_select ON deworming_records;
CREATE POLICY deworming_records_select ON deworming_records
  FOR SELECT USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS deworming_records_insert ON deworming_records;
CREATE POLICY deworming_records_insert ON deworming_records
  FOR INSERT WITH CHECK (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS deworming_records_update ON deworming_records;
CREATE POLICY deworming_records_update ON deworming_records
  FOR UPDATE USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS deworming_records_delete ON deworming_records;
CREATE POLICY deworming_records_delete ON deworming_records
  FOR DELETE USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

-- service_catalog
ALTER TABLE service_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_catalog FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_catalog_select ON service_catalog;
CREATE POLICY service_catalog_select ON service_catalog
  FOR SELECT USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS service_catalog_insert ON service_catalog;
CREATE POLICY service_catalog_insert ON service_catalog
  FOR INSERT WITH CHECK (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS service_catalog_update ON service_catalog;
CREATE POLICY service_catalog_update ON service_catalog
  FOR UPDATE USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS service_catalog_delete ON service_catalog;
CREATE POLICY service_catalog_delete ON service_catalog
  FOR DELETE USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

-- drugs -- clinic_id is NULLABLE: rows with clinic_id IS NULL are the global
-- reference formulary shared by every clinic (see commit "fix(drug): scope drug
-- queries to global rows and the active clinic"). Reads therefore admit global
-- rows, but writes are restricted to the caller's own clinic so a tenant can
-- neither modify nor delete shared reference data.
ALTER TABLE drugs ENABLE ROW LEVEL SECURITY;
ALTER TABLE drugs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS drugs_select ON drugs;
CREATE POLICY drugs_select ON drugs
  FOR SELECT USING (clinic_id IS NULL OR clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS drugs_insert ON drugs;
CREATE POLICY drugs_insert ON drugs
  FOR INSERT WITH CHECK (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS drugs_update ON drugs;
CREATE POLICY drugs_update ON drugs
  FOR UPDATE USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS drugs_delete ON drugs;
CREATE POLICY drugs_delete ON drugs
  FOR DELETE USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

-- ------------------------------------------------------------
-- 7b. Child tables with no clinic_id -- scoped through their parent
-- ------------------------------------------------------------
-- Parents: consultations (consultation_locks, vitals, prescriptions,
-- consultation_attachments) and drugs (drug_formulations, species_dosages).
-- The drugs children mirror the nullable-clinic_id rule above: a formulation
-- or dosage hanging off a global drug is readable by every clinic.

-- consultation_locks
ALTER TABLE consultation_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultation_locks FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS consultation_locks_select ON consultation_locks;
CREATE POLICY consultation_locks_select ON consultation_locks
  FOR SELECT USING (EXISTS (SELECT 1 FROM consultations c WHERE c.id = consultation_locks.consultation_id AND c.clinic_id = current_setting('app.clinic_id', true)::uuid));

DROP POLICY IF EXISTS consultation_locks_insert ON consultation_locks;
CREATE POLICY consultation_locks_insert ON consultation_locks
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM consultations c WHERE c.id = consultation_locks.consultation_id AND c.clinic_id = current_setting('app.clinic_id', true)::uuid));

DROP POLICY IF EXISTS consultation_locks_update ON consultation_locks;
CREATE POLICY consultation_locks_update ON consultation_locks
  FOR UPDATE USING (EXISTS (SELECT 1 FROM consultations c WHERE c.id = consultation_locks.consultation_id AND c.clinic_id = current_setting('app.clinic_id', true)::uuid));

DROP POLICY IF EXISTS consultation_locks_delete ON consultation_locks;
CREATE POLICY consultation_locks_delete ON consultation_locks
  FOR DELETE USING (EXISTS (SELECT 1 FROM consultations c WHERE c.id = consultation_locks.consultation_id AND c.clinic_id = current_setting('app.clinic_id', true)::uuid));

-- vitals
ALTER TABLE vitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE vitals FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vitals_select ON vitals;
CREATE POLICY vitals_select ON vitals
  FOR SELECT USING (EXISTS (SELECT 1 FROM consultations c WHERE c.id = vitals.consultation_id AND c.clinic_id = current_setting('app.clinic_id', true)::uuid));

DROP POLICY IF EXISTS vitals_insert ON vitals;
CREATE POLICY vitals_insert ON vitals
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM consultations c WHERE c.id = vitals.consultation_id AND c.clinic_id = current_setting('app.clinic_id', true)::uuid));

DROP POLICY IF EXISTS vitals_update ON vitals;
CREATE POLICY vitals_update ON vitals
  FOR UPDATE USING (EXISTS (SELECT 1 FROM consultations c WHERE c.id = vitals.consultation_id AND c.clinic_id = current_setting('app.clinic_id', true)::uuid));

DROP POLICY IF EXISTS vitals_delete ON vitals;
CREATE POLICY vitals_delete ON vitals
  FOR DELETE USING (EXISTS (SELECT 1 FROM consultations c WHERE c.id = vitals.consultation_id AND c.clinic_id = current_setting('app.clinic_id', true)::uuid));

-- prescriptions
ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescriptions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prescriptions_select ON prescriptions;
CREATE POLICY prescriptions_select ON prescriptions
  FOR SELECT USING (EXISTS (SELECT 1 FROM consultations c WHERE c.id = prescriptions.consultation_id AND c.clinic_id = current_setting('app.clinic_id', true)::uuid));

DROP POLICY IF EXISTS prescriptions_insert ON prescriptions;
CREATE POLICY prescriptions_insert ON prescriptions
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM consultations c WHERE c.id = prescriptions.consultation_id AND c.clinic_id = current_setting('app.clinic_id', true)::uuid));

DROP POLICY IF EXISTS prescriptions_update ON prescriptions;
CREATE POLICY prescriptions_update ON prescriptions
  FOR UPDATE USING (EXISTS (SELECT 1 FROM consultations c WHERE c.id = prescriptions.consultation_id AND c.clinic_id = current_setting('app.clinic_id', true)::uuid));

DROP POLICY IF EXISTS prescriptions_delete ON prescriptions;
CREATE POLICY prescriptions_delete ON prescriptions
  FOR DELETE USING (EXISTS (SELECT 1 FROM consultations c WHERE c.id = prescriptions.consultation_id AND c.clinic_id = current_setting('app.clinic_id', true)::uuid));

-- consultation_attachments
ALTER TABLE consultation_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultation_attachments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS consultation_attachments_select ON consultation_attachments;
CREATE POLICY consultation_attachments_select ON consultation_attachments
  FOR SELECT USING (EXISTS (SELECT 1 FROM consultations c WHERE c.id = consultation_attachments.consultation_id AND c.clinic_id = current_setting('app.clinic_id', true)::uuid));

DROP POLICY IF EXISTS consultation_attachments_insert ON consultation_attachments;
CREATE POLICY consultation_attachments_insert ON consultation_attachments
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM consultations c WHERE c.id = consultation_attachments.consultation_id AND c.clinic_id = current_setting('app.clinic_id', true)::uuid));

DROP POLICY IF EXISTS consultation_attachments_update ON consultation_attachments;
CREATE POLICY consultation_attachments_update ON consultation_attachments
  FOR UPDATE USING (EXISTS (SELECT 1 FROM consultations c WHERE c.id = consultation_attachments.consultation_id AND c.clinic_id = current_setting('app.clinic_id', true)::uuid));

DROP POLICY IF EXISTS consultation_attachments_delete ON consultation_attachments;
CREATE POLICY consultation_attachments_delete ON consultation_attachments
  FOR DELETE USING (EXISTS (SELECT 1 FROM consultations c WHERE c.id = consultation_attachments.consultation_id AND c.clinic_id = current_setting('app.clinic_id', true)::uuid));

-- drug_formulations
ALTER TABLE drug_formulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE drug_formulations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS drug_formulations_select ON drug_formulations;
CREATE POLICY drug_formulations_select ON drug_formulations
  FOR SELECT USING (EXISTS (SELECT 1 FROM drugs d WHERE d.id = drug_formulations.drug_id AND (d.clinic_id IS NULL OR d.clinic_id = current_setting('app.clinic_id', true)::uuid)));

DROP POLICY IF EXISTS drug_formulations_insert ON drug_formulations;
CREATE POLICY drug_formulations_insert ON drug_formulations
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM drugs d WHERE d.id = drug_formulations.drug_id AND d.clinic_id = current_setting('app.clinic_id', true)::uuid));

DROP POLICY IF EXISTS drug_formulations_update ON drug_formulations;
CREATE POLICY drug_formulations_update ON drug_formulations
  FOR UPDATE USING (EXISTS (SELECT 1 FROM drugs d WHERE d.id = drug_formulations.drug_id AND d.clinic_id = current_setting('app.clinic_id', true)::uuid));

DROP POLICY IF EXISTS drug_formulations_delete ON drug_formulations;
CREATE POLICY drug_formulations_delete ON drug_formulations
  FOR DELETE USING (EXISTS (SELECT 1 FROM drugs d WHERE d.id = drug_formulations.drug_id AND d.clinic_id = current_setting('app.clinic_id', true)::uuid));

-- species_dosages
ALTER TABLE species_dosages ENABLE ROW LEVEL SECURITY;
ALTER TABLE species_dosages FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS species_dosages_select ON species_dosages;
CREATE POLICY species_dosages_select ON species_dosages
  FOR SELECT USING (EXISTS (SELECT 1 FROM drugs d WHERE d.id = species_dosages.drug_id AND (d.clinic_id IS NULL OR d.clinic_id = current_setting('app.clinic_id', true)::uuid)));

DROP POLICY IF EXISTS species_dosages_insert ON species_dosages;
CREATE POLICY species_dosages_insert ON species_dosages
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM drugs d WHERE d.id = species_dosages.drug_id AND d.clinic_id = current_setting('app.clinic_id', true)::uuid));

DROP POLICY IF EXISTS species_dosages_update ON species_dosages;
CREATE POLICY species_dosages_update ON species_dosages
  FOR UPDATE USING (EXISTS (SELECT 1 FROM drugs d WHERE d.id = species_dosages.drug_id AND d.clinic_id = current_setting('app.clinic_id', true)::uuid));

DROP POLICY IF EXISTS species_dosages_delete ON species_dosages;
CREATE POLICY species_dosages_delete ON species_dosages
  FOR DELETE USING (EXISTS (SELECT 1 FROM drugs d WHERE d.id = species_dosages.drug_id AND d.clinic_id = current_setting('app.clinic_id', true)::uuid));

-- ------------------------------------------------------------
-- 7c. Phase 5 inventory tables (folded in from phase-05-inventory-rls.sql)
-- ------------------------------------------------------------
-- Deleting that file without re-declaring these would silently drop inventory
-- RLS entirely. Phase 6 invoices line-item directly off stock_movements and
-- inventory_items, so these carry money-adjacent data.

-- inventory_items
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventory_items_select ON inventory_items;
CREATE POLICY inventory_items_select ON inventory_items
  FOR SELECT USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS inventory_items_insert ON inventory_items;
CREATE POLICY inventory_items_insert ON inventory_items
  FOR INSERT WITH CHECK (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS inventory_items_update ON inventory_items;
CREATE POLICY inventory_items_update ON inventory_items
  FOR UPDATE USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS inventory_items_delete ON inventory_items;
CREATE POLICY inventory_items_delete ON inventory_items
  FOR DELETE USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

-- inventory_barcodes
ALTER TABLE inventory_barcodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_barcodes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventory_barcodes_select ON inventory_barcodes;
CREATE POLICY inventory_barcodes_select ON inventory_barcodes
  FOR SELECT USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS inventory_barcodes_insert ON inventory_barcodes;
CREATE POLICY inventory_barcodes_insert ON inventory_barcodes
  FOR INSERT WITH CHECK (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS inventory_barcodes_update ON inventory_barcodes;
CREATE POLICY inventory_barcodes_update ON inventory_barcodes
  FOR UPDATE USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS inventory_barcodes_delete ON inventory_barcodes;
CREATE POLICY inventory_barcodes_delete ON inventory_barcodes
  FOR DELETE USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

-- stock_batches
ALTER TABLE stock_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_batches FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stock_batches_select ON stock_batches;
CREATE POLICY stock_batches_select ON stock_batches
  FOR SELECT USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS stock_batches_insert ON stock_batches;
CREATE POLICY stock_batches_insert ON stock_batches
  FOR INSERT WITH CHECK (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS stock_batches_update ON stock_batches;
CREATE POLICY stock_batches_update ON stock_batches
  FOR UPDATE USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS stock_batches_delete ON stock_batches;
CREATE POLICY stock_batches_delete ON stock_batches
  FOR DELETE USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

-- stock_movements
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stock_movements_select ON stock_movements;
CREATE POLICY stock_movements_select ON stock_movements
  FOR SELECT USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS stock_movements_insert ON stock_movements;
CREATE POLICY stock_movements_insert ON stock_movements
  FOR INSERT WITH CHECK (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS stock_movements_update ON stock_movements;
CREATE POLICY stock_movements_update ON stock_movements
  FOR UPDATE USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS stock_movements_delete ON stock_movements;
CREATE POLICY stock_movements_delete ON stock_movements
  FOR DELETE USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

-- clinic_inventory_categories
ALTER TABLE clinic_inventory_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_inventory_categories FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinic_inventory_categories_select ON clinic_inventory_categories;
CREATE POLICY clinic_inventory_categories_select ON clinic_inventory_categories
  FOR SELECT USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS clinic_inventory_categories_insert ON clinic_inventory_categories;
CREATE POLICY clinic_inventory_categories_insert ON clinic_inventory_categories
  FOR INSERT WITH CHECK (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS clinic_inventory_categories_update ON clinic_inventory_categories;
CREATE POLICY clinic_inventory_categories_update ON clinic_inventory_categories
  FOR UPDATE USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS clinic_inventory_categories_delete ON clinic_inventory_categories;
CREATE POLICY clinic_inventory_categories_delete ON clinic_inventory_categories
  FOR DELETE USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

-- clinic_inventory_units
ALTER TABLE clinic_inventory_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_inventory_units FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinic_inventory_units_select ON clinic_inventory_units;
CREATE POLICY clinic_inventory_units_select ON clinic_inventory_units
  FOR SELECT USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS clinic_inventory_units_insert ON clinic_inventory_units;
CREATE POLICY clinic_inventory_units_insert ON clinic_inventory_units
  FOR INSERT WITH CHECK (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS clinic_inventory_units_update ON clinic_inventory_units;
CREATE POLICY clinic_inventory_units_update ON clinic_inventory_units
  FOR UPDATE USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS clinic_inventory_units_delete ON clinic_inventory_units;
CREATE POLICY clinic_inventory_units_delete ON clinic_inventory_units
  FOR DELETE USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

-- ============================================================
-- 8. Tables deliberately left WITHOUT clinic RLS policies
-- ============================================================
-- Each line states why. Revisit if any of these gains a clinic_id column.
--   users                     -- global identity; a person exists across clinics and is
--                                read during login, before any clinic context exists.
--   clinics                   -- the tenant table itself; a clinic row is not "inside" a
--                                clinic. Visibility is filtered by membership in the app layer.
--   roles                     -- global reference data, identical for every clinic.
--   permissions               -- global reference data, identical for every clinic.
--   role_permissions          -- global reference data (role -> permission mapping).
--   clinic_member_roles       -- child of clinic_members, which is already forced above;
--                                reachable only via a clinic_member row the tenant can see.
--   user_permission_overrides -- child of clinic_members, same reasoning as above.
--   refresh_tokens            -- user-scoped auth material, looked up by token hash during
--                                refresh, before a clinic context has been established.
--   device_tokens             -- user-scoped (see section 6); a push token spans all of a
--                                user's clinics.
--   consent_records           -- DPDP consent is owner-scoped and has no clinic_id column;
--                                it must survive a clinic relationship ending.
--   _prisma_migrations        -- migration bookkeeping, not application data.
