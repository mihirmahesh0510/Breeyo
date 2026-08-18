import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, ScrollView, Switch, TextInput, Alert } from 'react-native';
import { Text, Chip, Button, ActivityIndicator } from 'react-native-paper';
import { showToast, SkeletonLoader, EmptyState } from '@breeyo/ui';
import {
  BlockedPeriodReason,
  BLOCKED_PERIOD_REASON_LABELS,
  hhmmToMinutes,
  formatMinutesRange,
} from '@breeyo/types';
import { useAuth } from '../../../providers/AuthProvider';
import { useClinicVets } from '../hooks/useSchedule';
import {
  useAvailabilityTemplate,
  useSaveAvailabilityTemplate,
  useSaveAvailabilityOverride,
  useBlockedPeriods,
  useDeleteBlockedPeriod,
} from '../hooks/useAvailability';
import {
  defaultAvailabilityForm,
  toTemplatePayload,
  fromTemplateResponse,
  type AvailabilityDayForm,
} from '../lib/availability-form';
import { BlockedPeriodSheet } from '../components/BlockedPeriodSheet';

interface AvailabilitySettingsScreenProps {
  vetId?: string;
}

function formatDateLabel(date: Date): string {
  return date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

function isoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function AvailabilitySettingsScreen({ vetId: vetIdParam }: AvailabilitySettingsScreenProps) {
  const { user } = useAuth();
  const vetsQuery = useClinicVets();

  const [selectedVetId, setSelectedVetId] = useState<string | null>(vetIdParam ?? null);

  // Default to the signed-in user when they are a vet; otherwise the first
  // clinic vet. Solo-vet clinics never show a picker, so this is the only
  // selection they ever get.
  useEffect(() => {
    if (selectedVetId || !vetsQuery.data || vetsQuery.data.length === 0) return;
    const signedInAsVet = vetsQuery.data.find((v) => v.id === user?.id);
    setSelectedVetId(signedInAsVet?.id ?? vetsQuery.data[0].id);
  }, [vetsQuery.data, selectedVetId, user]);

  const selectedVet = vetsQuery.data?.find((v) => v.id === selectedVetId) ?? null;
  const isSoloVetClinic = (vetsQuery.data?.length ?? 0) <= 1;

  // --- Weekly hours (D-01, D-04) ---
  const templateQuery = useAvailabilityTemplate(selectedVetId ?? undefined);
  const saveTemplate = useSaveAvailabilityTemplate();
  const [days, setDays] = useState<AvailabilityDayForm[] | null>(null);
  const initializedVetRef = useRef<string | null>(null);
  // The last known-good (server-confirmed) form state -- distinct from
  // `days`, which may hold in-progress edits. `Go Back` on the D-30 warning
  // re-submits THIS, not whatever is currently in `days`.
  const lastSavedDaysRef = useRef<AvailabilityDayForm[] | null>(null);

  useEffect(() => {
    if (!selectedVetId || !templateQuery.data) return;
    if (initializedVetRef.current === selectedVetId) return;
    initializedVetRef.current = selectedVetId;
    if (templateQuery.data.length > 0) {
      const initial = fromTemplateResponse(templateQuery.data);
      setDays(initial);
      lastSavedDaysRef.current = initial;
    } else {
      setDays(null);
      lastSavedDaysRef.current = null;
    }
  }, [selectedVetId, templateQuery.data]);

  const handleStartSettingHours = useCallback(() => {
    setDays(defaultAvailabilityForm());
  }, []);

  const updateDay = useCallback((weekday: number, updates: Partial<AvailabilityDayForm>) => {
    setDays((prev) => (prev ? prev.map((d) => (d.weekday === weekday ? { ...d, ...updates } : d)) : prev));
  }, []);

  const performSaveWeeklyHours = useCallback(
    (daysToSave: AvailabilityDayForm[]) => {
      if (!selectedVetId) return;
      let payload;
      try {
        payload = toTemplatePayload(daysToSave);
      } catch (err) {
        showToast('error', (err as Error).message);
        return;
      }

      // Captured before the mutation fires -- this is what `Go Back` needs
      // to restore, since the upsert is about to overwrite it.
      const preSaveDays = lastSavedDaysRef.current;

      saveTemplate.mutate(
        { vetId: selectedVetId, days: payload },
        {
          onSuccess: (result) => {
            const count = result.data.affectedAppointmentCount;
            if (count > 0) {
              Alert.alert(
                `${count} appointments already booked outside these new hours`,
                'Changing your hours will not cancel them. Move or cancel them first.',
                [
                  {
                    text: 'Go Back',
                    onPress: () => {
                      if (!preSaveDays) return;
                      const revertPayload = toTemplatePayload(preSaveDays);
                      saveTemplate.mutate(
                        { vetId: selectedVetId, days: revertPayload },
                        {
                          onSuccess: () => {
                            setDays(preSaveDays);
                            lastSavedDaysRef.current = preSaveDays;
                            showToast('info', 'Restored your previous weekly hours');
                          },
                        },
                      );
                    },
                  },
                  { text: 'Save Anyway' },
                ],
              );
              // The write has already applied -- "Save Anyway" keeps it, so
              // the tracked last-known-good state moves forward regardless
              // of which button the user eventually taps (Go Back overwrites
              // it again above if chosen).
              lastSavedDaysRef.current = daysToSave;
            } else {
              lastSavedDaysRef.current = daysToSave;
              showToast('success', 'Weekly hours saved');
            }
          },
          onError: () => {
            showToast('error', 'Could not save weekly hours. Try again.');
          },
        },
      );
    },
    [selectedVetId, saveTemplate],
  );

  const handleSaveWeeklyHours = useCallback(() => {
    if (!days) return;
    performSaveWeeklyHours(days);
  }, [days, performSaveWeeklyHours]);

  const handleClearHours = useCallback(() => {
    const vetName = selectedVet?.name ?? 'this vet';
    Alert.alert(
      'Clear weekly hours?',
      `Staff will not be able to book appointments for Dr. ${vetName} until you set hours again.`,
      [
        { text: 'Keep Hours', style: 'cancel' },
        {
          text: 'Clear Hours',
          style: 'destructive',
          onPress: () => {
            const cleared = defaultAvailabilityForm().map((d) => ({ ...d, isClosed: true }));
            setDays(cleared);
            performSaveWeeklyHours(cleared);
          },
        },
      ],
    );
  }, [selectedVet, performSaveWeeklyHours]);

  // --- Date overrides (D-01) ---
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [overrideChoice, setOverrideChoice] = useState<'CLOSED' | 'HALF_DAY'>('CLOSED');
  const [overrideOpenTime, setOverrideOpenTime] = useState('09:00');
  const [overrideCloseTime, setOverrideCloseTime] = useState('13:00');
  const saveOverride = useSaveAvailabilityOverride();

  const handleSaveOverride = useCallback(() => {
    if (!selectedVetId) return;
    const isClosed = overrideChoice === 'CLOSED';
    let openMinutes: number | null = null;
    let closeMinutes: number | null = null;

    if (!isClosed) {
      try {
        openMinutes = hhmmToMinutes(overrideOpenTime);
        closeMinutes = hhmmToMinutes(overrideCloseTime);
        if (closeMinutes <= openMinutes) {
          showToast('error', 'End time must be after start time.');
          return;
        }
      } catch {
        showToast('error', 'End time must be after start time.');
        return;
      }
    }

    saveOverride.mutate(
      { vetId: selectedVetId, date: selectedDate, isClosed, openMinutes, closeMinutes },
      {
        onSuccess: (result) => {
          const count = result.data.affectedAppointmentCount;
          const dateLabel = formatDateLabel(selectedDate);
          if (count > 0) {
            Alert.alert(
              `${count} appointments already booked on ${dateLabel}`,
              'Marking this day off will not cancel them. Move or cancel them first.',
              [
                {
                  text: 'Go Back',
                  onPress: () => {
                    // No DELETE endpoint exists for availability overrides
                    // (only PUT/upsert) -- re-upsert using the vet's normal
                    // weekly-template hours for that weekday so the day
                    // behaves normally again, mirroring "delete the
                    // override" functionally even though the override row
                    // itself is not removed.
                    const weekday = selectedDate.getDay();
                    const templateDay = days?.find((d) => d.weekday === weekday);
                    const revertClosed = templateDay?.isClosed ?? true;
                    saveOverride.mutate(
                      {
                        vetId: selectedVetId,
                        date: selectedDate,
                        isClosed: revertClosed,
                        openMinutes: revertClosed || !templateDay ? null : hhmmToMinutes(templateDay.openTime),
                        closeMinutes: revertClosed || !templateDay ? null : hhmmToMinutes(templateDay.closeTime),
                      },
                      {
                        onSuccess: () => showToast('info', 'Nothing changed'),
                      },
                    );
                  },
                },
                { text: 'Mark Day Off Anyway', style: 'destructive' },
              ],
            );
          } else {
            showToast('success', isClosed ? 'Day marked off' : 'Half day saved');
          }
        },
        onError: () => showToast('error', 'Could not save. Try again.'),
      },
    );
  }, [selectedVetId, selectedDate, overrideChoice, overrideOpenTime, overrideCloseTime, saveOverride, days]);

  // --- Blocked periods (D-05) ---
  const blockedPeriodsQuery = useBlockedPeriods(selectedDate, selectedVetId ?? undefined);
  const deleteBlockedPeriod = useDeleteBlockedPeriod();
  const [blockSheetVisible, setBlockSheetVisible] = useState(false);

  const handleRemoveBlockedPeriod = useCallback(
    (blockedPeriodId: string, reasonLabel: string, timeRange: string) => {
      Alert.alert(
        'Remove this blocked period?',
        `${reasonLabel}, ${timeRange} on ${formatDateLabel(selectedDate)}. Those slots become bookable again.`,
        [
          { text: 'Keep Blocked Time', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => {
              deleteBlockedPeriod.mutate(blockedPeriodId, {
                onSuccess: () => showToast('success', 'Blocked period removed'),
              });
            },
          },
        ],
      );
    },
    [selectedDate, deleteBlockedPeriod],
  );

  // --- Render states ---
  const isLoading = vetsQuery.isLoading || (!!selectedVetId && templateQuery.isLoading);
  const isError = vetsQuery.isError || templateQuery.isError;

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text variant="headlineSmall" style={styles.title}>
          Edit Availability
        </Text>
        <View style={styles.content}>
          <SkeletonLoader type="listRow" count={7} />
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.container}>
        <Text variant="headlineSmall" style={styles.title}>
          Edit Availability
        </Text>
        <View style={styles.errorContainer}>
          <Text variant="bodyLarge" style={styles.errorText}>
            Could not load availability.
          </Text>
          <Button
            mode="outlined"
            onPress={() => {
              vetsQuery.refetch();
              templateQuery.refetch();
            }}
          >
            Try Again
          </Button>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text variant="headlineSmall" style={styles.title}>
        Edit Availability
      </Text>

      {!isSoloVetClinic && vetsQuery.data && (
        <View style={styles.vetPickerRow}>
          {vetsQuery.data.map((vet) => (
            <Chip
              key={vet.id}
              selected={vet.id === selectedVetId}
              onPress={() => setSelectedVetId(vet.id)}
              style={styles.chip}
              mode="outlined"
            >
              {vet.name}
            </Chip>
          ))}
        </View>
      )}

      {/* Weekly hours section */}
      <View style={styles.section}>
        <Text variant="titleMedium" style={styles.sectionTitle}>
          Weekly Hours
        </Text>

        {!days ? (
          <EmptyState
            title="No working hours set yet"
            description="Set your weekly hours so staff can book appointments against your calendar."
            actionLabel="Set Weekly Hours"
            onAction={handleStartSettingHours}
            testID="no-hours-empty-state"
          />
        ) : (
          <>
            {days.map((day) => (
              <View key={day.weekday} style={styles.dayRow}>
                <View style={styles.dayHeader}>
                  <Text variant="bodyLarge" style={styles.dayLabel}>
                    {day.label}
                  </Text>
                  <View style={styles.closedToggle}>
                    <Text variant="bodySmall" style={styles.closedLabel}>
                      Closed
                    </Text>
                    <Switch
                      value={day.isClosed}
                      onValueChange={(value) => updateDay(day.weekday, { isClosed: value })}
                      testID={`closed-toggle-${day.label}`}
                    />
                  </View>
                </View>

                {!day.isClosed && (
                  <View style={styles.timeRow}>
                    <TextInput
                      style={styles.timeInput}
                      value={day.openTime}
                      onChangeText={(value) => updateDay(day.weekday, { openTime: value })}
                      placeholder="09:00"
                      testID={`open-time-${day.label}`}
                    />
                    <Text variant="bodyMedium">to</Text>
                    <TextInput
                      style={styles.timeInput}
                      value={day.closeTime}
                      onChangeText={(value) => updateDay(day.weekday, { closeTime: value })}
                      placeholder="18:00"
                      testID={`close-time-${day.label}`}
                    />
                  </View>
                )}
              </View>
            ))}

            <View style={styles.actionsRow}>
              <Button
                mode="contained"
                onPress={handleSaveWeeklyHours}
                loading={saveTemplate.isPending}
                buttonColor="#2E7D32"
              >
                Save Weekly Hours
              </Button>
              <Button mode="text" onPress={handleClearHours} textColor="#BA1A1A">
                Clear Hours
              </Button>
            </View>
          </>
        )}
      </View>

      {/* Date overrides section */}
      {days && (
        <View style={styles.section}>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Date Override
          </Text>
          <Text variant="bodyMedium" style={styles.dateLabel}>
            {formatDateLabel(selectedDate)}
          </Text>

          <View style={styles.choiceRow}>
            <Chip
              selected={overrideChoice === 'CLOSED'}
              onPress={() => setOverrideChoice('CLOSED')}
              style={styles.chip}
              mode="outlined"
            >
              Closed all day
            </Chip>
            <Chip
              selected={overrideChoice === 'HALF_DAY'}
              onPress={() => setOverrideChoice('HALF_DAY')}
              style={styles.chip}
              mode="outlined"
            >
              Half day
            </Chip>
          </View>

          {overrideChoice === 'HALF_DAY' && (
            <View style={styles.timeRow}>
              <TextInput
                style={styles.timeInput}
                value={overrideOpenTime}
                onChangeText={setOverrideOpenTime}
                placeholder="09:00"
                testID="override-open-time"
              />
              <Text variant="bodyMedium">to</Text>
              <TextInput
                style={styles.timeInput}
                value={overrideCloseTime}
                onChangeText={setOverrideCloseTime}
                placeholder="13:00"
                testID="override-close-time"
              />
            </View>
          )}

          <Button
            mode="contained"
            onPress={handleSaveOverride}
            loading={saveOverride.isPending}
            buttonColor="#2E7D32"
            style={styles.saveOverrideButton}
          >
            Save Date Override
          </Button>
        </View>
      )}

      {/* Blocked periods section */}
      {days && (
        <View style={styles.section}>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Blocked Time
          </Text>

          {blockedPeriodsQuery.isLoading && <ActivityIndicator size="small" />}

          {!blockedPeriodsQuery.isLoading && (blockedPeriodsQuery.data?.length ?? 0) === 0 && (
            <EmptyState
              title={`No blocked time on ${formatDateLabel(selectedDate)}`}
              description="Add lunch or a meeting so those slots aren't offered."
              testID="no-blocked-periods-empty-state"
            />
          )}

          {(blockedPeriodsQuery.data ?? []).map((period) => {
            const reasonLabel =
              period.reason === BlockedPeriodReason.OTHER && period.reasonText
                ? period.reasonText
                : BLOCKED_PERIOD_REASON_LABELS[period.reason];
            const timeRange = formatMinutesRange(period.startMinutes, period.endMinutes);
            return (
              <View key={period.id} style={styles.blockedRow}>
                <Text variant="bodyLarge">
                  {reasonLabel} · {timeRange}
                </Text>
                <Button
                  mode="text"
                  textColor="#BA1A1A"
                  onPress={() => handleRemoveBlockedPeriod(period.id, reasonLabel, timeRange)}
                >
                  Remove
                </Button>
              </View>
            );
          })}

          <Button
            mode="outlined"
            onPress={() => setBlockSheetVisible(true)}
            style={styles.blockTimeButton}
          >
            Block Time
          </Button>
        </View>
      )}

      {selectedVetId && (
        <BlockedPeriodSheet
          visible={blockSheetVisible}
          onDismiss={() => setBlockSheetVisible(false)}
          vetId={selectedVetId}
          date={selectedDate}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFBF5',
  },
  content: {
    padding: 16,
    paddingBottom: 48,
  },
  title: {
    marginBottom: 16,
    color: '#1C1B1F',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  errorText: {
    textAlign: 'center',
    color: '#49454F',
  },
  vetPickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    marginBottom: 4,
  },
  section: {
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F0EB',
  },
  sectionTitle: {
    marginBottom: 12,
    color: '#1C1B1F',
  },
  dayRow: {
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F0EB',
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 44,
  },
  dayLabel: {
    fontWeight: '600',
    color: '#1C1B1F',
  },
  closedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  closedLabel: {
    color: '#49454F',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  timeInput: {
    borderWidth: 1,
    borderColor: '#CAC4D0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#1C1B1F',
    textAlign: 'center',
    minWidth: 72,
    minHeight: 44,
  },
  actionsRow: {
    marginTop: 8,
    gap: 8,
  },
  dateLabel: {
    marginBottom: 12,
    color: '#49454F',
  },
  choiceRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  saveOverrideButton: {
    marginTop: 12,
  },
  blockedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 44,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F0EB',
  },
  blockTimeButton: {
    marginTop: 12,
  },
});
