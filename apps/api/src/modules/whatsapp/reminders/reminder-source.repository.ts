/**
 * WHA-01 / D-01, D-02 — latest-record-only due-date discovery over the
 * Phase 4 clinical-record tables (07-RESEARCH § Pitfall 3).
 *
 * Constructed with `fastify.prisma` (the admin-role client), matching
 * `VaccinationRepository` / `WhatsAppRepository` — every method takes an
 * explicit `clinicId` as its first argument rather than relying on RLS
 * (07-RESEARCH § Pitfall 5), so tenant scoping is provable from the `where`
 * clause alone.
 *
 * Pitfall 3: `VaccinationRecord` and `DewormingRecord` are append-only
 * history rows with no "superseded" flag — an old row's `nextDueDate` is
 * never cleared when a pet is revaccinated or redewormed. A flat
 * `findMany({ where: { nextDueDate: { in: dates } } })` would therefore fire
 * a reminder from an already-superseded record. `findLatestVaccinationsDue`
 * and `findLatestDewormingDue` copy the `findFirst` + `orderBy:
 * { administeredAt: 'desc' }` latest-per-key idiom from
 * `vaccination.repository.ts`'s `getLatestVaccinationByName` /
 * `getLatestDeworming` and use it to CONFIRM every due-window candidate is
 * still the latest record for its key before trusting its `nextDueDate` —
 * never trust the candidate's own `nextDueDate` in isolation.
 */

import type { DbClient } from '../../../lib/prisma-rls.js';
import type { WaReminderKind } from '@breeyo/types';

export type ReminderSourceType = 'CONSULTATION' | 'VACCINATION_RECORD' | 'DEWORMING_RECORD';

/** One discovered due-date source, carrying exactly the fields the task
 * upsert (Task 2) needs — never a template variable, never a phone number. */
export interface ReminderSourceRow {
  clinicId: string;
  ownerId: string;
  petId: string;
  kind: WaReminderKind;
  sourceType: ReminderSourceType;
  sourceId: string;
  /** Vaccine/drug name where applicable, or the follow-up reason; null otherwise. */
  sourceLabel: string | null;
  dueDate: Date;
}

/** A `WhatsAppMessage` row still `QUEUED` past the stranding threshold
 * (07-RESEARCH § Pitfall 1: a persisted row can outlive its BullMQ job if
 * Redis evicts it under `allkeys-lru` memory pressure). */
export interface StrandedMessageRow {
  id: string;
  clinicId: string;
  threadId: string;
  queuedAt: Date;
}

export class ReminderSourceRepository {
  constructor(private readonly prisma: DbClient) {}

  /** D-01: Consultation.followUpDate (Phase 4 D-09) drives the follow-up
   * reminder. Consultations with a null followUpDate never reach the sweep
   * because the `in: dates` filter can never match `null`, and the extra
   * `filter` below documents that guarantee rather than relying on it
   * silently. */
  async findFollowUpsDue(clinicId: string, dates: Date[]): Promise<ReminderSourceRow[]> {
    const consultations = await this.prisma.consultation.findMany({
      where: { clinicId, followUpDate: { in: dates } },
      include: { pet: { include: { owner: true } } },
    });

    return consultations
      .filter((c: { followUpDate: Date | null }) => c.followUpDate !== null)
      .map((c: any) => ({
        clinicId: c.clinicId,
        ownerId: c.pet.ownerId,
        petId: c.petId,
        kind: 'FOLLOW_UP' as const,
        sourceType: 'CONSULTATION' as const,
        sourceId: c.id,
        sourceLabel: c.followUpReason ?? null,
        dueDate: c.followUpDate as Date,
      }));
  }

  /** D-02, Pitfall 3: only the LATEST VaccinationRecord per (petId,
   * vaccineName) may produce a reminder. */
  async findLatestVaccinationsDue(clinicId: string, dates: Date[]): Promise<ReminderSourceRow[]> {
    const candidates = await this.prisma.vaccinationRecord.findMany({
      where: { clinicId, nextDueDate: { in: dates } },
      include: { pet: { include: { owner: true } } },
    });

    const rows: ReminderSourceRow[] = [];
    for (const candidate of candidates as any[]) {
      // Pitfall 3: confirm this candidate is still the latest record for its
      // (petId, vaccineName) key — an older, superseded candidate's
      // nextDueDate matching the due window is exactly the stale-reminder
      // bug this guard exists to prevent.
      const latest = await this.prisma.vaccinationRecord.findFirst({
        where: { clinicId, petId: candidate.petId, vaccineName: candidate.vaccineName },
        orderBy: { administeredAt: 'desc' },
      });
      if (!latest || latest.id !== candidate.id) {
        continue;
      }

      rows.push({
        clinicId: candidate.clinicId,
        ownerId: candidate.pet.ownerId,
        petId: candidate.petId,
        kind: 'VACCINE_DUE',
        sourceType: 'VACCINATION_RECORD',
        sourceId: candidate.id,
        sourceLabel: candidate.vaccineName,
        dueDate: candidate.nextDueDate as Date,
      });
    }
    return rows;
  }

  /** D-02, Pitfall 3: the same latest-record rule as vaccinations, keyed by
   * `petId` only — deworming has no vaccine-name dimension. */
  async findLatestDewormingDue(clinicId: string, dates: Date[]): Promise<ReminderSourceRow[]> {
    const candidates = await this.prisma.dewormingRecord.findMany({
      where: { clinicId, nextDueDate: { in: dates } },
      include: { pet: { include: { owner: true } } },
    });

    const rows: ReminderSourceRow[] = [];
    for (const candidate of candidates as any[]) {
      const latest = await this.prisma.dewormingRecord.findFirst({
        where: { clinicId, petId: candidate.petId },
        orderBy: { administeredAt: 'desc' },
      });
      if (!latest || latest.id !== candidate.id) {
        continue; // superseded (Pitfall 3) — a newer deworming record exists for this pet
      }

      rows.push({
        clinicId: candidate.clinicId,
        ownerId: candidate.pet.ownerId,
        petId: candidate.petId,
        kind: 'DEWORMING_DUE',
        sourceType: 'DEWORMING_RECORD',
        sourceId: candidate.id,
        sourceLabel: candidate.drugName ?? null,
        dueDate: candidate.nextDueDate as Date,
      });
    }
    return rows;
  }

  /**
   * 07-RESEARCH § Pitfall 1: persist-then-dispatch means a `QUEUED` message
   * row can outlive its BullMQ job if Redis evicts it under
   * `allkeys-lru` memory pressure. Re-driving those in the daily sweep turns
   * a silent-loss failure mode into a bounded delay. `clinicId: null` scopes
   * across every clinic — mirroring `midnight-archive.ts`'s cross-clinic
   * archive sweep — since a stranded message is a technical, not a
   * per-tenant, condition.
   */
  async findStrandedQueuedMessages(
    clinicId: string | null,
    olderThanMinutes: number,
  ): Promise<StrandedMessageRow[]> {
    const threshold = new Date(Date.now() - olderThanMinutes * 60 * 1000);
    return this.prisma.whatsAppMessage.findMany({
      where: {
        ...(clinicId ? { clinicId } : {}),
        status: 'QUEUED',
        queuedAt: { lt: threshold },
      },
    }) as unknown as Promise<StrandedMessageRow[]>;
  }
}
