-- Phase 05: Inventory Management - RLS Policies and Trigram Index
-- Run after Prisma migration as breeyo_admin.
--
-- Follows the same location/pattern as prisma/rls/phase-03-patient-queue-rls.sql
-- (per-phase incremental RLS + trgm scripts, applied manually since there is no
-- migrate-time hook that runs them automatically), but uses `app.clinic_id` as
-- the session variable -- the setting actually written by
-- apps/api/src/lib/prisma-rls.ts's createTenantClient() (`SET LOCAL app.clinic_id`)
-- and read by apps/api/prisma/post-migrate.sql's policies. phase-03's script uses
-- `app.current_clinic_id`, which does not match the runtime code and appears to be
-- a naming inconsistency from that phase -- not repeated here.
--
-- NOTE: as of this plan, `inventory_items` and the other five tables below do not
-- yet exist in the local dev database. Plan 05-01 could not run
-- `prisma migrate dev` because the migration history is already out of sync with
-- the live database (recorded migrations only cover `init` + `add_consent_records`,
-- while the live DB has neither those Phase 3/4 tables nor these Phase 5 ones).
-- This script is therefore verified by inspection against schema.prisma and the
-- established phase-03 pattern, not by executing it against a live database --
-- it should be applied by whoever resolves the migration-history drift and runs
-- `prisma migrate dev`/`deploy` for real, immediately followed by this script
-- (as breeyo_admin), the same way phase-03's script is documented to run.

-- Trigram GIN index for fuzzy item-name search (D-31), mirroring
-- idx_pet_owner_name_trgm/idx_pet_name_trgm from phase-03. pg_trgm is already
-- created by phase-03's script; CREATE EXTENSION IF NOT EXISTS is repeated here
-- so this file is runnable standalone.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_inventory_item_name_trgm ON inventory_items USING gin (name gin_trgm_ops);

-- Enable RLS on all six inventory tables
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_barcodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_inventory_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_inventory_units ENABLE ROW LEVEL SECURITY;

-- RLS policies for tenant isolation (using breeyo_app role via app.clinic_id)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'inventory_items_tenant_isolation') THEN
    CREATE POLICY inventory_items_tenant_isolation ON inventory_items
      USING (clinic_id = current_setting('app.clinic_id', true)::uuid);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'inventory_barcodes_tenant_isolation') THEN
    CREATE POLICY inventory_barcodes_tenant_isolation ON inventory_barcodes
      USING (clinic_id = current_setting('app.clinic_id', true)::uuid);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'stock_batches_tenant_isolation') THEN
    CREATE POLICY stock_batches_tenant_isolation ON stock_batches
      USING (clinic_id = current_setting('app.clinic_id', true)::uuid);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'stock_movements_tenant_isolation') THEN
    CREATE POLICY stock_movements_tenant_isolation ON stock_movements
      USING (clinic_id = current_setting('app.clinic_id', true)::uuid);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'clinic_inventory_categories_tenant_isolation') THEN
    CREATE POLICY clinic_inventory_categories_tenant_isolation ON clinic_inventory_categories
      USING (clinic_id = current_setting('app.clinic_id', true)::uuid);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'clinic_inventory_units_tenant_isolation') THEN
    CREATE POLICY clinic_inventory_units_tenant_isolation ON clinic_inventory_units
      USING (clinic_id = current_setting('app.clinic_id', true)::uuid);
  END IF;
END $$;
