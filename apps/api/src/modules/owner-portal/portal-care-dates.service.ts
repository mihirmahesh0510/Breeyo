import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import type { VaccinationRepository } from '../vaccination/vaccination.repository.js';
import { AccessScopeService, type OwnerPortalTokenScope } from './access-scope.service.js';

export type CareDateStatus = 'overdue' | 'dueSoon' | 'upcoming';

export interface UpcomingVaccinationEntry {
  vaccineName: string;
  nextDueDate: string;
  status: CareDateStatus;
}

export interface UpcomingDewormingEntry {
  drugName: string;
  nextDueDate: string;
  status: CareDateStatus;
}

export interface UpcomingAppointmentEntry {
  scheduledAt: string;
  reason: string;
  staffName: string;
}

export interface PortalCareDatesResult {
  vaccinations: UpcomingVaccinationEntry[];
  deworming: UpcomingDewormingEntry | null;
  nextAppointment: UpcomingAppointmentEntry | null;
}

const DUE_SOON_WINDOW_DAYS = 7;

function classifyDueDate(nextDueDate: Date, now: Date): CareDateStatus {
  if (nextDueDate.getTime() < now.getTime()) return 'overdue';
  const dueSoonThreshold = new Date(now);
  dueSoonThreshold.setDate(dueSoonThreshold.getDate() + DUE_SOON_WINDOW_DAYS);
  if (nextDueDate.getTime() <= dueSoonThreshold.getTime()) return 'dueSoon';
  return 'upcoming';
}

interface AppointmentNextRow {
  scheduledFor: Date;
  vet: { fullName: string } | null;
  serviceCatalog: { name: string } | null;
}

/**
 * Upcoming-care-dates projection for the owner portal (OWN-07). Reuses the
 * SAME scope-derivation path as every other portal service —
 * `AccessScopeService.isPetInScope` against the `OwnerPortalTokenScope`
 * derived once from the validated magic-link row — never a client-supplied
 * petId trusted on its own (T-09-20).
 *
 * Deviation from the plan's `<interfaces>` section (see this module's test
 * file header comment and `09-07-SUMMARY.md` for the full writeup): the
 * plan describes `Appointment` as having `petId`, `staffId`, `scheduledAt`,
 * and a status enum including `CONFIRMED`/`EXPECTED`. The actual Phase 8
 * schema has none of those — pets attach via the `AppointmentPet` join
 * table (`pets: { some: { petId } }`), the vet relation is
 * `vetId`/`vet.fullName`, the time column is `scheduledFor`, and
 * `AppointmentStatus` is only SCHEDULED / CHECKED_IN / COMPLETED /
 * CANCELLED / NO_SHOW. "Next scheduled appointment" is therefore modelled
 * here as status `SCHEDULED` (booked, not yet checked in) with
 * `scheduledFor` in the future — `CHECKED_IN` means the pet has already
 * arrived at the clinic, which is a current visit, not a future one.
 * `reason` is projected from `serviceCatalog.name` (falling back to
 * "Visit", matching `AppointmentBlock.tsx`/`AppointmentDrawer.tsx`'s own
 * fallback), never from the vet's internal `notes` free-text field.
 */
export class PortalCareDatesService {
  constructor(
    private readonly db: TenantPrismaClient,
    private readonly accessScopeService: AccessScopeService,
    private readonly vaccinationRepository: VaccinationRepository,
  ) {}

  async getCareDates(
    scope: OwnerPortalTokenScope,
    petId: string,
    now: Date = new Date(),
  ): Promise<PortalCareDatesResult | null> {
    if (!this.accessScopeService.isPetInScope(scope, petId)) {
      return null;
    }

    const [vaccinationRecords, latestDeworming, nextAppointment] = await Promise.all([
      this.vaccinationRepository.getVaccinationRecords(scope.clinicId, petId),
      this.vaccinationRepository.getLatestDeworming(scope.clinicId, petId),
      this.findNextAppointment(petId, now),
    ]);

    const vaccinations = this.projectVaccinations(
      vaccinationRecords as Array<{ vaccineName: string; nextDueDate: Date | null }>,
      now,
    );
    const deworming = this.projectDeworming(
      latestDeworming as { drugName: string; nextDueDate: Date | null } | null,
      now,
    );

    return { vaccinations, deworming, nextAppointment };
  }

  private projectVaccinations(
    records: Array<{ vaccineName: string; nextDueDate: Date | null }>,
    now: Date,
  ): UpcomingVaccinationEntry[] {
    return records
      .filter((record): record is { vaccineName: string; nextDueDate: Date } => record.nextDueDate !== null)
      .sort((a, b) => a.nextDueDate.getTime() - b.nextDueDate.getTime())
      .map((record) => ({
        vaccineName: record.vaccineName,
        nextDueDate: record.nextDueDate.toISOString(),
        status: classifyDueDate(record.nextDueDate, now),
      }));
  }

  private projectDeworming(
    record: { drugName: string; nextDueDate: Date | null } | null,
    now: Date,
  ): UpcomingDewormingEntry | null {
    if (!record || !record.nextDueDate) return null;
    return {
      drugName: record.drugName,
      nextDueDate: record.nextDueDate.toISOString(),
      status: classifyDueDate(record.nextDueDate, now),
    };
  }

  private async findNextAppointment(petId: string, now: Date): Promise<UpcomingAppointmentEntry | null> {
    const appointment = (await this.db.appointment.findFirst({
      where: {
        status: 'SCHEDULED',
        scheduledFor: { gt: now },
        pets: { some: { petId } },
      },
      orderBy: { scheduledFor: 'asc' },
      select: {
        scheduledFor: true,
        vet: { select: { fullName: true } },
        serviceCatalog: { select: { name: true } },
      },
    })) as AppointmentNextRow | null;

    if (!appointment) return null;

    return {
      scheduledAt: appointment.scheduledFor.toISOString(),
      reason: appointment.serviceCatalog?.name ?? 'Visit',
      staffName: appointment.vet?.fullName ?? '',
    };
  }
}
