-- CreateEnum
CREATE TYPE "SyncReplayReceiptStatus" AS ENUM ('ACKNOWLEDGED', 'DEFERRED');

-- CreateEnum
CREATE TYPE "SyncConflictSeverity" AS ENUM ('OPERATIONAL', 'SAFETY_CRITICAL');

-- CreateEnum
CREATE TYPE "SyncResolutionState" AS ENUM ('OPEN', 'GUIDED_RETRY', 'ESCALATED', 'RESOLVED');

-- CreateTable
CREATE TABLE "sync_replay_receipts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" UUID NOT NULL,
    "device_id" TEXT NOT NULL,
    "operation_id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "domain" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "status" "SyncReplayReceiptStatus" NOT NULL DEFAULT 'ACKNOWLEDGED',
    "acknowledged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_acknowledged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_replay_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_conflict_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" UUID NOT NULL,
    "device_id" TEXT NOT NULL,
    "operation_id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "severity" "SyncConflictSeverity" NOT NULL,
    "baseline_payload_json" JSONB,
    "local_payload_json" JSONB NOT NULL,
    "server_payload_json" JSONB NOT NULL,
    "recommended_owner_user_id" UUID,
    "resolution_owner_user_id" UUID,
    "originating_user_id" UUID NOT NULL,
    "current_owner_user_id" UUID NOT NULL,
    "guided_retry_count" INTEGER NOT NULL DEFAULT 0,
    "resolution_state" "SyncResolutionState" NOT NULL DEFAULT 'OPEN',
    "next_suggested_action" TEXT,
    "last_attempted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_conflict_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_failure_tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" UUID NOT NULL,
    "device_id" TEXT NOT NULL,
    "operation_id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "originating_user_id" UUID NOT NULL,
    "current_owner_user_id" UUID NOT NULL,
    "guided_retry_count" INTEGER NOT NULL DEFAULT 0,
    "resolution_state" "SyncResolutionState" NOT NULL DEFAULT 'OPEN',
    "next_suggested_action" TEXT NOT NULL,
    "last_attempted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_failure_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_sync_cursors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" UUID NOT NULL,
    "device_id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "last_acknowledged_operation_id" TEXT,
    "last_acknowledged_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_sync_cursors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sync_replay_receipts_clinic_id_domain_last_acknowledged_at_idx" ON "sync_replay_receipts"("clinic_id", "domain", "last_acknowledged_at");

-- CreateIndex
CREATE UNIQUE INDEX "sync_replay_receipts_clinic_id_device_id_operation_id_key" ON "sync_replay_receipts"("clinic_id", "device_id", "operation_id");

-- CreateIndex
CREATE INDEX "sync_conflict_records_clinic_id_resolution_state_severity_idx" ON "sync_conflict_records"("clinic_id", "resolution_state", "severity");

-- CreateIndex
CREATE INDEX "sync_conflict_records_clinic_id_current_owner_user_id_resol_idx" ON "sync_conflict_records"("clinic_id", "current_owner_user_id", "resolution_state");

-- CreateIndex
CREATE UNIQUE INDEX "sync_conflict_records_clinic_id_device_id_operation_id_key" ON "sync_conflict_records"("clinic_id", "device_id", "operation_id");

-- CreateIndex
CREATE INDEX "sync_failure_tasks_clinic_id_current_owner_user_id_resoluti_idx" ON "sync_failure_tasks"("clinic_id", "current_owner_user_id", "resolution_state");

-- CreateIndex
CREATE UNIQUE INDEX "sync_failure_tasks_clinic_id_device_id_operation_id_key" ON "sync_failure_tasks"("clinic_id", "device_id", "operation_id");

-- CreateIndex
CREATE INDEX "device_sync_cursors_clinic_id_domain_last_acknowledged_at_idx" ON "device_sync_cursors"("clinic_id", "domain", "last_acknowledged_at");

-- CreateIndex
CREATE UNIQUE INDEX "device_sync_cursors_clinic_id_device_id_domain_key" ON "device_sync_cursors"("clinic_id", "device_id", "domain");

-- AddForeignKey
ALTER TABLE "sync_replay_receipts" ADD CONSTRAINT "sync_replay_receipts_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_conflict_records" ADD CONSTRAINT "sync_conflict_records_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_failure_tasks" ADD CONSTRAINT "sync_failure_tasks_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_sync_cursors" ADD CONSTRAINT "device_sync_cursors_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
