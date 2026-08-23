-- AlterTable
ALTER TABLE "clinic_members" ADD COLUMN     "status_changed_at" TIMESTAMP(3),
ADD COLUMN     "status_changed_by_user_id" UUID;

-- CreateTable
CREATE TABLE "clinic_browser_access_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" UUID NOT NULL,
    "role_code" TEXT NOT NULL,
    "browser_enabled" BOOLEAN NOT NULL DEFAULT false,
    "queue_enabled" BOOLEAN NOT NULL DEFAULT false,
    "scheduling_enabled" BOOLEAN NOT NULL DEFAULT false,
    "billing_enabled" BOOLEAN NOT NULL DEFAULT false,
    "inventory_enabled" BOOLEAN NOT NULL DEFAULT false,
    "inventory_write_enabled" BOOLEAN NOT NULL DEFAULT false,
    "users_enabled" BOOLEAN NOT NULL DEFAULT false,
    "updated_by_user_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinic_browser_access_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_dashboard_preferences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "panel_order_json" JSONB NOT NULL DEFAULT '[]',
    "collapsed_panels_json" JSONB NOT NULL DEFAULT '[]',
    "last_viewed_dashboard_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_dashboard_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_portal_magic_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "default_tab" TEXT NOT NULL,
    "deep_link_type" TEXT,
    "deep_link_entity_id" UUID,
    "allowed_pet_ids_json" JSONB NOT NULL DEFAULT '[]',
    "allowed_invoice_ids_json" JSONB NOT NULL DEFAULT '[]',
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "reissued_from_link_id" UUID,
    "latest_reissue_link_id" UUID,
    "last_viewed_at" TIMESTAMP(3),

    CONSTRAINT "owner_portal_magic_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_portal_session_states" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "magic_link_id" UUID NOT NULL,
    "last_tab" TEXT,
    "last_pet_id" UUID,
    "last_invoice_id" UUID,
    "last_visit_id" UUID,
    "last_checkout_session_id" UUID,
    "last_return_state" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_portal_session_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_portal_checkout_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "magic_link_id" UUID NOT NULL,
    "selected_invoice_ids_json" JSONB NOT NULL DEFAULT '[]',
    "pet_breakdown_json" JSONB NOT NULL DEFAULT '[]',
    "amount_due_paise" INTEGER NOT NULL DEFAULT 0,
    "razorpay_payment_link_id" TEXT,
    "return_state" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "owner_portal_checkout_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clinic_browser_access_policies_clinic_id_role_code_idx" ON "clinic_browser_access_policies"("clinic_id", "role_code");

-- CreateIndex
CREATE INDEX "clinic_browser_access_policies_clinic_id_browser_enabled_idx" ON "clinic_browser_access_policies"("clinic_id", "browser_enabled");

-- CreateIndex
CREATE UNIQUE INDEX "clinic_browser_access_policies_clinic_id_role_code_key" ON "clinic_browser_access_policies"("clinic_id", "role_code");

-- CreateIndex
CREATE UNIQUE INDEX "owner_portal_magic_links_token_hash_key" ON "owner_portal_magic_links"("token_hash");

-- CreateIndex
CREATE INDEX "owner_portal_magic_links_owner_id_expires_at_idx" ON "owner_portal_magic_links"("owner_id", "expires_at");

-- CreateIndex
CREATE INDEX "owner_portal_session_states_magic_link_id_updated_at_idx" ON "owner_portal_session_states"("magic_link_id", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "owner_portal_session_states_magic_link_id_key" ON "owner_portal_session_states"("magic_link_id");

-- CreateIndex
CREATE INDEX "owner_portal_checkout_sessions_magic_link_id_return_state_idx" ON "owner_portal_checkout_sessions"("magic_link_id", "return_state");

-- AddForeignKey
ALTER TABLE "clinic_members" ADD CONSTRAINT "clinic_members_status_changed_by_user_id_fkey" FOREIGN KEY ("status_changed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_browser_access_policies" ADD CONSTRAINT "clinic_browser_access_policies_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_browser_access_policies" ADD CONSTRAINT "clinic_browser_access_policies_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_dashboard_preferences" ADD CONSTRAINT "user_dashboard_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_dashboard_preferences" ADD CONSTRAINT "user_dashboard_preferences_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_portal_magic_links" ADD CONSTRAINT "owner_portal_magic_links_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_portal_magic_links" ADD CONSTRAINT "owner_portal_magic_links_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "pet_owners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_portal_session_states" ADD CONSTRAINT "owner_portal_session_states_magic_link_id_fkey" FOREIGN KEY ("magic_link_id") REFERENCES "owner_portal_magic_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_portal_checkout_sessions" ADD CONSTRAINT "owner_portal_checkout_sessions_magic_link_id_fkey" FOREIGN KEY ("magic_link_id") REFERENCES "owner_portal_magic_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

