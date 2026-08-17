'use client';

// The web booking drawer -- the SAME eight progressive-disclosure steps as
// mobile's `BookAppointmentSheet.tsx` (plan 08-12), in the same order, per
// UI-SPEC "Booking flow (SCH-01) -- identical steps on both surfaces":
//   1. Find the owner (mobile lookup)   5. Pick date
//   2. Pick pets (multi-select)         6. Pick slot
//   3. Pick service                     7. Repeat (collapsed)
//   4. Pick vet (hidden, solo vet)      8. Confirm / Discard
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BOOKING_HORIZON_DAYS,
  RecurrenceInterval,
  RECURRENCE_MIN_OCCURRENCES,
  RECURRENCE_MAX_OCCURRENCES,
  RECURRENCE_INTERVAL_DAYS,
  minutesToHHMM,
} from '@breeyo/types';
import type { SlotOption, ServiceCatalog } from '@breeyo/types';
import { apiClient, ApiClientError } from '../../src/lib/api';
import { useAuth, handleUnauthorized } from '../../src/lib/AuthProvider';
import { useOfferableSlots, useCreateAppointment, useRescheduleAppointment } from '../../src/lib/useSchedule';
import type { ClinicVet } from '../../src/lib/useSchedule';
import type { AppointmentWithDetails } from '@breeyo/types';
import styles from './schedule.module.css';

const IST_TIME_ZONE = 'Asia/Kolkata';

// The Prisma `ServiceCatalog` model has a `durationMinutes` column
// (`apps/api/prisma/schema.prisma:680`, default 15) that the shared
// `ServiceCatalog` type in `packages/types/src/billing.ts` does not declare
// -- a pre-existing gap in the shared type, not introduced here. The real
// `GET /api/v1/billing/services` response includes the field (no `select`
// narrows it away), so this extends the type locally rather than papering
// over a field the API actually sends.
type ServiceCatalogEntry = ServiceCatalog & { durationMinutes: number };

interface OwnerPet {
  id: string;
  name: string;
  species: string;
}

interface OwnerWithPets {
  id: string;
  name: string;
  mobile: string;
  pets: OwnerPet[];
}

function formatMobile(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 10);
  if (digits.length > 5) {
    return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  return digits;
}

function extractDigits(formatted: string): string {
  return formatted.replace(/\D/g, '');
}

function istDateKey(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: IST_TIME_ZONE });
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: IST_TIME_ZONE });
}

function formatLongDate(date: Date): string {
  return date.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: IST_TIME_ZONE });
}

function formatSlotTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const anchor = new Date(Date.UTC(2000, 0, 1, hours, mins));
  return anchor
    .toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' })
    .toUpperCase();
}

const RECURRENCE_LABELS: Record<RecurrenceInterval, string> = {
  [RecurrenceInterval.WEEKLY]: 'Every week',
  [RecurrenceInterval.FORTNIGHTLY]: 'Every 2 weeks',
  [RecurrenceInterval.FOUR_WEEKLY]: 'Every 4 weeks',
};

/** Local, one-off owner lookup -- see the `ServiceCatalogEntry` comment above
 * for why this isn't a shared `useSchedule.ts` hook: owner/pet lookup is a
 * patient-module concern with no web patient feature yet, so this stays
 * scoped to the one drawer that needs it rather than growing a new lib file
 * this plan doesn't declare. */
function useOwnerLookup(mobile: string) {
  const { accessToken } = useAuth();
  const [data, setData] = useState<OwnerWithPets | undefined>(undefined);
  const [isFetching, setIsFetching] = useState(false);
  const isValidMobile = /^[6-9]\d{9}$/.test(mobile);

  useEffect(() => {
    if (!isValidMobile || !accessToken) {
      setData(undefined);
      return;
    }
    const controller = new AbortController();
    setIsFetching(true);
    apiClient<{ data: OwnerWithPets }>(`/api/v1/owners/lookup?mobile=${encodeURIComponent(mobile)}`, {
      token: accessToken,
      signal: controller.signal,
    })
      .then((response) => {
        if (controller.signal.aborted) return;
        setData(response.data);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (handleUnauthorized(error)) return;
        setData(undefined);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsFetching(false);
      });
    return () => controller.abort();
  }, [mobile, isValidMobile, accessToken]);

  return { data, isFetching, isValidMobile };
}

