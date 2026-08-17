import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Alert, SectionList } from 'react-native';
import { Text, FAB, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { EmptyState, SkeletonLoader, showToast, BreeyoIconButton } from '@breeyo/ui';
import { AppointmentStatus, formatMinutesRange } from '@breeyo/types';
import type { AppointmentWithDetails } from '@breeyo/types';
import { useSchedule, useResolvedAvailability, useClinicVets } from '../hooks/useSchedule';
import { useScheduleSocket } from '../hooks/useScheduleSocket';
import { useUpdateAppointmentStatus, useCancelAppointment } from '../hooks/useAppointmentActions';
import { useScheduleUIStore } from '../store/scheduleUIStore';
import { groupAppointmentsByTimeOfDay, isPastOnToday, splitIndexForNowIndicator } from '../lib/agenda-utils';
import { DateNavigator } from '../components/DateNavigator';
import { VetFilterBar } from '../components/VetFilterBar';
import { AppointmentRow } from '../components/AppointmentRow';
import { NowIndicator } from '../components/NowIndicator';
import { BookAppointmentSheet } from '../components/BookAppointmentSheet';
import { AppointmentQuickSheet } from '../components/AppointmentQuickSheet';
import { QueueSectionHeader } from '../../queue/components/QueueSectionHeader';

const IST_TIME_ZONE = 'Asia/Kolkata';

function istDateKey(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: IST_TIME_ZONE });
}

function formatLongDate(date: Date): string {
  return date.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: IST_TIME_ZONE,
  });
}

