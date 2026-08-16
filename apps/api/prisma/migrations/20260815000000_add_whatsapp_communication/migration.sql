-- CreateEnum
CREATE TYPE "WaChannel" AS ENUM ('SIMULATOR', 'CLOUD_API');

-- CreateEnum
CREATE TYPE "WaDirection" AS ENUM ('OUTBOUND', 'INBOUND');

-- CreateEnum
CREATE TYPE "WaDeliveryStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'REPLIED');

-- CreateEnum
CREATE TYPE "WaNumberStatus" AS ENUM ('VALID', 'INVALID');

-- CreateEnum
CREATE TYPE "WaContextType" AS ENUM ('NONE', 'INVOICE', 'PET', 'REMINDER', 'BOOKING', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "WaReminderKind" AS ENUM ('FOLLOW_UP', 'VACCINE_DUE', 'DEWORMING_DUE');

-- CreateEnum
CREATE TYPE "WaReminderTouch" AS ENUM ('ADVANCE', 'ON_DATE');

-- CreateEnum
CREATE TYPE "WaReminderState" AS ENUM ('PENDING', 'SENT', 'REPLIED', 'CAPPED_NEEDS_ACTION', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WaBookingState" AS ENUM ('AWAITING_SLOT_CHOICE', 'CONFIRMED', 'CANCELLED', 'MOVED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "WaDeliveryMode" AS ENUM ('NORMAL', 'DELAYED', 'FAIL', 'INVALID_NUMBER');

-- CreateTable
CREATE TABLE "whatsapp_threads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "wa_phone" TEXT NOT NULL,
    "resolved_wa_id" TEXT,
    "number_status" "WaNumberStatus" NOT NULL DEFAULT 'VALID',
    "last_message_at" TIMESTAMP(3),
    "last_message_preview" TEXT,
    "last_context_type" "WaContextType" NOT NULL DEFAULT 'NONE',
    "unread_count" INTEGER NOT NULL DEFAULT 0,
    "needs_action" BOOLEAN NOT NULL DEFAULT false,
    "needs_action_reason" TEXT,
    "service_window_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "direction" "WaDirection" NOT NULL,
    "channel" "WaChannel" NOT NULL,
    "provider_message_id" TEXT,
    "reply_to_provider_message_id" TEXT,
    "template_key" TEXT,
    "template_category" TEXT,
    "body" TEXT NOT NULL,
    "rendered_variables" JSONB,
    "interactive_options" JSONB,
    "status" "WaDeliveryStatus" NOT NULL DEFAULT 'QUEUED',
    "failure_code" TEXT,
    "failure_reason" TEXT,
    "context_type" "WaContextType" NOT NULL DEFAULT 'NONE',
    "context_id" UUID,
    "media_provider_id" TEXT,
    "media_filename" TEXT,
    "media_mime_type" TEXT,
    "media_expires_at" TIMESTAMP(3),
    "staff_note" TEXT,
    "sent_by_user_id" UUID,
    "reminder_task_id" UUID,
    "booking_request_id" UUID,
    "retry_of_message_id" UUID,
    "queued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_message_status_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "message_id" UUID NOT NULL,
    "status" "WaDeliveryStatus" NOT NULL,
    "provider_code" TEXT,
    "raw_payload" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_message_status_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_owner_preferences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "reminders_opted_out" BOOLEAN NOT NULL DEFAULT false,
    "opted_out_at" TIMESTAMP(3),
    "opted_out_source" TEXT,
    "number_status" "WaNumberStatus" NOT NULL DEFAULT 'VALID',
    "marked_invalid_at" TIMESTAMP(3),
    "marked_invalid_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_owner_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_reminder_tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "pet_id" UUID NOT NULL,
    "kind" "WaReminderKind" NOT NULL,
    "touch" "WaReminderTouch" NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" UUID NOT NULL,
    "source_label" TEXT,
    "due_date" DATE NOT NULL,
    "scheduled_for" DATE NOT NULL,
    "state" "WaReminderState" NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMP(3),
    "next_attempt_at" TIMESTAMP(3),
    "replied_at" TIMESTAMP(3),
    "capped_at" TIMESTAMP(3),
    "capped_reason" TEXT,
    "acknowledged_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_reminder_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_booking_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "pet_id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "state" "WaBookingState" NOT NULL DEFAULT 'AWAITING_SLOT_CHOICE',
    "slot_date" DATE,
    "slot_start_minutes" INTEGER,
    "slot_duration_minutes" INTEGER,
    "confirmed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "moved_to_booking_id" UUID,
    "superseded_by_appointment_id" UUID,
    "acted_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_booking_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_slot_holds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" UUID NOT NULL,
    "slot_date" DATE NOT NULL,
    "slot_start_minutes" INTEGER NOT NULL,
    "booking_request_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_slot_holds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_clinic_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" UUID NOT NULL,
    "provider" "WaChannel" NOT NULL DEFAULT 'SIMULATOR',
    "delivery_mode" "WaDeliveryMode" NOT NULL DEFAULT 'NORMAL',
    "auto_reply_enabled" BOOLEAN NOT NULL DEFAULT true,
    "auto_reply_delay_seconds" INTEGER NOT NULL DEFAULT 10,
    "allow_freeform_outside_window" BOOLEAN NOT NULL DEFAULT false,
    "slot_duration_minutes" INTEGER NOT NULL DEFAULT 30,
    "escalation_max_attempts" INTEGER NOT NULL DEFAULT 2,
    "escalation_interval_days" INTEGER NOT NULL DEFAULT 3,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_clinic_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_threads_clinic_id_last_message_at_idx" ON "whatsapp_threads"("clinic_id", "last_message_at");

-- CreateIndex
CREATE INDEX "whatsapp_threads_clinic_id_needs_action_idx" ON "whatsapp_threads"("clinic_id", "needs_action");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_threads_clinic_id_wa_phone_key" ON "whatsapp_threads"("clinic_id", "wa_phone");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_messages_provider_message_id_key" ON "whatsapp_messages"("provider_message_id");

-- CreateIndex
CREATE INDEX "whatsapp_messages_clinic_id_thread_id_created_at_idx" ON "whatsapp_messages"("clinic_id", "thread_id", "created_at");

-- CreateIndex
CREATE INDEX "whatsapp_messages_clinic_id_status_idx" ON "whatsapp_messages"("clinic_id", "status");

-- CreateIndex
CREATE INDEX "whatsapp_messages_clinic_id_context_type_context_id_idx" ON "whatsapp_messages"("clinic_id", "context_type", "context_id");

-- CreateIndex
CREATE INDEX "whatsapp_message_status_events_message_id_occurred_at_idx" ON "whatsapp_message_status_events"("message_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_owner_preferences_owner_id_key" ON "whatsapp_owner_preferences"("owner_id");

-- CreateIndex
CREATE INDEX "whatsapp_owner_preferences_clinic_id_idx" ON "whatsapp_owner_preferences"("clinic_id");

-- CreateIndex
CREATE INDEX "whatsapp_reminder_tasks_clinic_id_state_scheduled_for_idx" ON "whatsapp_reminder_tasks"("clinic_id", "state", "scheduled_for");

-- CreateIndex
CREATE INDEX "whatsapp_reminder_tasks_clinic_id_state_next_attempt_at_idx" ON "whatsapp_reminder_tasks"("clinic_id", "state", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_reminder_tasks_clinic_id_source_type_source_id_kin_key" ON "whatsapp_reminder_tasks"("clinic_id", "source_type", "source_id", "kind", "touch");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_booking_requests_reference_key" ON "whatsapp_booking_requests"("reference");

-- CreateIndex
CREATE INDEX "whatsapp_booking_requests_clinic_id_state_idx" ON "whatsapp_booking_requests"("clinic_id", "state");

-- CreateIndex
CREATE INDEX "whatsapp_booking_requests_clinic_id_slot_date_idx" ON "whatsapp_booking_requests"("clinic_id", "slot_date");

-- CreateIndex
CREATE INDEX "whatsapp_booking_requests_clinic_id_pet_id_idx" ON "whatsapp_booking_requests"("clinic_id", "pet_id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_slot_holds_booking_request_id_key" ON "whatsapp_slot_holds"("booking_request_id");

-- CreateIndex
CREATE INDEX "whatsapp_slot_holds_clinic_id_slot_date_idx" ON "whatsapp_slot_holds"("clinic_id", "slot_date");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_slot_holds_clinic_id_slot_date_slot_start_minutes_key" ON "whatsapp_slot_holds"("clinic_id", "slot_date", "slot_start_minutes");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_clinic_configs_clinic_id_key" ON "whatsapp_clinic_configs"("clinic_id");

-- AddForeignKey
ALTER TABLE "whatsapp_threads" ADD CONSTRAINT "whatsapp_threads_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_owner_preferences" ADD CONSTRAINT "whatsapp_owner_preferences_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_reminder_tasks" ADD CONSTRAINT "whatsapp_reminder_tasks_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_reminder_tasks" ADD CONSTRAINT "whatsapp_reminder_tasks_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_booking_requests" ADD CONSTRAINT "whatsapp_booking_requests_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_booking_requests" ADD CONSTRAINT "whatsapp_booking_requests_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_slot_holds" ADD CONSTRAINT "whatsapp_slot_holds_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_clinic_configs" ADD CONSTRAINT "whatsapp_clinic_configs_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