function useServiceCatalog() {
  const { accessToken, activeClinicId } = useAuth();
  const [data, setData] = useState<ServiceCatalogEntry[]>([]);

  useEffect(() => {
    if (!accessToken || !activeClinicId) return;
    const controller = new AbortController();
    apiClient<{ data: ServiceCatalogEntry[] }>('/api/v1/billing/services', {
      token: accessToken,
      signal: controller.signal,
    })
      .then((response) => {
        if (!controller.signal.aborted) setData(response.data);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) handleUnauthorized(error);
      });
    return () => controller.abort();
  }, [accessToken, activeClinicId]);

  return data;
}

export interface BookAppointmentDrawerProps {
  visible: boolean;
  onDismiss: () => void;
  defaultVetId: string | null;
  defaultDayIndex: number;
  defaultStartMinutes: number;
  days: Date[];
  vets: ClinicVet[];
  /**
   * Set when this drawer is opened from AppointmentDrawer's "Move
   * Appointment" action rather than "New Appointment". Skips the
   * owner/pet/service/vet steps (already fixed by the existing appointment)
   * and routes Confirm through `useRescheduleAppointment` (PATCH) instead of
   * `useCreateAppointment` (POST), matching mobile's `AppointmentQuickSheet`
   * move flow.
   */
  reschedulingAppointment?: AppointmentWithDetails | null;
}