export function DayAgendaScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ appointmentId?: string; date?: string }>();

  // useScheduleSocket() is called first, purely for its connection side
  // effect (SCH-04) -- before useSchedule() reads the cache it invalidates.
  useScheduleSocket();

  const isOffline = useScheduleUIStore((s) => s.isOffline);
  const selectedDate = useScheduleUIStore((s) => s.selectedDate);
  const setSelectedDate = useScheduleUIStore((s) => s.setSelectedDate);
  const vetFilter = useScheduleUIStore((s) => s.vetFilter);
  const setVetFilter = useScheduleUIStore((s) => s.setVetFilter);

  const [quickSheetAppointment, setQuickSheetAppointment] = useState<AppointmentWithDetails | null>(null);
  const [bookSheetVisible, setBookSheetVisible] = useState(false);

  const {
    data: appointments,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useSchedule(selectedDate, vetFilter ?? undefined);

  const { data: resolvedAvailability } = useResolvedAvailability(selectedDate, vetFilter);
  const { data: vets } = useClinicVets();

  const updateStatus = useUpdateAppointmentStatus();
  const cancelAppointment = useCancelAppointment();

  const sortedVetIds = useMemo(() => (vets ?? []).map((v) => v.id).sort(), [vets]);

  // Deep-link handling: `/schedule?date=...` (plan 08-09 push notifications,
  // plan 08-08's queue-board deep link string) jumps the agenda to that day.
  useEffect(() => {
    if (!params.date) return;
    const parsed = new Date(params.date);
    if (!Number.isNaN(parsed.getTime())) {
      setSelectedDate(parsed);
    }
    // Only ever consumed once per navigation -- intentionally excludes
    // `setSelectedDate` from deps beyond mount-time param changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.date]);

  // `/schedule?appointmentId=...` (plan 08-08's ExpectedActionSheet "View
  // Appointment") opens the quick sheet on that appointment once it's in
  // the loaded day's data. `consumedAppointmentIdRef` guards against a
  // refetch (window refocus, reconnect, an unrelated socket-driven cache
  // invalidation) giving `appointments` a new array reference and re-firing
  // this effect after the sheet the user opened from this param was already
  // dismissed -- it is only consumed once per distinct `appointmentId`.
  const consumedAppointmentIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!params.appointmentId || !appointments) return;
    if (consumedAppointmentIdRef.current === params.appointmentId) return;
    const match = appointments.find((a) => a.id === params.appointmentId);
    if (match) {
      setQuickSheetAppointment(match);
      consumedAppointmentIdRef.current = params.appointmentId;
    }
  }, [params.appointmentId, appointments]);

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleRowPress = useCallback((appointment: AppointmentWithDetails) => {
    setQuickSheetAppointment(appointment);
  }, []);

  const handleCheckIn = useCallback(
    (appointmentId: string) => {
      updateStatus.mutate(
        { appointmentId, status: AppointmentStatus.CHECKED_IN },
        {
          onSuccess: () => {
            showToast('success', 'Checked in');
          },
          onError: () => {
            showToast('error', 'Could not check in. Try again.');
          },
        },
      );
    },
    [updateStatus],
  );

  const handleCancel = useCallback(
    (appointment: AppointmentWithDetails) => {
      const timeLabel = formatLongDate(new Date(appointment.scheduledFor));
      Alert.alert(
        'Cancel this appointment?',
        `${appointment.pets[0]?.pet.name ?? 'This appointment'} at ${new Date(
          appointment.scheduledFor,
        ).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: IST_TIME_ZONE })} on ${timeLabel} will be cancelled. ${appointment.owner.name} gets a WhatsApp update.`,
        [
          { text: 'Keep Appointment', style: 'cancel' },
          {
            text: 'Cancel Appointment',
            style: 'destructive',
            onPress: () => {
              cancelAppointment.mutate(
                { appointmentId: appointment.id, scope: 'ONE' },
                {
                  onSuccess: () => {
                    showToast('success', 'Appointment cancelled');
                  },
                  onError: () => {
                    showToast('error', 'Could not cancel this appointment. Try again.');
                  },
                },
              );
            },
          },
        ],
      );
    },
    [cancelAppointment],
  );

  const sections = useMemo(
    () => (appointments ? groupAppointmentsByTimeOfDay(appointments) : []),
    [appointments],
  );

  const isVetFiltered = vetFilter != null;
  const filteredVetName = isVetFiltered ? vets?.find((v) => v.id === vetFilter)?.name : undefined;
  const filteredVetHours = isVetFiltered
    ? resolvedAvailability?.find((entry) => entry.vetId === vetFilter)?.hours
    : undefined;
  const vetNotWorkingToday = isVetFiltered && resolvedAvailability != null && filteredVetHours === null;

  const blockedBands = useMemo(
    () => (resolvedAvailability ?? []).flatMap((entry) => entry.blockedRanges.map((range) => ({ ...range, vetId: entry.vetId }))),
    [resolvedAvailability],
  );

  const now = useMemo(() => new Date(), [appointments]);

  const renderSection = useCallback(
    ({ item, section, index }: { item: AppointmentWithDetails; section: (typeof sections)[number]; index: number }) => {
      const localSplitIndex = splitIndexForNowIndicator(section.data, selectedDate, now);
      const showIndicatorBefore = localSplitIndex === index;

      return (
        <>
          {showIndicatorBefore ? <NowIndicator /> : null}
          <AppointmentRow
            appointment={item}
            sortedVetIds={sortedVetIds}
            isPast={isPastOnToday(new Date(item.scheduledFor), selectedDate)}
            onPress={() => handleRowPress(item)}
            onSwipeCheckIn={() => handleCheckIn(item.id)}
            onSwipeCancel={() => handleCancel(item)}
          />
        </>
      );
    },
    [sortedVetIds, selectedDate, now, handleRowPress, handleCheckIn, handleCancel],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: (typeof sections)[number] }) => (
      <QueueSectionHeader
        title={section.title}
        count={section.data.length}
        status={section.title.toUpperCase() as any}
      />
    ),
    [],
  );

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <Text variant="headlineSmall" style={styles.title}>
          Schedule
        </Text>
        <BreeyoIconButton
          icon="calendar-clock"
          onPress={() => router.push('/availability' as any)}
          accessibilityLabel="Manage availability"
          testID="availability-button"
        />
      </View>

      {isOffline ? (
        <View style={styles.offlineBanner} accessibilityRole="alert">
          <MaterialCommunityIcons name="wifi-off" size={16} color="#BF360C" />
          <Text variant="bodySmall" style={styles.offlineBannerText}>
            You are offline. Schedule may be outdated.
          </Text>
        </View>
      ) : null}

      <DateNavigator selectedDate={selectedDate} onSelectDate={setSelectedDate} />

      <VetFilterBar vets={vets ?? []} selectedVetId={vetFilter} onSelectVet={setVetFilter} />

      {blockedBands.length > 0 ? (
        <View style={styles.blockedBandsContainer}>
          {blockedBands.map((band, idx) => (
            <View key={`${band.vetId}-${idx}`} style={styles.blockedBand}>
              <MaterialCommunityIcons name="block-helper" size={16} color="#49454F" />
              <Text variant="bodySmall" style={styles.blockedBandText}>
                Blocked · {formatMinutesRange(band.startMinutes, band.endMinutes)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {isLoading ? (
        <View style={styles.skeletonContainer}>
          <SkeletonLoader type="card" count={4} />
        </View>
      ) : isError ? (
        <View style={styles.errorContainer}>
          <Text variant="bodyLarge" style={styles.errorText}>
            Could not load the calendar. Pull down to try again.
          </Text>
        </View>
      ) : sections.length === 0 ? (
        vetNotWorkingToday ? (
          <EmptyState
            title={`Dr. ${filteredVetName ?? ''} is not working on ${formatLongDate(selectedDate)}`}
            description="Pick another date, or change this in Settings → Edit Availability."
          />
        ) : isVetFiltered ? (
          <EmptyState
            title={`No appointments for Dr. ${filteredVetName ?? ''} on ${formatLongDate(selectedDate)}`}
            description="Clear the vet filter to see the whole clinic."
          />
        ) : (
          <EmptyState
            title="No appointments today"
            description="Tap Book Appointment to schedule one, or open Queue for walk-ins."
          />
        )
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderSection}
          renderSectionHeader={renderSectionHeader}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.listContent}
          onRefresh={handleRefresh}
          refreshing={isRefetching}
          style={styles.list}
        />
      )}

      <FAB
        icon="plus-circle"
        label="Book Appointment"
        onPress={() => setBookSheetVisible(true)}
        style={[styles.fab, isOffline && styles.fabDisabled]}
        disabled={isOffline}
        color="#FFFFFF"
        customSize={56}
        testID="book-appointment-fab"
      />

      <BookAppointmentSheet
        visible={bookSheetVisible}
        onDismiss={() => setBookSheetVisible(false)}
        defaultVetId={vetFilter}
        defaultDate={selectedDate}
      />

      <AppointmentQuickSheet
        visible={quickSheetAppointment != null}
        appointment={quickSheetAppointment}
        onDismiss={() => setQuickSheetAppointment(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFBF5',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    color: '#1C1B1F',
  },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(230, 81, 0, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 8,
  },
  offlineBannerText: {
    color: '#1C1B1F',
  },
  blockedBandsContainer: {
    marginBottom: 4,
  },
  blockedBand: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    backgroundColor: '#F5F0EB',
    marginHorizontal: 16,
    marginVertical: 2,
    borderRadius: 8,
  },
  blockedBandText: {
    color: '#49454F',
  },
  skeletonContainer: {
    paddingHorizontal: 16,
    gap: 8,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  errorText: {
    textAlign: 'center',
    color: '#49454F',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 100,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    backgroundColor: '#2E7D32',
    borderRadius: 16,
  },
  fabDisabled: {
    backgroundColor: '#CAC4D0',
  },
});
