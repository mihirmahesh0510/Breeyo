-- CreateEnum
CREATE TYPE "Species" AS ENUM ('DOG', 'CAT', 'BIRD', 'RABBIT', 'FISH', 'REPTILE', 'OTHER');

-- CreateEnum
CREATE TYPE "QueueEntryStatus" AS ENUM ('WAITING', 'IN_CONSULT', 'DONE', 'NO_SHOW');

-- CreateTable
CREATE TABLE "pet_owners" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" UUID NOT NULL,
    "mobile" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT,
    "alt_phone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pet_owners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "species" "Species" NOT NULL,
    "breed" TEXT,
    "birth_year" INTEGER,
    "birth_month" INTEGER,
    "weight" DOUBLE PRECISION,
    "color" TEXT,
    "microchip_id" TEXT,
    "photo_url" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "queue_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" UUID NOT NULL,
    "pet_id" UUID NOT NULL,
    "checked_in_by" UUID NOT NULL,
    "treating_vet_id" UUID,
    "status" "QueueEntryStatus" NOT NULL DEFAULT 'WAITING',
    "position" INTEGER NOT NULL,
    "is_emergency" BOOLEAN NOT NULL DEFAULT false,
    "visit_reason" TEXT,
    "checked_in_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "called_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "queue_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" UUID NOT NULL,
    "pet_id" UUID NOT NULL,
    "vet_id" UUID NOT NULL,
    "queue_entry_id" UUID,
    "visit_type" TEXT NOT NULL DEFAULT 'general',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalized_at" TIMESTAMP(3),
    "duration_minutes" INTEGER,
    "subjective" JSONB,
    "objective" JSONB,
    "assessment" TEXT,
    "plan" JSONB,
    "care_instructions" TEXT,
    "referral" JSONB,
    "rx_notes" TEXT,
    "follow_up_date" TIMESTAMP(3),
    "follow_up_reason" TEXT,
    "addenda" JSONB DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consultations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultation_drafts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "consultation_id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "data" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consultation_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultation_locks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "consultation_id" UUID NOT NULL,
    "vet_id" UUID NOT NULL,
    "vet_name" TEXT NOT NULL,
    "acquired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_heartbeat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consultation_locks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vitals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "consultation_id" UUID NOT NULL,
    "weight_kg" DECIMAL(6,2),
    "temperature_c" DECIMAL(4,1),
    "heart_rate_bpm" INTEGER,
    "respiratory_rate" INTEGER,

    CONSTRAINT "vitals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drugs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" UUID,
    "name" TEXT NOT NULL,
    "generic_name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drugs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drug_formulations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "drug_id" UUID NOT NULL,
    "form" TEXT NOT NULL,
    "strength" TEXT NOT NULL,
    "strength_value" DECIMAL(10,2) NOT NULL,
    "strength_unit" TEXT NOT NULL,

    CONSTRAINT "drug_formulations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "species_dosages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "drug_id" UUID NOT NULL,
    "species" TEXT NOT NULL,
    "min_dose_mg_per_kg" DECIMAL(10,4) NOT NULL,
    "max_dose_mg_per_kg" DECIMAL(10,4) NOT NULL,
    "is_fixed_dose" BOOLEAN NOT NULL DEFAULT false,
    "fixed_dose_min" DECIMAL(10,2),
    "fixed_dose_max" DECIMAL(10,2),
    "notes" TEXT,

    CONSTRAINT "species_dosages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "consultation_id" UUID NOT NULL,
    "drug_id" UUID,
    "drug_name" TEXT NOT NULL,
    "formulation_id" UUID,
    "formulation" TEXT NOT NULL,
    "strength" TEXT NOT NULL,
    "dosage" TEXT NOT NULL,
    "dosage_mg" DECIMAL(10,2),
    "route" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "duration" TEXT NOT NULL,
    "duration_days" INTEGER,
    "clinical_instructions" TEXT,
    "owner_instructions" TEXT,
    "dispensed" BOOLEAN NOT NULL DEFAULT false,
    "inventory_item_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prescriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vaccination_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" UUID NOT NULL,
    "pet_id" UUID NOT NULL,
    "consultation_id" UUID,
    "vaccine_name" TEXT NOT NULL,
    "batch_number" TEXT,
    "manufacturer" TEXT,
    "expiry_date" TIMESTAMP(3),
    "administered_at" TIMESTAMP(3) NOT NULL,
    "administered_by" UUID NOT NULL,
    "next_due_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vaccination_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deworming_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" UUID NOT NULL,
    "pet_id" UUID NOT NULL,
    "consultation_id" UUID,
    "drug_name" TEXT NOT NULL,
    "administered_at" TIMESTAMP(3) NOT NULL,
    "administered_by" UUID NOT NULL,
    "next_due_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deworming_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultation_attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "consultation_id" UUID NOT NULL,
    "file_type" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "s3_key" TEXT NOT NULL,
    "s3_url" TEXT,
    "thumbnail_s3_key" TEXT,
    "description" TEXT,
    "uploaded_by" UUID NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consultation_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_catalog" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'other',
    "price" INTEGER NOT NULL,
    "sac_code" TEXT,
    "hsn_code" TEXT,
    "gst_rate_override" DECIMAL(5,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_preset" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "selling_price" DECIMAL(10,2) NOT NULL,
    "par_level" INTEGER,
    "schedule_h" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "photo_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "current_stock" INTEGER NOT NULL DEFAULT 0,
    "hsn_sac_code" TEXT,
    "gst_rate" DECIMAL(5,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_barcodes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "item_id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,

    CONSTRAINT "inventory_barcodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "item_id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "lot_number" TEXT,
    "expiry_date" TIMESTAMP(3),
    "purchase_price" DECIMAL(10,2),
    "supplier" TEXT,
    "initial_qty" INTEGER NOT NULL,
    "current_qty" INTEGER NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_expired" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "stock_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "batch_id" UUID,
    "type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT,
    "running_total" INTEGER NOT NULL,
    "user_id" UUID NOT NULL,
    "user_name" TEXT NOT NULL,
    "consultation_id" UUID,
    "invoice_id" UUID,
    "owner_id" UUID,
    "unit_price" DECIMAL(10,2),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinic_inventory_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" UUID NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinic_inventory_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinic_inventory_units" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" UUID NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinic_inventory_units_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pet_owners_clinic_id_idx" ON "pet_owners"("clinic_id");

-- CreateIndex
CREATE INDEX "pet_owners_clinic_id_name_idx" ON "pet_owners"("clinic_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "pet_owners_clinic_id_mobile_key" ON "pet_owners"("clinic_id", "mobile");

-- CreateIndex
CREATE INDEX "pets_clinic_id_idx" ON "pets"("clinic_id");

-- CreateIndex
CREATE INDEX "pets_clinic_id_owner_id_idx" ON "pets"("clinic_id", "owner_id");

-- CreateIndex
CREATE INDEX "pets_clinic_id_name_idx" ON "pets"("clinic_id", "name");

-- CreateIndex
CREATE INDEX "queue_entries_clinic_id_status_idx" ON "queue_entries"("clinic_id", "status");

-- CreateIndex
CREATE INDEX "queue_entries_clinic_id_checked_in_at_idx" ON "queue_entries"("clinic_id", "checked_in_at");

-- CreateIndex
CREATE INDEX "queue_entries_clinic_id_pet_id_checked_in_at_idx" ON "queue_entries"("clinic_id", "pet_id", "checked_in_at");

-- CreateIndex
CREATE INDEX "consultations_clinic_id_idx" ON "consultations"("clinic_id");

-- CreateIndex
CREATE INDEX "consultations_clinic_id_pet_id_idx" ON "consultations"("clinic_id", "pet_id");

-- CreateIndex
CREATE INDEX "consultations_clinic_id_vet_id_idx" ON "consultations"("clinic_id", "vet_id");

-- CreateIndex
CREATE INDEX "consultations_clinic_id_status_idx" ON "consultations"("clinic_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "consultation_drafts_consultation_id_key" ON "consultation_drafts"("consultation_id");

-- CreateIndex
CREATE INDEX "consultation_drafts_clinic_id_idx" ON "consultation_drafts"("clinic_id");

-- CreateIndex
CREATE UNIQUE INDEX "consultation_locks_consultation_id_key" ON "consultation_locks"("consultation_id");

-- CreateIndex
CREATE UNIQUE INDEX "vitals_consultation_id_key" ON "vitals"("consultation_id");

-- CreateIndex
CREATE INDEX "drugs_name_idx" ON "drugs"("name");

-- CreateIndex
CREATE INDEX "drugs_generic_name_idx" ON "drugs"("generic_name");

-- CreateIndex
CREATE UNIQUE INDEX "species_dosages_drug_id_species_key" ON "species_dosages"("drug_id", "species");

-- CreateIndex
CREATE INDEX "prescriptions_consultation_id_idx" ON "prescriptions"("consultation_id");

-- CreateIndex
CREATE INDEX "vaccination_records_clinic_id_pet_id_idx" ON "vaccination_records"("clinic_id", "pet_id");

-- CreateIndex
CREATE INDEX "vaccination_records_clinic_id_pet_id_vaccine_name_idx" ON "vaccination_records"("clinic_id", "pet_id", "vaccine_name");

-- CreateIndex
CREATE INDEX "deworming_records_clinic_id_pet_id_idx" ON "deworming_records"("clinic_id", "pet_id");

-- CreateIndex
CREATE INDEX "consultation_attachments_consultation_id_idx" ON "consultation_attachments"("consultation_id");

-- CreateIndex
CREATE INDEX "service_catalog_clinic_id_is_active_idx" ON "service_catalog"("clinic_id", "is_active");

-- CreateIndex
CREATE INDEX "service_catalog_clinic_id_category_idx" ON "service_catalog"("clinic_id", "category");

-- CreateIndex
CREATE INDEX "inventory_items_clinic_id_name_idx" ON "inventory_items"("clinic_id", "name");

-- CreateIndex
CREATE INDEX "inventory_items_clinic_id_category_idx" ON "inventory_items"("clinic_id", "category");

-- CreateIndex
CREATE INDEX "inventory_items_clinic_id_is_active_idx" ON "inventory_items"("clinic_id", "is_active");

-- CreateIndex
CREATE INDEX "inventory_barcodes_code_idx" ON "inventory_barcodes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_barcodes_code_clinic_id_key" ON "inventory_barcodes"("code", "clinic_id");

-- CreateIndex
CREATE INDEX "stock_batches_item_id_received_at_idx" ON "stock_batches"("item_id", "received_at");

-- CreateIndex
CREATE INDEX "stock_batches_clinic_id_expiry_date_idx" ON "stock_batches"("clinic_id", "expiry_date");

-- CreateIndex
CREATE INDEX "stock_batches_clinic_id_item_id_is_expired_idx" ON "stock_batches"("clinic_id", "item_id", "is_expired");

-- CreateIndex
CREATE INDEX "stock_movements_item_id_created_at_idx" ON "stock_movements"("item_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "stock_movements_clinic_id_created_at_idx" ON "stock_movements"("clinic_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "stock_movements_clinic_id_type_idx" ON "stock_movements"("clinic_id", "type");

-- CreateIndex
CREATE INDEX "stock_movements_clinic_id_type_invoice_id_idx" ON "stock_movements"("clinic_id", "type", "invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "clinic_inventory_categories_clinic_id_value_key" ON "clinic_inventory_categories"("clinic_id", "value");

-- CreateIndex
CREATE UNIQUE INDEX "clinic_inventory_units_clinic_id_value_key" ON "clinic_inventory_units"("clinic_id", "value");

-- AddForeignKey
ALTER TABLE "pet_owners" ADD CONSTRAINT "pet_owners_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pets" ADD CONSTRAINT "pets_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pets" ADD CONSTRAINT "pets_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "pet_owners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_vet_id_fkey" FOREIGN KEY ("vet_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultation_drafts" ADD CONSTRAINT "consultation_drafts_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vitals" ADD CONSTRAINT "vitals_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "consultations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drugs" ADD CONSTRAINT "drugs_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drug_formulations" ADD CONSTRAINT "drug_formulations_drug_id_fkey" FOREIGN KEY ("drug_id") REFERENCES "drugs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "species_dosages" ADD CONSTRAINT "species_dosages_drug_id_fkey" FOREIGN KEY ("drug_id") REFERENCES "drugs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "consultations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccination_records" ADD CONSTRAINT "vaccination_records_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccination_records" ADD CONSTRAINT "vaccination_records_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccination_records" ADD CONSTRAINT "vaccination_records_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "consultations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deworming_records" ADD CONSTRAINT "deworming_records_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deworming_records" ADD CONSTRAINT "deworming_records_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deworming_records" ADD CONSTRAINT "deworming_records_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "consultations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultation_attachments" ADD CONSTRAINT "consultation_attachments_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "consultations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_catalog" ADD CONSTRAINT "service_catalog_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_barcodes" ADD CONSTRAINT "inventory_barcodes_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "stock_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "pet_owners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_inventory_categories" ADD CONSTRAINT "clinic_inventory_categories_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_inventory_units" ADD CONSTRAINT "clinic_inventory_units_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
