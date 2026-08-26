import type { AvailabilityRepository } from '../../scheduling/availability.repository.js';
import type { OnDutyRosterProvider } from './retryEscalation.service.js';

/**
 * Verify-fix 10.6 (D-36, resolved via `PHASE-10-VERIFY-FIX-PLAN.md`'s
 * "on-duty roster source" decision): the concrete `OnDutyRosterProvider`
 * `retryEscalation.service.ts` needs to actually escalate a SAFETY_CRITICAL
 * conflict. "On duty" resolves to Phase 8's existing
 * `AvailabilityRepository.listClinicVets(clinicId)` -- every clinic member
 * holding the `EDIT_EMR` permission (Admin or Clinician role, per that
 * method's own doc comment) -- minus the unreachable clinician. No new
 * shift/on-duty tracking concept is introduced; this is a thin adapter, not
 * a second roster source.
 *
 * `listClinicVets` includes Admin-role members (any Admin also holds
 * `EDIT_EMR` per the seed data), so this provider does NOT itself exclude
 * Admin -- D-36 only rules out ever FALLING BACK to Admin when no other
 * clinician exists (`retryEscalation.service.ts`'s `NO_ON_DUTY_CLINICIAN_AVAILABLE`
 * throw already enforces that half); it does not forbid an Admin who is
 * also clinically on duty from being a legitimate hand-off target.
 */
export class ClinicVetRosterProvider implements OnDutyRosterProvider {
  constructor(private readonly availabilityRepository: AvailabilityRepository) {}

  async listOtherOnDutyClinicianIds(clinicId: string, excludeUserId: string): Promise<string[]> {
    const vets = await this.availabilityRepository.listClinicVets(clinicId);
    return vets.map((vet) => vet.id).filter((id) => id !== excludeUserId);
  }
}