export function BookAppointmentDrawer({
  visible,
  onDismiss,
  defaultVetId,
  defaultDayIndex,
  days,
  vets,
  reschedulingAppointment = null,
}: BookAppointmentDrawerProps) {
  const defaultDate = days[defaultDayIndex] ?? new Date();
  const isRescheduling = !!reschedulingAppointment;

  const [mobileDisplay, setMobileDisplay] = useState('');
  const [selectedPetIds, setSelectedPetIds] = useState<Set<string>>(new Set());
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [selectedVetId, setSelectedVetId] = useState<string | null>(defaultVetId);
  const [selectedDate, setSelectedDate] = useState<Date>(defaultDate);
  const [selectedSlot, setSelectedSlot] = useState<SlotOption | null>(null);
  const [serverDoubleBookError, setServerDoubleBookError] = useState(false);
  const [serverErrorMessage, setServerErrorMessage] = useState<string | null>(null);
  const [recurrenceTruncatedMessage, setRecurrenceTruncatedMessage] = useState<string | null>(null);
  const [repeatExpanded, setRepeatExpanded] = useState(false);
  const [recurrenceEnabled, setRecurrenceEnabled] = useState(false);
  const [recurrenceInterval, setRecurrenceInterval] = useState<RecurrenceInterval>(RecurrenceInterval.WEEKLY);
  const [occurrences, setOccurrences] = useState(RECURRENCE_MIN_OCCURRENCES);

  const mobile = extractDigits(mobileDisplay);
  const { data: ownerData, isFetching: isLooking, isValidMobile } = useOwnerLookup(mobile);
  const ownerNotFound = isValidMobile && !isLooking && !ownerData;

  const services = useServiceCatalog();
  const { data: slots, isLoading: isSlotsLoading } = useOfferableSlots(
    selectedVetId ?? undefined,
    selectedDate,
    selectedServiceId ?? undefined,
  );
  const createAppointment = useCreateAppointment();
  const rescheduleAppointment = useRescheduleAppointment();

  // Prefill from the appointment being moved -- runs after the `!visible`
  // reset effect below re-applies the plain "new appointment" defaults, so
  // every reopen (including a second Move on a different appointment while
  // the drawer stays mounted) starts from that appointment's own vet/service/
  // date rather than whatever was left over from the previous session.
  useEffect(() => {
    if (visible && reschedulingAppointment) {
      setSelectedVetId(reschedulingAppointment.vetId);
      setSelectedServiceId(reschedulingAppointment.serviceCatalogId);
      setSelectedDate(new Date(reschedulingAppointment.scheduledFor));
      setSelectedSlot(null);
    }
  }, [visible, reschedulingAppointment]);

  useEffect(() => {
    if (!visible) {
      setMobileDisplay('');
      setSelectedPetIds(new Set());
      setSelectedServiceId(null);
      setSelectedVetId(defaultVetId);
      setSelectedDate(defaultDate);
      setSelectedSlot(null);
      setServerDoubleBookError(false);
      setServerErrorMessage(null);
      setRecurrenceTruncatedMessage(null);
      setRepeatExpanded(false);
      setRecurrenceEnabled(false);
      setRecurrenceInterval(RecurrenceInterval.WEEKLY);
      setOccurrences(RECURRENCE_MIN_OCCURRENCES);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // A solo-vet clinic never shows a vet chooser -- auto-select the one vet.
  useEffect(() => {
    if (vets.length === 1 && !selectedVetId) {
      setSelectedVetId(vets[0].id);
    }
  }, [vets, selectedVetId]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onDismiss();
    }
    if (visible) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [visible, onDismiss]);

  const togglePet = useCallback((petId: string) => {
    setSelectedPetIds((prev) => {
      const next = new Set(prev);
      if (next.has(petId)) next.delete(petId);
      else next.add(petId);
      return next;
    });
  }, []);

  const handleSelectDate = useCallback((date: Date) => {
    setSelectedDate(date);
    setSelectedSlot(null);
    setServerDoubleBookError(false);
    setServerErrorMessage(null);
  }, []);

  const handleSelectSlot = useCallback((slot: SlotOption) => {
    setSelectedSlot(slot);
    setServerDoubleBookError(false);
    setServerErrorMessage(null);
  }, []);

  const maxDate = useMemo(() => addDays(new Date(), BOOKING_HORIZON_DAYS), []);
  const dateOptions = useMemo(
    () => Array.from({ length: BOOKING_HORIZON_DAYS + 10 }, (_, i) => addDays(new Date(), i)),
    [],
  );

  const lastOccurrenceDate = useMemo(
    () => addDays(selectedDate, RECURRENCE_INTERVAL_DAYS[recurrenceInterval] * (occurrences - 1)),
    [selectedDate, recurrenceInterval, occurrences],
  );

  const primaryPetName =
    ownerData?.pets.find((pet) => selectedPetIds.has(pet.id))?.name ??
    reschedulingAppointment?.pets[0]?.pet.name ??
    'Appointment';
  const selectedVetName = vets.find((v) => v.id === selectedVetId)?.name ?? '';
  const showDoubleBookWarning = (selectedSlot?.isDoubleBooked ?? false) || serverDoubleBookError;

  const canConfirm = isRescheduling
    ? !!selectedSlot
    : !!ownerData && selectedPetIds.size > 0 && !!selectedServiceId && !!selectedVetId && !!selectedSlot;

  const submitBooking = useCallback(
    async (options: { allowDoubleBook: boolean }) => {
      if (!selectedSlot) return;

      const isoDate = istDateKey(selectedDate);
      const hhmm = minutesToHHMM(selectedSlot.startMinutes);
      const scheduledFor = `${isoDate}T${hhmm}:00+05:30`;

      if (reschedulingAppointment) {
        try {
          await rescheduleAppointment.mutate({
            appointmentId: reschedulingAppointment.id,
            scheduledFor,
            allowDoubleBook: options.allowDoubleBook,
          });
          onDismiss();
        } catch (error) {
          if (error instanceof ApiClientError) {
            if (error.code === 'SLOT_DOUBLE_BOOKED') {
              setServerDoubleBookError(true);
              return;
            }
            setServerErrorMessage(error.message);
          }
        }
        return;
      }

      if (!ownerData || !selectedServiceId || !selectedVetId) return;
      const requestedOccurrences = occurrences;

      try {
        const result = await createAppointment.mutate({
          ownerId: ownerData.id,
          petIds: Array.from(selectedPetIds),
          vetId: selectedVetId,
          serviceCatalogId: selectedServiceId,
          scheduledFor,
          allowDoubleBook: options.allowDoubleBook,
          recurrence: recurrenceEnabled
            ? { interval: recurrenceInterval, occurrences: requestedOccurrences }
            : undefined,
        });

        const { appointments, warnings } = result.data;
        if (warnings.some((warning) => warning.code === 'RECURRENCE_TRUNCATED')) {
          setRecurrenceTruncatedMessage(
            `Only ${appointments.length} of ${requestedOccurrences} repeats fit within ${BOOKING_HORIZON_DAYS} days. The rest were not created.`,
          );
        }
        onDismiss();
      } catch (error) {
        if (error instanceof ApiClientError) {
          if (error.code === 'SLOT_DOUBLE_BOOKED') {
            setServerDoubleBookError(true);
            return;
          }
          // SLOT_TAKEN, BOOKING_HORIZON_EXCEEDED, SLOT_BLOCKED and
          // VET_NOT_AVAILABLE already carry UI-SPEC copy from the server in
          // `error.message` -- rendered inline rather than restated.
          setServerErrorMessage(error.message);
        }
      }
    },
    [
      reschedulingAppointment,
      rescheduleAppointment,
      ownerData,
      selectedServiceId,
      selectedVetId,
      selectedSlot,
      selectedDate,
      selectedPetIds,
      recurrenceEnabled,
      recurrenceInterval,
      occurrences,
      createAppointment,
      onDismiss,
    ],
  );

  const handleConfirm = useCallback(() => submitBooking({ allowDoubleBook: false }), [submitBooking]);
  const handleBookAnyway = useCallback(() => submitBooking({ allowDoubleBook: true }), [submitBooking]);
  const handlePickAnotherTime = useCallback(() => {
    setSelectedSlot(null);
    setServerDoubleBookError(false);
  }, []);

  if (!visible) {
    return null;
  }

  const showOwnerStep = !isRescheduling;
  const showVetStep = isRescheduling || !!selectedServiceId;
  const showMultiVetChooser = !isRescheduling && showVetStep && vets.length > 1;
  const showDateStep = showVetStep && !!selectedVetId;
  const showSlotStep = showDateStep;
  const showRepeatStep = !isRescheduling && !!selectedSlot;

  return (
    <>
      <div className={styles.drawerOverlay} onClick={onDismiss} />
      <div
        className={styles.drawerPanel}
        role="dialog"
        aria-modal="true"
        aria-label={isRescheduling ? 'Move Appointment' : 'Book Appointment'}
      >
        <div className={styles.drawerHeader}>
          <h2 className={styles.drawerTitle}>{isRescheduling ? 'Move Appointment' : 'Book Appointment'}</h2>
          <button type="button" className={styles.drawerCloseButton} onClick={onDismiss} aria-label="Close">
            ×
          </button>
        </div>

        <div className={styles.drawerBody}>
          {showOwnerStep ? (
            <>
              {/* Step 1: owner lookup (D-19) */}
              <div className={styles.formField}>
                <label className={styles.formLabel} htmlFor="booking-mobile">
                  Mobile Number
                </label>
                <input
                  id="booking-mobile"
                  className={styles.textInput}
                  type="tel"
                  inputMode="numeric"
                  maxLength={11}
                  placeholder="Enter 10-digit mobile number"
                  value={mobileDisplay}
                  onChange={(event) => setMobileDisplay(formatMobile(event.target.value))}
                />
              </div>

              {isLooking ? <p className={styles.helperCaption}>Looking up patient…</p> : null}

              {ownerNotFound ? (
                <p className={styles.helperCaption}>
                  No records found for this number. Register the patient from the mobile app, then look them up again
                  here.
                </p>
              ) : null}

              {/* Step 2: multi-pet select (D-21) */}
              {ownerData ? (
                <>
                  <p className={styles.sectionTitle}>{ownerData.name}</p>
                  <p className={styles.helperCaption}>Select at least one pet</p>
                  {ownerData.pets.map((pet) => {
                    const selected = selectedPetIds.has(pet.id);
                    return (
                      <button
                        key={pet.id}
                        type="button"
                        className={styles.petCheckboxRow}
                        onClick={() => togglePet(pet.id)}
                        aria-pressed={selected}
                        aria-label={`${selected ? 'Deselect' : 'Select'} ${pet.name}`}
                      >
                        <input type="checkbox" checked={selected} readOnly />
                        {pet.name}
                      </button>
                    );
                  })}
                </>
              ) : null}

              {/* Step 3: service (D-02) */}
              {ownerData && selectedPetIds.size > 0 ? (
                <>
                  <p className={styles.sectionTitle}>Service</p>
                  {services.map((service) => {
                    const selected = selectedServiceId === service.id;
                    return (
                      <button
                        key={service.id}
                        type="button"
                        className={styles.serviceRow}
                        onClick={() => setSelectedServiceId(service.id)}
                        aria-pressed={selected}
                      >
                        <span>
                          {service.name} · {service.durationMinutes} min
                        </span>
                        {selected ? <span aria-hidden="true">✓</span> : null}
                      </button>
                    );
                  })}
                </>
              ) : null}
            </>
          ) : null}

          {/* Step 4: vet (D-04) -- hidden entirely for a solo-vet clinic */}
          {showMultiVetChooser ? (
            <>
              <p className={styles.sectionTitle}>Vet</p>
              <div className={styles.chipRow}>
                {vets.map((vet) => (
                  <button
                    key={vet.id}
                    type="button"
                    className={`${styles.chip} ${selectedVetId === vet.id ? styles.chipSelected : ''}`}
                    onClick={() => setSelectedVetId(vet.id)}
                  >
                    {vet.name}
                  </button>
                ))}
              </div>
            </>
          ) : null}

          {/* Step 5: date, capped at BOOKING_HORIZON_DAYS -- past-the-cap dates are disabled, not hidden */}
          {showDateStep ? (
            <>
              <p className={styles.sectionTitle}>Date</p>
              <div className={styles.chipRow} style={{ flexWrap: 'nowrap', overflowX: 'auto' }}>
                {dateOptions.map((date) => {
                  const disabled = date.getTime() > maxDate.getTime();
                  const selected = istDateKey(date) === istDateKey(selectedDate);
                  return (
                    <button
                      key={istDateKey(date)}
                      type="button"
                      disabled={disabled}
                      onClick={() => handleSelectDate(date)}
                      className={[styles.chip, selected ? styles.chipSelected : '', disabled ? styles.chipDisabled : '']
                        .filter(Boolean)
                        .join(' ')}
                      aria-disabled={disabled}
                    >
                      {formatShortDate(date)}
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}

          {/* Step 6: slot (D-14) -- taken slots are shown, not hidden */}
          {showSlotStep ? (
            <>
              <p className={styles.sectionTitle}>Slot</p>
              {!selectedVetId ? (
                <p className={styles.helperCaption}>Pick a service to see open slots.</p>
              ) : isSlotsLoading ? (
                <p className={styles.helperCaption}>Finding open slots…</p>
              ) : (
                <div className={styles.chipRow}>
                  {(slots ?? []).map((slot) => {
                    const label = formatSlotTime(slot.startMinutes);
                    const selected = selectedSlot?.startMinutes === slot.startMinutes;
                    return (
                      <button
                        key={slot.startMinutes}
                        type="button"
                        onClick={() => handleSelectSlot(slot)}
                        className={[styles.chip, slot.isDoubleBooked ? styles.chipTaken : '', selected ? styles.chipSelected : '']
                          .filter(Boolean)
                          .join(' ')}
                        aria-label={slot.isDoubleBooked ? `${label}, already booked` : label}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          ) : null}

          {serverErrorMessage ? <p className={styles.errorText}>{serverErrorMessage}</p> : null}
          {recurrenceTruncatedMessage ? <p className={styles.inlineNoticeStrip}>{recurrenceTruncatedMessage}</p> : null}

          {/* Double-booking warning (D-14): never a blocking modal, never a hard block */}
          {showDoubleBookWarning && selectedSlot ? (
            <div className={styles.warningStrip}>
              <p style={{ margin: 0 }}>
                Dr. {selectedVetName} already has {primaryPetName} at {formatSlotTime(selectedSlot.startMinutes)}. You can
                still book this slot.
              </p>
              <div className={styles.warningButtonRow}>
                <button type="button" className={styles.buttonFilled} onClick={handleBookAnyway}>
                  Book Anyway
                </button>
                <button type="button" className={styles.buttonOutlined} onClick={handlePickAnotherTime}>
                  Pick Another Time
                </button>
              </div>
            </div>
          ) : null}

          {/* Step 7: repeat (D-22), collapsed by default */}
          {showRepeatStep ? (
            <>
              <button
                type="button"
                className={styles.accordionHeader}
                onClick={() => setRepeatExpanded((prev) => !prev)}
                aria-expanded={repeatExpanded}
              >
                Repeat this appointment
                <span aria-hidden="true">{repeatExpanded ? '▲' : '▼'}</span>
              </button>
              {repeatExpanded ? (
                <div className={styles.accordionBody}>
                  <div className={styles.chipRow}>
                    {[RecurrenceInterval.WEEKLY, RecurrenceInterval.FORTNIGHTLY, RecurrenceInterval.FOUR_WEEKLY].map(
                      (interval) => (
                        <button
                          key={interval}
                          type="button"
                          className={[
                            styles.chip,
                            recurrenceEnabled && recurrenceInterval === interval ? styles.chipSelected : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onClick={() => {
                            setRecurrenceEnabled(true);
                            setRecurrenceInterval(interval);
                          }}
                        >
                          {RECURRENCE_LABELS[interval]}
                        </button>
                      ),
                    )}
                  </div>

                  <div className={styles.stepperRow}>
                    <span>Number of times</span>
                    <button
                      type="button"
                      className={styles.stepperButton}
                      onClick={() => setOccurrences((n) => Math.max(RECURRENCE_MIN_OCCURRENCES, n - 1))}
                      aria-label="Fewer repeats"
                    >
                      −
                    </button>
                    <span>{occurrences}</span>
                    <button
                      type="button"
                      className={styles.stepperButton}
                      onClick={() => setOccurrences((n) => Math.min(RECURRENCE_MAX_OCCURRENCES, n + 1))}
                      aria-label="More repeats"
                    >
                      +
                    </button>
                  </div>

                  {recurrenceEnabled ? (
                    <p className={styles.recurrencePreview}>
                      {occurrences} appointments through {formatLongDate(lastOccurrenceDate)}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        {/* Step 8: confirm */}
        <div className={styles.drawerFooter}>
          <button
            type="button"
            className={styles.buttonText}
            onClick={onDismiss}
            disabled={isRescheduling ? rescheduleAppointment.isPending : createAppointment.isPending}
          >
            {isRescheduling ? 'Discard Move' : 'Discard Booking'}
          </button>
          <button
            type="button"
            className={styles.buttonFilled}
            onClick={handleConfirm}
            disabled={!canConfirm || (isRescheduling ? rescheduleAppointment.isPending : createAppointment.isPending)}
          >
            {isRescheduling ? 'Confirm Move' : 'Confirm Booking'}
          </button>
        </div>
      </div>
    </>
  );
}
