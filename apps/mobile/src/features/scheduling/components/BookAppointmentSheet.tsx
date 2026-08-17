import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, FlatList, ScrollView, StyleSheet, Pressable } from 'react-native';
import { Text, TextInput, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { BottomSheet, Button, AccordionItem, showToast } from '@breeyo/ui';
import {
  SPECIES_ICONS,
  BOOKING_HORIZON_DAYS,
  RecurrenceInterval,
  RECURRENCE_MIN_OCCURRENCES,
  RECURRENCE_MAX_OCCURRENCES,
  RECURRENCE_INTERVAL_DAYS,
  minutesToHHMM,
} from '@breeyo/types';
import type { OwnerWithPets, Pet, SlotOption } from '@breeyo/types';
import { useLookupOwner } from '../../patient/hooks/usePatientRegister';
import { useServiceCatalog } from '../../billing/hooks/useServiceCatalog';
import { useClinicVets, useOfferableSlots } from '../hooks/useSchedule';
import { useCreateAppointment } from '../hooks/useAppointmentActions';

const IST_TIME_ZONE = 'Asia/Kolkata';

// D-19: verbatim from `CheckInSheet.tsx` -- the exact mobile-number lookup
// flow already proven at check-in.
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
  return date.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: IST_TIME_ZONE,
  });
}

function formatLongDate(date: Date): string {
  return date.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: IST_TIME_ZONE,
  });
}

/** `en-IN`, 12-hour, uppercased AM/PM -- matches `agenda-utils.ts`'s convention. */
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

export interface BookAppointmentSheetProps {
  visible: boolean;
  onDismiss: () => void;
  /** Pre-selects the vet when the agenda's own vet filter is active. */
  defaultVetId?: string | null;
  defaultDate?: Date;
}

/**
 * D-19/D-21/D-02/D-04/D-07/D-14/D-22 -- the 8-step progressive-disclosure
 * booking flow. Structurally mirrors `CheckInSheet.tsx` for the owner/pet
 * lookup (steps 1-2), diverging deliberately at step 2 for multi-pet select
 * (D-21).
 */
