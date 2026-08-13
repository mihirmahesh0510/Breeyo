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

