import type { AvailabilityRepository } from '../../scheduling/availability.repository.js';
import type { OnDutyRosterProvider } from './retryEscalation.service.js';

/**
 * Verify-fix 10.6 (D-36, resolved via `PHASE-10-VERIFY-FIX-PLAN.md`'s
 * "on-duty roster source" decision): the concrete `OnDutyRosterProvider`
 * `retryEscalation.service.ts` needs to actually escalate a SAFETY_CRITICAL
 * conflict. "On duty" resolves to Phase 8's existing
 * `AvailabilityRepository.listClinicVets(clinicId)` -- every clinic member
 * holding the `EDIT_EMR` permission (Admin or Clinician role, per that
 * method's own doc comment) -- minus the unreachable clinician and minus
 * every Admin-role member.
 *
 * `listClinicVets` deliberately includes Admin-role members (Admin also
 * holds `EDIT_EMR` per the seed data, and other callers like
 * `vetColorForId` need every vet-capable id regardless of role), so this
 * provider excludes them itself via `AvailabilityRepository.listAdminUserIds`
 * -- matching the `OnDutyRosterProvider` interface's own doc comment in
 * `retryEscalation.service.ts` ("Every real implementation MUST exclude
 * Admin-role members -- D-36 explicitly rules out ever falling back to
 * Admin"). This holds even for a user who holds BOTH Admin and Clinician
 * roles -- D-36's "never falling back to Admin" is about the ROLE, not
 * about whether the same person also happens to be a Clinician.
 */
export class ClinicVetRosterProvider implements OnDutyRosterProvider {
  constructor(private readonly availabilityRepository: AvailabilityRepository) {}

  async listOtherOnDutyClinicianIds(clinicId: string, excludeUserId: string): Promise<string[]> {
    const [vets, adminIds] = await Promise.all([
      this.availabilityRepository.listClinicVets(clinicId),
      this.availabilityRepository.listAdminUserIds(clinicId),
    ]);
    const adminIdSet = new Set(adminIds);

    return vets
      .map((vet) => vet.id)
      .filter((id) => id !== excludeUserId && !adminIdSet.has(id));
  }
}
