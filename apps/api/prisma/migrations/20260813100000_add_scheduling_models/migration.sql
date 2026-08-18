/*
  Warnings (Prisma-generated, resolved by hand — see Task 2 of plan 08-03):

  - `queue_priority_at` is added as a required (NOT NULL) column on
    `queue_entries`, which is not possible in one statement against a
    non-empty table. Resolved below by adding it nullable, backfilling from
    `checked_in_at`, then setting NOT NULL (D-10 / RESEARCH Pattern 3).

*/
-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "AppointmentSource" AS ENUM ('STAFF', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "BlockedPeriodReason" AS ENUM ('LUNCH', 'BREAK', 'PERSONAL', 'OFF_SITE', 'MEETING', 'OTHER');

-- AlterEnum
-- D-08: Postgres cannot use a newly added enum value in the same transaction
-- that adds it. Verified (Task 2, step 2): no later statement in this file
-- references 'EXPECTED' in a default, CHECK or index predicate, so the
-- single-transaction application Prisma generates here is safe as-is — no
-- transaction split or separate earlier-timestamped migration is needed.
ALTER TYPE "QueueEntryStatus" ADD VALUE 'EXPECTED';

-- AlterTable
ALTER TABLE "queue_entries" ADD COLUMN     "appointment_id" UUID;

-- D-10 / RESEARCH Pattern 3: queue_priority_at is added NOT NULL, but
-- queue_entries may already contain rows, so a single
-- `ADD COLUMN ... NOT NULL` would fail. Add it nullable, backfill every
-- pre-existing row from checked_in_at (for an organic walk-in, priority time
-- and physical check-in time are the same value, so no historical ordering
-- changes), then tighten to NOT NULL.
ALTER TABLE "queue_entries" ADD COLUMN     "queue_priority_at" TIMESTAMP(3);

UPDATE "queue_entries" SET "queue_priority_at" = "checked_in_at" WHERE "queue_priority_at" IS NULL;

ALTER TABLE "queue_entries" ALTER COLUMN "queue_priority_at" SET NOT NULL;

-- AlterTable
ALTER TABLE "service_catalog" ADD COLUMN     "duration_minutes" INTEGER NOT NULL DEFAULT 15;

-- CreateTable
CREATE TABLE "vet_availability_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" UUID NOT NULL,
    "vet_id" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "is_closed" BOOLEAN NOT NULL DEFAULT false,
    "open_minutes" INTEGER,
    "close_minutes" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vet_availability_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_overrides" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" UUID NOT NULL,
    "vet_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "is_closed" BOOLEAN NOT NULL DEFAULT true,
    "open_minutes" INTEGER,
    "close_minutes" INTEGER,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "availability_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocked_periods" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" UUID NOT NULL,
    "vet_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "start_minutes" INTEGER NOT NULL,
    "end_minutes" INTEGER NOT NULL,
    "reason" "BlockedPeriodReason" NOT NULL,
    "reason_text" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocked_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" UUID NOT NULL,
    "vet_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "service_catalog_id" UUID,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "source" "AppointmentSource" NOT NULL DEFAULT 'STAFF',
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "recurring_series_id" UUID,
    "recurrence_index" INTEGER,
    "notes" TEXT,
    "created_by_id" UUID NOT NULL,
    "whatsapp_booking_request_id" UUID,
    "queue_entry_created_at" TIMESTAMP(3),
    "no_show_flipped_at" TIMESTAMP(3),
    "starting_soon_notified_at" TIMESTAMP(3),
    "checked_in_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_id" UUID,
    "cancel_reason" TEXT,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_pets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "pet_id" UUID NOT NULL,
    "queue_entry_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_pets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vet_availability_templates_clinic_id_vet_id_weekday_key" ON "vet_availability_templates"("clinic_id", "vet_id", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "availability_overrides_clinic_id_vet_id_date_key" ON "availability_overrides"("clinic_id", "vet_id", "date");

-- CreateIndex
CREATE INDEX "blocked_periods_clinic_id_vet_id_date_idx" ON "blocked_periods"("clinic_id", "vet_id", "date");

-- CreateIndex
CREATE INDEX "appointments_clinic_id_scheduled_for_idx" ON "appointments"("clinic_id", "scheduled_for");

-- CreateIndex
CREATE INDEX "appointments_clinic_id_vet_id_scheduled_for_idx" ON "appointments"("clinic_id", "vet_id", "scheduled_for");

-- CreateIndex
CREATE INDEX "appointments_clinic_id_status_scheduled_for_idx" ON "appointments"("clinic_id", "status", "scheduled_for");

-- CreateIndex
CREATE INDEX "appointments_clinic_id_recurring_series_id_idx" ON "appointments"("clinic_id", "recurring_series_id");

-- CreateIndex
CREATE INDEX "appointments_whatsapp_booking_request_id_idx" ON "appointments"("whatsapp_booking_request_id");

-- CreateIndex
CREATE INDEX "appointment_pets_clinic_id_pet_id_idx" ON "appointment_pets"("clinic_id", "pet_id");

-- CreateIndex
CREATE INDEX "appointment_pets_queue_entry_id_idx" ON "appointment_pets"("queue_entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_pets_appointment_id_pet_id_key" ON "appointment_pets"("appointment_id", "pet_id");

-- CreateIndex
CREATE INDEX "queue_entries_clinic_id_status_queue_priority_at_idx" ON "queue_entries"("clinic_id", "status", "queue_priority_at");

-- AddForeignKey
ALTER TABLE "queue_entries" ADD CONSTRAINT "queue_entries_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_availability_templates" ADD CONSTRAINT "vet_availability_templates_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_availability_templates" ADD CONSTRAINT "vet_availability_templates_vet_id_fkey" FOREIGN KEY ("vet_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_overrides" ADD CONSTRAINT "availability_overrides_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_overrides" ADD CONSTRAINT "availability_overrides_vet_id_fkey" FOREIGN KEY ("vet_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_periods" ADD CONSTRAINT "blocked_periods_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_periods" ADD CONSTRAINT "blocked_periods_vet_id_fkey" FOREIGN KEY ("vet_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_vet_id_fkey" FOREIGN KEY ("vet_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "pet_owners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_catalog_id_fkey" FOREIGN KEY ("service_catalog_id") REFERENCES "service_catalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_pets" ADD CONSTRAINT "appointment_pets_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_pets" ADD CONSTRAINT "appointment_pets_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_pets" ADD CONSTRAINT "appointment_pets_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_pets" ADD CONSTRAINT "appointment_pets_queue_entry_id_fkey" FOREIGN KEY ("queue_entry_id") REFERENCES "queue_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
