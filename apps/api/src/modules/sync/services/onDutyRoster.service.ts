import type { AvailabilityRepository } from '../../scheduling/availability.repository.js';
import type { OnDutyRosterProvider } from './retryEscalation.service.js';
import { resolveDayHours, subtractBlockedRanges } from '../../scheduling/slot.service.js';
import { weekdayIST, istMinutesOfDay } from '../../../lib/ist-date.js';

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
 *
 * WR-5: role/membership alone is not "on duty" -- a clinic-member Clinician
 * (non-Admin) who is on a day off, on an unapproved-hours day, or inside an
 * active `BlockedPeriod` right now must not be handed a SAFETY_CRITICAL
 * escalation. After the admin exclusion above, every remaining candidate is
 * additionally checked against real-time availability using the exact same
 * pure precedence functions `AvailabilityService`/`slot.service.ts` already
 * use for booking-slot computation (`resolveDayHours` for
 * template-vs-override precedence, `subtractBlockedRanges` for blocked-period
 * exclusion) -- never a re-implementation of that algorithm.
 */
export class ClinicVetRosterProvider implements OnDutyRosterProvider {
  constructor(private readonly availabilityRepository: AvailabilityRepository) {}

  async listOtherOnDutyClinicianIds(
    clinicId: string,
    excludeUserId: string,
    now: Date = new Date(),
  ): Promise<string[]> {
    const [vets, adminIds] = await Promise.all([
      this.availabilityRepository.listClinicVets(clinicId),
      this.availabilityRepository.listAdminUserIds(clinicId),
    ]);
    const adminIdSet = new Set(adminIds);

    const candidateIds = vets
      .map((vet) => vet.id)
      .filter((id) => id !== excludeUserId && !adminIdSet.has(id));

    const onDutyFlags = await Promise.all(
      candidateIds.map((vetId) => this.isOnDutyNow(clinicId, vetId, now)),
    );

    return candidateIds.filter((_, index) => onDutyFlags[index]);
  }

  /**
   * Mirrors `AvailabilityService.resolveAvailabilityForDate` +
   * `getBlockedRangesForDate` (`apps/api/src/modules/scheduling/availability.service.ts`)
   * evaluated at `now` instead of a caller-chosen date -- same repository
   * queries, same pure `resolveDayHours`/`subtractBlockedRanges` functions,
   * just with the current instant's IST weekday/minutes-of-day standing in
   * for the "which day/slot are we asking about" input those methods
   * otherwise take from the caller.
   */
  private async isOnDutyNow(clinicId: string, vetId: string, now: Date): Promise<boolean> {
    const weekday = weekdayIST(now);

    const [templateDay, override, blockedPeriods] = await Promise.all([
      this.availabilityRepository.getTemplateDay(clinicId, vetId, weekday),
      this.availabilityRepository.getOverride(clinicId, vetId, now),
      this.availabilityRepository.getBlockedPeriods(clinicId, vetId, now),
    ]);

    const hours = resolveDayHours(templateDay, override);
    if (!hours) {
      return false;
    }

    const nowMinutes = istMinutesOfDay(now);
    if (nowMinutes < hours.openMinutes || nowMinutes >= hours.closeMinutes) {
      return false;
    }

    const blockedRanges = subtractBlockedRanges(
      blockedPeriods.map((period) => ({ startMinutes: period.startMinutes, endMinutes: period.endMinutes })),
    );
    const isBlocked = blockedRanges.some(
      (range) => nowMinutes >= range.startMinutes && nowMinutes < range.endMinutes,
    );

    return !isBlocked;
  }
}