export function BookAppointmentSheet({
  visible,
  onDismiss,
  defaultVetId = null,
  defaultDate,
}: BookAppointmentSheetProps) {
  const router = useRouter();

  const [mobileDisplay, setMobileDisplay] = useState('');
  const [selectedPetIds, setSelectedPetIds] = useState<Set<string>>(new Set());
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [selectedVetId, setSelectedVetId] = useState<string | null>(defaultVetId);
  const [selectedDate, setSelectedDate] = useState<Date>(defaultDate ?? new Date());
  const [selectedSlot, setSelectedSlot] = useState<SlotOption | null>(null);
  const [serverDoubleBookError, setServerDoubleBookError] = useState(false);
  const [repeatExpanded, setRepeatExpanded] = useState(false);
  const [recurrenceEnabled, setRecurrenceEnabled] = useState(false);
  const [recurrenceInterval, setRecurrenceInterval] = useState<RecurrenceInterval>(RecurrenceInterval.WEEKLY);
  const [occurrences, setOccurrences] = useState(RECURRENCE_MIN_OCCURRENCES);

  const mobile = extractDigits(mobileDisplay);
  const isValidMobile = /^[6-9]\d{9}$/.test(mobile);

  const lookupQuery = useLookupOwner(mobile);
  const { data: services } = useServiceCatalog();
  const { data: vets } = useClinicVets();
  const createAppointment = useCreateAppointment();

  // `useLookupOwner`'s own queryFn already unwraps the `{ data }` envelope
  // (see `usePatientRegister.ts`), so `lookupQuery.data` is `OwnerWithPets`
  // directly -- not double-wrapped.
  const ownerData = lookupQuery.data as OwnerWithPets | undefined;
  const isLooking = lookupQuery.isFetching;
  const ownerNotFound = isValidMobile && !isLooking && !ownerData;

  const { data: slots, isFetching: isSlotsLoading } = useOfferableSlots(
    selectedVetId ?? undefined,
    selectedDate,
    selectedServiceId ?? undefined,
  );

  // Reset on close, matching `CheckInSheet.tsx`'s own reset-on-close effect.
  useEffect(() => {
    if (!visible) {
      setMobileDisplay('');
      setSelectedPetIds(new Set());
      setSelectedServiceId(null);
      setSelectedVetId(defaultVetId);
      setSelectedDate(defaultDate ?? new Date());
      setSelectedSlot(null);
      setServerDoubleBookError(false);
      setRepeatExpanded(false);
      setRecurrenceEnabled(false);
      setRecurrenceInterval(RecurrenceInterval.WEEKLY);
      setOccurrences(RECURRENCE_MIN_OCCURRENCES);
    }
  }, [visible, defaultVetId, defaultDate]);

  // A solo-vet clinic never shows a vet chooser -- auto-select the one vet.
  useEffect(() => {
    if (vets && vets.length === 1 && !selectedVetId) {
      setSelectedVetId(vets[0].id);
    }
  }, [vets, selectedVetId]);

  const handleMobileChange = useCallback((text: string) => {
    setMobileDisplay(formatMobile(text));
  }, []);

  const togglePet = useCallback((petId: string) => {
    setSelectedPetIds((prev) => {
      const next = new Set(prev);
      if (next.has(petId)) {
        next.delete(petId);
      } else {
        next.add(petId);
      }
      return next;
    });
  }, []);

  const handleRegisterNew = useCallback(() => {
    onDismiss();
    router.push({
      pathname: '/patient/register',
      params: { initialMobile: mobile, fromCheckIn: '1' },
    });
  }, [onDismiss, router, mobile]);

  const handleSelectDate = useCallback((date: Date) => {
    setSelectedDate(date);
    setSelectedSlot(null);
    setServerDoubleBookError(false);
  }, []);

  const handleSelectSlot = useCallback((slot: SlotOption) => {
    setSelectedSlot(slot);
    setServerDoubleBookError(false);
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

  const primaryPetName = ownerData?.pets.find((pet) => selectedPetIds.has(pet.id))?.name ?? 'Appointment';
  const selectedVetName = vets?.find((v) => v.id === selectedVetId)?.name ?? '';
  const showDoubleBookWarning = (selectedSlot?.isDoubleBooked ?? false) || serverDoubleBookError;

  const canConfirm =
    !!ownerData &&
    selectedPetIds.size > 0 &&
    !!selectedServiceId &&
    !!selectedVetId &&
    !!selectedSlot;

  const submitBooking = useCallback(
    (options: { allowDoubleBook: boolean }) => {
      if (!ownerData || !selectedServiceId || !selectedVetId || !selectedSlot) return;

      const isoDate = istDateKey(selectedDate);
      const hhmm = minutesToHHMM(selectedSlot.startMinutes);
      const scheduledFor = `${isoDate}T${hhmm}:00+05:30`;
      const requestedOccurrences = occurrences;

      createAppointment.mutate(
        {
          ownerId: ownerData.id,
          petIds: Array.from(selectedPetIds),
          vetId: selectedVetId,
          serviceCatalogId: selectedServiceId,
          scheduledFor,
          allowDoubleBook: options.allowDoubleBook,
          recurrence: recurrenceEnabled
            ? { interval: recurrenceInterval, occurrences: requestedOccurrences }
            : undefined,
        },
        {
          onSuccess: (result) => {
            const { appointments, warnings } = result.data;
            if (appointments.length > 1) {
              showToast('success', `${appointments.length} appointments booked for ${primaryPetName}`);
            } else {
              showToast(
                'success',
                `${primaryPetName} booked for ${formatSlotTime(selectedSlot.startMinutes)}, ${formatLongDate(selectedDate)}`,
              );
            }
            if (warnings.some((warning) => warning.code === 'RECURRENCE_TRUNCATED')) {
              showToast(
                'info',
                `Only ${appointments.length} of ${requestedOccurrences} repeats fit within ${BOOKING_HORIZON_DAYS} days. The rest were not created.`,
              );
            }
            onDismiss();
          },
          onError: (error: any) => {
            if (error?.code === 'SLOT_DOUBLE_BOOKED') {
              setServerDoubleBookError(true);
            }
            // SLOT_TAKEN, BOOKING_HORIZON_EXCEEDED, SLOT_BLOCKED and
            // VET_NOT_AVAILABLE already carry UI-SPEC copy from the server
            // in `error.message` -- rendered inline rather than restated.
          },
        },
      );
    },
    [
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
      primaryPetName,
    ],
  );

  const handleConfirm = useCallback(() => {
    submitBooking({ allowDoubleBook: false });
  }, [submitBooking]);

  const handleBookAnyway = useCallback(() => {
    submitBooking({ allowDoubleBook: true });
  }, [submitBooking]);

  const handlePickAnotherTime = useCallback(() => {
    setSelectedSlot(null);
    setServerDoubleBookError(false);
  }, []);

  const renderPetItem = useCallback(
    ({ item }: { item: Pet }) => {
      const selected = selectedPetIds.has(item.id);
      const speciesKey = (item.species || 'OTHER') as keyof typeof SPECIES_ICONS;
      const iconName = SPECIES_ICONS[speciesKey] || 'paw';

      return (
        <Pressable
          onPress={() => togglePet(item.id)}
          style={styles.petRow}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: selected }}
          accessibilityLabel={`${selected ? 'Deselect' : 'Select'} ${item.name}`}
        >
          <MaterialCommunityIcons
            name={selected ? 'checkbox-marked' : 'checkbox-blank-outline'}
            size={22}
            color={selected ? '#2E7D32' : '#79747E'}
          />
          <View style={styles.petIcon}>
            <MaterialCommunityIcons name={iconName as any} size={20} color="#5D4037" />
          </View>
          <Text variant="bodyLarge" style={styles.petName}>
            {item.name}
          </Text>
        </Pressable>
      );
    },
    [selectedPetIds, togglePet],
  );

  const showVetStep = !!selectedServiceId;
  const showMultiVetChooser = showVetStep && (vets?.length ?? 0) > 1;
  const showDateStep = showVetStep && !!selectedVetId;
  const showSlotStep = showDateStep;
  const showRepeatStep = !!selectedSlot;

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} title="Book Appointment">
      <ScrollView>
        {/* Step 1: owner lookup (D-19) */}
        <TextInput
          label="Mobile Number"
          value={mobileDisplay}
          onChangeText={handleMobileChange}
          keyboardType="phone-pad"
          maxLength={11}
          placeholder="Enter 10-digit mobile number"
          left={<TextInput.Icon icon="phone" />}
          style={styles.mobileInput}
          testID="book-appointment-mobile-input"
        />

        {isLooking ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" />
            <Text variant="bodySmall" style={styles.loadingText}>
              Looking up patient...
            </Text>
          </View>
        ) : null}

        {ownerNotFound ? (
          <View style={styles.notFoundSection}>
            <Text variant="titleMedium">New patient</Text>
            <Text variant="bodySmall" style={styles.notFoundText}>
              No records found for this number.
            </Text>
            <Button variant="outlined" label="Register New Patient" onPress={handleRegisterNew} icon="account-plus" />
          </View>
        ) : null}

        {/* Step 2: multi-pet select (D-21) -- the deliberate divergence from CheckInSheet */}
        {ownerData ? (
          <View style={styles.ownerSection}>
            <Text variant="titleMedium">{ownerData.name}</Text>
            <Text variant="bodySmall" style={styles.instructions}>
              Select at least one pet
            </Text>
            <FlatList
              data={ownerData.pets}
              keyExtractor={(item) => item.id}
              renderItem={renderPetItem}
              scrollEnabled={false}
            />
          </View>
        ) : null}

        {/* Step 3: service (D-02) */}
        {ownerData && selectedPetIds.size > 0 ? (
          <View style={styles.stepSection}>
            <Text variant="titleMedium" style={styles.stepTitle}>
              Service
            </Text>
            {(services ?? []).map((service) => {
              const selected = selectedServiceId === service.id;
              return (
                <Pressable
                  key={service.id}
                  onPress={() => setSelectedServiceId(service.id)}
                  style={styles.serviceRow}
                  accessibilityRole="button"
                  accessibilityLabel={service.name}
                >
                  <Text variant="bodyLarge" style={styles.serviceName}>
                    {service.name}
                  </Text>
                  {selected ? <MaterialCommunityIcons name="check" size={20} color="#2E7D32" /> : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {/* Step 4: vet (D-04) -- hidden entirely for a solo-vet clinic */}
        {showMultiVetChooser ? (
          <View style={styles.stepSection}>
            <Text variant="titleMedium" style={styles.stepTitle}>
              Vet
            </Text>
            <View style={styles.vetChipRow}>
              {(vets ?? []).map((vet) => (
                <Pressable
                  key={vet.id}
                  onPress={() => setSelectedVetId(vet.id)}
                  style={[styles.vetChip, selectedVetId === vet.id && styles.vetChipSelected]}
                  accessibilityRole="button"
                  accessibilityLabel={vet.name}
                >
                  <Text variant="bodyMedium" style={selectedVetId === vet.id ? styles.vetChipTextSelected : styles.vetChipText}>
                    {vet.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {/* Step 5: date, capped at BOOKING_HORIZON_DAYS -- past-the-cap dates are disabled, not hidden */}
        {showDateStep ? (
          <View style={styles.stepSection}>
            <Text variant="titleMedium" style={styles.stepTitle}>
              Date
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {dateOptions.map((date) => {
                const disabled = date.getTime() > maxDate.getTime();
                const selected = istDateKey(date) === istDateKey(selectedDate);
                return (
                  <Pressable
                    key={istDateKey(date)}
                    disabled={disabled}
                    onPress={() => handleSelectDate(date)}
                    style={[styles.dateChip, selected && styles.dateChipSelected, disabled && styles.dateChipDisabled]}
                    accessibilityRole="button"
                    accessibilityLabel={formatShortDate(date)}
                    accessibilityState={{ disabled, selected }}
                  >
                    <Text
                      variant="bodySmall"
                      style={disabled ? styles.dateChipTextDisabled : selected ? styles.dateChipTextSelected : styles.dateChipText}
                    >
                      {formatShortDate(date)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {/* Step 6: slot (D-14) -- taken slots are shown with a warning, never hidden */}
        {showSlotStep ? (
          <View style={styles.stepSection}>
            <Text variant="titleMedium" style={styles.stepTitle}>
              Slot
            </Text>
            {!selectedVetId ? (
              <Text variant="bodySmall" style={styles.helperCaption}>
                Pick a service to see open slots.
              </Text>
            ) : isSlotsLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" />
                <Text variant="bodySmall" style={styles.loadingText}>
                  Finding open slots…
                </Text>
              </View>
            ) : (
              <View style={styles.slotGrid}>
                {(slots ?? []).map((slot) => {
                  const label = formatSlotTime(slot.startMinutes);
                  const selected = selectedSlot?.startMinutes === slot.startMinutes;
                  return (
                    <Pressable
                      key={slot.startMinutes}
                      onPress={() => handleSelectSlot(slot)}
                      style={[
                        styles.slotChip,
                        slot.isDoubleBooked && styles.slotChipTaken,
                        selected && styles.slotChipSelected,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={slot.isDoubleBooked ? `${label}, already booked` : label}
                    >
                      {slot.isDoubleBooked ? (
                        <MaterialCommunityIcons name="alert-circle-outline" size={12} color="#E65100" />
                      ) : null}
                      <Text variant="bodySmall" style={slot.isDoubleBooked ? styles.slotChipTakenText : styles.slotChipText}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        ) : null}

        {/* Double-booking warning (D-14): never a blocking modal, never a hard block */}
        {showDoubleBookWarning && selectedSlot ? (
          <View style={styles.warningStrip}>
            <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#E65100" />
            <Text variant="bodySmall" style={styles.warningText}>
              Dr. {selectedVetName} already has {primaryPetName} at {formatSlotTime(selectedSlot.startMinutes)}. You can still book this slot.
            </Text>
            <View style={styles.warningButtons}>
              <Button variant="filled" label="Book Anyway" onPress={handleBookAnyway} />
              <Button variant="outlined" label="Pick Another Time" onPress={handlePickAnotherTime} />
            </View>
          </View>
        ) : null}

        {/* Step 7: repeat (D-22), collapsed by default */}
        {showRepeatStep ? (
          <AccordionItem
            title="Repeat this appointment"
            expanded={repeatExpanded}
            onToggle={() => setRepeatExpanded((prev) => !prev)}
          >
            <View style={styles.repeatIntervalRow}>
              {[RecurrenceInterval.WEEKLY, RecurrenceInterval.FORTNIGHTLY, RecurrenceInterval.FOUR_WEEKLY].map(
                (interval) => (
                  <Pressable
                    key={interval}
                    onPress={() => {
                      setRecurrenceEnabled(true);
                      setRecurrenceInterval(interval);
                    }}
                    style={[
                      styles.vetChip,
                      recurrenceEnabled && recurrenceInterval === interval && styles.vetChipSelected,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={RECURRENCE_LABELS[interval]}
                  >
                    <Text
                      variant="bodyMedium"
                      style={
                        recurrenceEnabled && recurrenceInterval === interval
                          ? styles.vetChipTextSelected
                          : styles.vetChipText
                      }
                    >
                      {RECURRENCE_LABELS[interval]}
                    </Text>
                  </Pressable>
                ),
              )}
            </View>

            <View style={styles.stepperRow}>
              <Text variant="bodyLarge">Number of times</Text>
              <Pressable
                onPress={() => setOccurrences((n) => Math.max(RECURRENCE_MIN_OCCURRENCES, n - 1))}
                style={styles.stepperButton}
                accessibilityRole="button"
                accessibilityLabel="Fewer repeats"
              >
                <MaterialCommunityIcons name="minus" size={18} color="#49454F" />
              </Pressable>
              <Text variant="titleMedium">{occurrences}</Text>
              <Pressable
                onPress={() => setOccurrences((n) => Math.min(RECURRENCE_MAX_OCCURRENCES, n + 1))}
                style={styles.stepperButton}
                accessibilityRole="button"
                accessibilityLabel="More repeats"
              >
                <MaterialCommunityIcons name="plus" size={18} color="#49454F" />
              </Pressable>
            </View>

            {recurrenceEnabled ? (
              <Text variant="bodySmall" style={styles.recurrencePreview}>
                {occurrences} appointments through {formatLongDate(lastOccurrenceDate)}
              </Text>
            ) : null}
          </AccordionItem>
        ) : null}

        {/* Step 8: confirm */}
        <View style={styles.footerRow}>
          <Button variant="text" label="Discard Booking" onPress={onDismiss} disabled={createAppointment.isPending} />
          <Button
            variant="filled"
            label="Confirm Booking"
            onPress={handleConfirm}
            disabled={!canConfirm}
            loading={createAppointment.isPending}
          />
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  mobileInput: {
    marginBottom: 16,
    backgroundColor: '#FFFBF5',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
    justifyContent: 'center',
  },
  loadingText: {
    color: '#49454F',
  },
  notFoundSection: {
    marginTop: 16,
    alignItems: 'center',
    gap: 8,
  },
  notFoundText: {
    color: '#49454F',
  },
  ownerSection: {
    marginTop: 8,
  },
  instructions: {
    color: '#2E7D32',
    fontWeight: '500',
    marginBottom: 8,
  },
  petRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F0EB',
    minHeight: 56,
  },
  petIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F5F0EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  petName: {
    flex: 1,
  },
  stepSection: {
    marginTop: 24,
  },
  stepTitle: {
    marginBottom: 8,
  },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F0EB',
  },
  serviceName: {
    color: '#1C1B1F',
  },
  vetChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  vetChip: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#CAC4D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vetChipSelected: {
    backgroundColor: '#C8E6C9',
    borderColor: '#2E7D32',
  },
  vetChipText: {
    color: '#1C1B1F',
  },
  vetChipTextSelected: {
    color: '#1B5E20',
  },
  dateChip: {
    minHeight: 44,
    minWidth: 72,
    paddingHorizontal: 12,
    marginRight: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CAC4D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateChipSelected: {
    backgroundColor: '#C8E6C9',
    borderColor: '#2E7D32',
  },
  dateChipDisabled: {
    opacity: 0.4,
  },
  dateChipText: {
    color: '#1C1B1F',
  },
  dateChipTextSelected: {
    color: '#1B5E20',
  },
  dateChipTextDisabled: {
    color: '#79747E',
  },
  helperCaption: {
    color: '#49454F',
  },
  slotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  slotChip: {
    minHeight: 44,
    minWidth: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CAC4D0',
    backgroundColor: '#FFFBF5',
  },
  slotChipSelected: {
    borderColor: '#2E7D32',
    borderWidth: 2,
  },
  slotChipTaken: {
    backgroundColor: '#F5F0EB',
  },
  slotChipText: {
    color: '#1C1B1F',
  },
  slotChipTakenText: {
    color: '#49454F',
  },
  warningStrip: {
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FFE0B2',
    gap: 8,
  },
  warningText: {
    color: '#BF360C',
  },
  warningButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  repeatIntervalRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepperButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recurrencePreview: {
    marginTop: 8,
    color: '#49454F',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 24,
    marginBottom: 8,
  },
});
