-- Phase 03: Patient Registration & Walk-in Queue - RLS Policies and Trigram Indexes
-- Run after Prisma migration as breeyo_admin

-- Enable pg_trgm extension for fuzzy search (PAT-04)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram GIN indexes for patient search
CREATE INDEX IF NOT EXISTS idx_pet_owner_name_trgm ON pet_owners USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_pet_owner_mobile_trgm ON pet_owners USING gin (mobile gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_pet_name_trgm ON pets USING gin (name gin_trgm_ops);

-- Enable RLS on patient/queue tables
ALTER TABLE pet_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE pets ENABLE ROW LEVEL SECURITY;
ALTER TABLE queue_entries ENABLE ROW LEVEL SECURITY;

-- RLS policies for tenant isolation (using breeyo_app role)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pet_owner_tenant_isolation') THEN
    CREATE POLICY pet_owner_tenant_isolation ON pet_owners
      USING (clinic_id::text = current_setting('app.current_clinic_id', true));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pet_tenant_isolation') THEN
    CREATE POLICY pet_tenant_isolation ON pets
      USING (clinic_id::text = current_setting('app.current_clinic_id', true));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'queue_entry_tenant_isolation') THEN
    CREATE POLICY queue_entry_tenant_isolation ON queue_entries
      USING (clinic_id::text = current_setting('app.current_clinic_id', true));
  END IF;
END $$;
