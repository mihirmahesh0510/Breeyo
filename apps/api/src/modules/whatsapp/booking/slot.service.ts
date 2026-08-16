/**
 * WHA-03 / D-07, D-08, Pitfall 15 — pure slot generation from
 * `Clinic.workingHours` minus existing holds, capped and labelled for
 * Meta's interactive-list hard limits (07-RESEARCH § Pattern 8, § Cloud API
 * Constraints).
 *
 * `generateSlotsForDay` and `formatSlotLabel` are pure functions — every
 * input is already-resolved data (parsed hours, duration, held minutes, a
 * date, an optional "now") — following the `dosage.service.ts` pure-service
 * precedent, so they are fully testable without a database.
 *
 * `SlotService.getOfferableSlots` is the only method here that touches
 * Postgres. It parses the stored `Clinic.workingHours` JSON blob through
 * the REAL `workingHoursBodySchema` contract (clinic.schema.ts:11-19) with
 * `safeParse` at read time — a null value and a schema parse failure both
 * produce the identical explicit `NO_WORKING_HOURS` outcome rather than a
 * thrown exception, because a clinic that skipped the setup wizard must
 * never crash the booking flow (Pitfall 15).
 */

import type { DbClient } from '../../../lib/prisma-rls.js';
import { WA_CAPABILITY_LIMITS } from '@breeyo/types';
import { workingHoursBodySchema, type WorkingHoursBody } from '../../clinic/clinic.schema.js';
import { getTodayIST, addDaysIST, IST_TIMEZONE } from '../../../lib/ist-date.js';

/**
 * Matches `WhatsAppClinicConfig.slotDurationMinutes`'s Beta default
 * (schema.prisma). `SlotService` does not read the clinic's config row
 * itself (that would couple this pure-ish module to another repository) —
 * callers that know a clinic's configured duration may pass it explicitly.
 */
const DEFAULT_SLOT_DURATION_MINUTES = 30;

/** How many days ahead `getOfferableSlots` walks before giving up. */
const DEFAULT_HORIZON_DAYS = 14;

export type DayHours = WorkingHoursBody['hours'][string];

export interface GeneratedSlot {
  slotDate: Date;
  slotStartMinutes: number;
  slotDurationMinutes: number;
  label: string;
}

export type SlotUnavailableReason = 'NO_WORKING_HOURS' | 'FULLY_BOOKED';

export interface OfferableSlotsResult {
  slots: GeneratedSlot[];
  /** Present only when `slots` is empty — lets the caller choose reply copy
   * rather than inferring meaning from an empty array. */
  reason?: SlotUnavailableReason;
}

export interface GetOfferableSlotsOptions {
  fromDate?: Date;
  horizonDays?: number;
  durationMinutes?: number;
  now?: Date;
}

const WEEKDAY_KEYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

/**
 * A `@db.Date` column stores only a calendar date — Postgres/Prisma drop
 * the time-of-day on write and reconstruct the value at UTC midnight of
 * that SAME calendar date on read. An in-memory `getTodayIST`/`addDaysIST`
 * value is deliberately NOT UTC midnight (it is `Date.UTC(y, m, d, -5, -30)`
 * — 18:30 UTC on the preceding UTC calendar day, so it is IST-midnight
 * anchored). Both representations carry the identical UTC calendar-date
 * component for "the same day", so comparing `.getTime()` directly between
 * a DB-round-tripped `WhatsAppSlotHold.slotDate` and a freshly-generated
 * `addDaysIST` value NEVER matches even for the intended same day — this
 * key normalizes both to that shared UTC calendar-date string instead.
 */
function dateOnlyKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseHHMM(value: string): number {
  const [h, m] = value.split(':').map((part) => Number(part));
  return h * 60 + m;
}

/** IST weekday name (lowercase, matching workingHoursBodySchema's day keys — see clinic-profile.test.ts's `monday`/`tuesday` fixtures). */
function weekdayKeyIST(date: Date): (typeof WEEKDAY_KEYS)[number] {
  const long = date.toLocaleDateString('en-US', { timeZone: IST_TIMEZONE, weekday: 'long' });
  return long.toLowerCase() as (typeof WEEKDAY_KEYS)[number];
}

/**
 * 'Fri 14 Aug, 10:30 AM' — within `WA_CAPABILITY_LIMITS.maxListRowTitleChars`
 * (24). This is a real Meta interactive-list hard limit, not a preference —
 * a row title longer than 24 characters is rejected by the actual Cloud API.
 */
export function formatSlotLabel(date: Date, startMinutes: number): string {
  const weekday = date.toLocaleDateString('en-US', { timeZone: IST_TIMEZONE, weekday: 'short' });
  const day = date.toLocaleDateString('en-US', { timeZone: IST_TIMEZONE, day: '2-digit' });
  const month = date.toLocaleDateString('en-US', { timeZone: IST_TIMEZONE, month: 'short' });

  const hours24 = Math.floor(startMinutes / 60);
  const minutes = startMinutes % 60;
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const mm = String(minutes).padStart(2, '0');

  return `${weekday} ${day} ${month}, ${hours12}:${mm} ${period}`;
}

