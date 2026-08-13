-- AlterTable
ALTER TABLE "clinics" ADD COLUMN     "bank_details" TEXT,
ADD COLUMN     "default_due_days" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "default_gst_rate" DECIMAL(5,2),
ADD COLUMN     "gst_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "invoice_footer_text" TEXT,
ADD COLUMN     "razorpay_key_id" TEXT,
ADD COLUMN     "razorpay_key_secret_enc" TEXT,
ADD COLUMN     "razorpay_test_mode" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "razorpay_webhook_secret_enc" TEXT,
ADD COLUMN     "razorpay_webhook_token" TEXT,
ADD COLUMN     "state_code" CHAR(2);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" UUID NOT NULL,
    "invoice_number" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "consultation_id" UUID,
    "pet_id" UUID,
    "owner_id" UUID,
    "created_by_id" UUID NOT NULL,
    "document_type" TEXT,
    "place_of_supply_state_code" CHAR(2),
    "is_inter_state" BOOLEAN NOT NULL DEFAULT false,
    "gst_enabled_snapshot" BOOLEAN NOT NULL DEFAULT false,
    "clinic_gstin_snapshot" TEXT,
    "subtotal_paise" INTEGER NOT NULL DEFAULT 0,
    "line_discount_paise" INTEGER NOT NULL DEFAULT 0,
    "invoice_discount_type" TEXT,
    "invoice_discount_value" INTEGER,
    "invoice_discount_paise" INTEGER NOT NULL DEFAULT 0,
    "taxable_value_paise" INTEGER NOT NULL DEFAULT 0,
    "cgst_paise" INTEGER NOT NULL DEFAULT 0,
    "sgst_paise" INTEGER NOT NULL DEFAULT 0,
    "igst_paise" INTEGER NOT NULL DEFAULT 0,
    "round_off_paise" INTEGER NOT NULL DEFAULT 0,
    "grand_total_paise" INTEGER NOT NULL DEFAULT 0,
    "amount_paid_paise" INTEGER NOT NULL DEFAULT 0,
    "credited_paise" INTEGER NOT NULL DEFAULT 0,
    "balance_paise" INTEGER NOT NULL DEFAULT 0,
    "due_date" TIMESTAMP(3),
    "notes" TEXT,
    "finalized_at" TIMESTAMP(3),
    "voided_at" TIMESTAMP(3),
    "void_reason" TEXT,
    "void_restored_stock" BOOLEAN NOT NULL DEFAULT false,
    "exception_flag" TEXT,
    "exception_detected_at" TIMESTAMP(3),
    "exception_resolved_at" TIMESTAMP(3),
    "exception_resolved_by_id" UUID,
    "exception_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_line_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "line_type" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "service_catalog_id" UUID,
    "inventory_item_id" UUID,
    "stock_movement_id" UUID,
    "description" TEXT NOT NULL,
    "hsn_sac_code" TEXT,
    "quantity" INTEGER NOT NULL,
    "unit_price_paise" INTEGER NOT NULL,
    "discount_type" TEXT,
    "discount_value" INTEGER,
    "line_discount_paise" INTEGER NOT NULL DEFAULT 0,
    "allocated_invoice_discount_paise" INTEGER NOT NULL DEFAULT 0,
    "tax_treatment" TEXT NOT NULL DEFAULT 'taxable',
    "gst_rate_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "taxable_value_paise" INTEGER NOT NULL DEFAULT 0,
    "cgst_paise" INTEGER NOT NULL DEFAULT 0,
    "sgst_paise" INTEGER NOT NULL DEFAULT 0,
    "igst_paise" INTEGER NOT NULL DEFAULT 0,
    "line_total_paise" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "method" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "razorpay_payment_link_id" TEXT,
    "razorpay_payment_id" TEXT,
    "short_url" TEXT,
    "payment_group_id" UUID,
    "expires_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "recorded_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_receipts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "receipt_number" TEXT NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "transaction_ref" TEXT,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "payment_id" UUID,
    "method" TEXT NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "razorpay_refund_id" TEXT,
    "reason" TEXT,
    "processed_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "credit_note_number" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "subtotal_paise" INTEGER NOT NULL DEFAULT 0,
    "taxable_value_paise" INTEGER NOT NULL DEFAULT 0,
    "cgst_paise" INTEGER NOT NULL DEFAULT 0,
    "sgst_paise" INTEGER NOT NULL DEFAULT 0,
    "igst_paise" INTEGER NOT NULL DEFAULT 0,
    "round_off_paise" INTEGER NOT NULL DEFAULT 0,
    "total_paise" INTEGER NOT NULL DEFAULT 0,
    "issued_by_id" UUID NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_note_line_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" UUID NOT NULL,
    "credit_note_id" UUID NOT NULL,
    "invoice_line_item_id" UUID,
    "description" TEXT NOT NULL,
    "hsn_sac_code" TEXT,
    "quantity" INTEGER NOT NULL,
    "tax_treatment" TEXT NOT NULL,
    "gst_rate_percent" DECIMAL(5,2) NOT NULL,
    "taxable_value_paise" INTEGER NOT NULL,
    "cgst_paise" INTEGER NOT NULL DEFAULT 0,
    "sgst_paise" INTEGER NOT NULL DEFAULT 0,
    "igst_paise" INTEGER NOT NULL DEFAULT 0,
    "total_paise" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_note_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_number_counters" (
    "clinic_id" UUID NOT NULL,
    "doc_type" TEXT NOT NULL,
    "period" VARCHAR(12) NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_number_counters_pkey" PRIMARY KEY ("clinic_id","doc_type","period")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" UUID NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "raw_payload" TEXT NOT NULL,
    "signature_verified" BOOLEAN NOT NULL DEFAULT false,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "processing_error" TEXT,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_audit_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" UUID NOT NULL,
    "user_id" UUID,
    "event" TEXT NOT NULL,
    "invoice_id" UUID,
    "metadata" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invoices_clinic_id_status_idx" ON "invoices"("clinic_id", "status");

