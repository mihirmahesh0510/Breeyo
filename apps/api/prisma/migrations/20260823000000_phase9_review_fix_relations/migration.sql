-- AlterTable
ALTER TABLE "clinic_members" ADD COLUMN     "status_changed_at" TIMESTAMP(3),
ADD COLUMN     "status_changed_by_user_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "owner_portal_session_states_magic_link_id_key" ON "owner_portal_session_states"("magic_link_id");

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