/**
 * Pure: generates every offerable slot for ONE day at `durationMinutes`
 * spacing within `[open, close)`, excluding held minutes and — when `date`
 * is IST-today relative to `now` — minutes already past. Never emits a
 * partial trailing slot that would end after close. Capped at
 * `WA_CAPABILITY_LIMITS.maxListRows` (10): a real Meta interactive list
 * permits at most 10 rows across all sections — a provider hard limit, not
 * a preference — so this pure function enforces it at the source rather
 * than trusting every caller to truncate later.
 */
export function generateSlotsForDay(
  date: Date,
  hours: DayHours,
  durationMinutes: number = DEFAULT_SLOT_DURATION_MINUTES,
  heldMinutes: readonly number[] = [],
  now: Date = new Date(),
): GeneratedSlot[] {
  if (hours.closed) {
    return [];
  }

  const openMinutes = parseHHMM(hours.open);
  const closeMinutes = parseHHMM(hours.close);
  const held = new Set(heldMinutes);

  const todayIST = getTodayIST(now);
  const isToday = date.getTime() === todayIST.getTime();
  const nowMinutesIST = Math.floor((now.getTime() - todayIST.getTime()) / 60000);

  const slots: GeneratedSlot[] = [];

  for (
    let start = openMinutes;
    start + durationMinutes <= closeMinutes;
    start += durationMinutes
  ) {
    if (held.has(start)) continue;
    if (isToday && start <= nowMinutesIST) continue;

    slots.push({
      slotDate: date,
      slotStartMinutes: start,
      slotDurationMinutes: durationMinutes,
      label: formatSlotLabel(date, start),
    });

    // Provider hard limit (WA_CAPABILITY_LIMITS.maxListRows) — see the
    // Cloud API Constraints reference in 07-RESEARCH.md.
    if (slots.length >= WA_CAPABILITY_LIMITS.maxListRows) break;
  }

  return slots;
}

export class SlotService {
  // D-30: widened from the admin `PrismaClient` to `DbClient` so a per-request
  // caller can pass `request.db` (RLS-enforced) instead of the admin role.
  // Read-only, no `$transaction` usage.
  constructor(private readonly prisma: DbClient) {}

  /**
   * Loads the clinic, parses `workingHours` through the real Zod contract,
   * loads existing `WhatsAppSlotHold` rows for the whole date range in ONE
   * query, then walks forward day by day accumulating slots until it has
   * `WA_CAPABILITY_LIMITS.maxListRows` (10) or exhausts the horizon.
   */
  async getOfferableSlots(
    clinicId: string,
    opts: GetOfferableSlotsOptions = {},
  ): Promise<OfferableSlotsResult> {
    const now = opts.now ?? new Date();
    const fromDate = opts.fromDate ?? getTodayIST(now);
    const horizonDays = opts.horizonDays ?? DEFAULT_HORIZON_DAYS;
    const durationMinutes = opts.durationMinutes ?? DEFAULT_SLOT_DURATION_MINUTES;

    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { workingHours: true },
    });

    // Pitfall 15: a missing clinic, a null blob, AND a malformed blob all
    // produce the identical explicit NO_WORKING_HOURS outcome rather than an
    // exception — a clinic that skipped the setup wizard must not crash the
    // booking flow.
    const parsed = workingHoursBodySchema.safeParse(clinic?.workingHours ?? null);
    if (!parsed.success) {
      return { slots: [], reason: 'NO_WORKING_HOURS' };
    }

    const toDateExclusive = addDaysIST(fromDate, horizonDays + 1);
    const holds = await this.prisma.whatsAppSlotHold.findMany({
      where: { clinicId, slotDate: { gte: fromDate, lt: toDateExclusive } },
      select: { slotDate: true, slotStartMinutes: true },
    });

    const heldByDate = new Map<string, number[]>();
    for (const hold of holds) {
      const key = dateOnlyKey(hold.slotDate);
      const list = heldByDate.get(key) ?? [];
      list.push(hold.slotStartMinutes);
      heldByDate.set(key, list);
    }

    const allSlots: GeneratedSlot[] = [];
    for (let dayOffset = 0; dayOffset <= horizonDays; dayOffset++) {
      const date = addDaysIST(fromDate, dayOffset);
      const dayHours = parsed.data.hours[weekdayKeyIST(date)];
      if (!dayHours) continue; // no entry for this weekday — treat as closed

      const heldMinutes = heldByDate.get(dateOnlyKey(date)) ?? [];
      const daySlots = generateSlotsForDay(date, dayHours, durationMinutes, heldMinutes, now);

      for (const slot of daySlots) {
        allSlots.push(slot);
        if (allSlots.length >= WA_CAPABILITY_LIMITS.maxListRows) break;
      }
      if (allSlots.length >= WA_CAPABILITY_LIMITS.maxListRows) break;
    }

    if (allSlots.length === 0) {
      return { slots: [], reason: 'FULLY_BOOKED' };
    }

    return { slots: allSlots };
  }
}