-- CreateIndex
CREATE INDEX "invoices_clinic_id_created_at_idx" ON "invoices"("clinic_id", "created_at");

-- CreateIndex
CREATE INDEX "invoices_clinic_id_due_date_idx" ON "invoices"("clinic_id", "due_date");

-- CreateIndex
CREATE INDEX "invoices_clinic_id_pet_id_idx" ON "invoices"("clinic_id", "pet_id");

-- CreateIndex
CREATE INDEX "invoices_clinic_id_exception_flag_idx" ON "invoices"("clinic_id", "exception_flag");

-- CreateIndex
CREATE INDEX "invoices_consultation_id_idx" ON "invoices"("consultation_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_clinic_id_invoice_number_key" ON "invoices"("clinic_id", "invoice_number");

-- CreateIndex
CREATE INDEX "invoice_line_items_clinic_id_invoice_id_idx" ON "invoice_line_items"("clinic_id", "invoice_id");

-- CreateIndex
CREATE INDEX "invoice_line_items_invoice_id_sort_order_idx" ON "invoice_line_items"("invoice_id", "sort_order");

-- CreateIndex
CREATE INDEX "invoice_line_items_stock_movement_id_idx" ON "invoice_line_items"("stock_movement_id");

-- CreateIndex
CREATE INDEX "payments_clinic_id_invoice_id_idx" ON "payments"("clinic_id", "invoice_id");

-- CreateIndex
CREATE INDEX "payments_invoice_id_paid_at_idx" ON "payments"("invoice_id", "paid_at");

-- CreateIndex
CREATE INDEX "payments_clinic_id_status_expires_at_idx" ON "payments"("clinic_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "payments_payment_group_id_idx" ON "payments"("payment_group_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_razorpay_payment_link_id_invoice_id_key" ON "payments"("razorpay_payment_link_id", "invoice_id");

-- CreateIndex
CREATE INDEX "payment_receipts_clinic_id_invoice_id_idx" ON "payment_receipts"("clinic_id", "invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_receipts_clinic_id_receipt_number_key" ON "payment_receipts"("clinic_id", "receipt_number");

-- CreateIndex
CREATE INDEX "refunds_clinic_id_invoice_id_idx" ON "refunds"("clinic_id", "invoice_id");

-- CreateIndex
CREATE INDEX "refunds_clinic_id_status_idx" ON "refunds"("clinic_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_razorpay_refund_id_key" ON "refunds"("razorpay_refund_id");

-- CreateIndex
CREATE INDEX "credit_notes_clinic_id_invoice_id_idx" ON "credit_notes"("clinic_id", "invoice_id");

-- CreateIndex
CREATE INDEX "credit_notes_clinic_id_issued_at_idx" ON "credit_notes"("clinic_id", "issued_at");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_clinic_id_credit_note_number_key" ON "credit_notes"("clinic_id", "credit_note_number");

-- CreateIndex
CREATE INDEX "credit_note_line_items_clinic_id_credit_note_id_idx" ON "credit_note_line_items"("clinic_id", "credit_note_id");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_event_id_key" ON "webhook_events"("event_id");

-- CreateIndex
CREATE INDEX "webhook_events_clinic_id_event_type_idx" ON "webhook_events"("clinic_id", "event_type");

-- CreateIndex
CREATE INDEX "webhook_events_processed_at_idx" ON "webhook_events"("processed_at");

-- CreateIndex
CREATE INDEX "billing_audit_log_clinic_id_idx" ON "billing_audit_log"("clinic_id");

-- CreateIndex
CREATE INDEX "billing_audit_log_user_id_idx" ON "billing_audit_log"("user_id");

-- CreateIndex
CREATE INDEX "billing_audit_log_event_idx" ON "billing_audit_log"("event");

-- CreateIndex
CREATE INDEX "billing_audit_log_invoice_id_idx" ON "billing_audit_log"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "clinics_razorpay_webhook_token_key" ON "clinics"("razorpay_webhook_token");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "pet_owners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "consultations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_service_catalog_id_fkey" FOREIGN KEY ("service_catalog_id") REFERENCES "service_catalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_stock_movement_id_fkey" FOREIGN KEY ("stock_movement_id") REFERENCES "stock_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_issued_by_id_fkey" FOREIGN KEY ("issued_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_line_items" ADD CONSTRAINT "credit_note_line_items_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_line_items" ADD CONSTRAINT "credit_note_line_items_credit_note_id_fkey" FOREIGN KEY ("credit_note_id") REFERENCES "credit_notes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_number_counters" ADD CONSTRAINT "invoice_number_counters_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_audit_log" ADD CONSTRAINT "billing_audit_log_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- Hand-written additions (plan 06-03). Prisma's schema DSL cannot express
-- partial unique indexes or CHECK constraints, so they live here. Both are
-- additive, so `prisma migrate diff` against schema.prisma still reports no
-- drift.
-- ============================================================

-- D-03 / RESEARCH Pattern 1 (T-06-10): "End Consultation" creates a draft
-- invoice. A double tap, or a client retry after a timeout, must not produce
-- two drafts for the same consultation. The partial predicate is what lets
-- this idempotency rule coexist with history: once an invoice is finalized or
-- voided it drops out of the index, so the same consultation can legitimately
-- carry a VOIDED invoice alongside a fresh DRAFT.
CREATE UNIQUE INDEX "invoices_one_draft_per_consultation"
  ON "invoices" ("consultation_id")
  WHERE "status" = 'DRAFT' AND "consultation_id" IS NOT NULL;

-- T-06-11: negative or fractional money on a financial record is a
-- data-integrity failure, not a business case. Fractional is already
-- impossible (every money column is INTEGER paise); these constraints close
-- the negative half.
--
-- Deliberately ABSENT from this list: `balance_paise >= 0`. An overpaid
-- invoice (D-36 -- cash marked paid while a digital payment for the same
-- invoice also lands) must be REPRESENTABLE in order to be detected and
-- flagged for manual resolution via `exception_flag`. Constraining the balance
-- to non-negative would make the overpayment case unstorable, silently
-- corrupting the reconciliation instead of surfacing it.
--
-- Credit notes are likewise not modelled as negative amounts: per D-22 they
-- carry their own positive totals and reduce the balance by reference.
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_money_non_negative" CHECK (
  "subtotal_paise" >= 0
  AND "grand_total_paise" >= 0
  AND "amount_paid_paise" >= 0
);

ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_positive"
  CHECK ("amount_paise" > 0);

ALTER TABLE "refunds" ADD CONSTRAINT "refunds_amount_positive"
  CHECK ("amount_paise" > 0);

