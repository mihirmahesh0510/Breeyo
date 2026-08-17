'use client';

// D-25 -- the first real screen in `apps/web`. The auth guard hook below
// runs FIRST, before any data hook, so no calendar chrome -- not even the
// loading skeleton -- ever renders to an unauthenticated visitor (T-08-72).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRequireAuth } from '../../src/lib/useRequireAuth';
import { useWeekSchedule, useResolvedAvailabilityWeek, useClinicVets } from '../../src/lib/useSchedule';
import { useScheduleSocket } from '../../src/lib/useScheduleSocket';
import { buildWeekRange, computeRowBounds } from '../../src/lib/week-grid';
import { WeekGridHeader } from './WeekGridHeader';
import { WeekGrid } from './WeekGrid';
import { VetLegend } from './VetLegend';
import { AppointmentDrawer } from './AppointmentDrawer';
import { BookAppointmentDrawer } from './BookAppointmentDrawer';
import { NotificationOptInStrip } from './NotificationOptInStrip';
import type { AppointmentWithDetails } from '@breeyo/types';
import styles from './schedule.module.css';

function addDaysIST(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export default function SchedulePage() {
  // Runs before any data hook below -- verified by line order (T-08-72's
  // stated mitigation).
  const { ready } = useRequireAuth();

  const [anchor, setAnchor] = useState(() => new Date());
  const [selectedVetId, setSelectedVetId] = useState<string | null>(null);
  const [openAppointment, setOpenAppointment] = useState<AppointmentWithDetails | null>(null);
  const [bookingPrefill, setBookingPrefill] = useState<{ dayIndex: number; startMinutes: number } | null>(null);
  const [showBookingDrawer, setShowBookingDrawer] = useState(false);
  const [cancelledElsewhereId, setCancelledElsewhereId] = useState<string | null>(null);

  const { from, to, days } = useMemo(() => buildWeekRange(anchor), [anchor]);

  const vetsResult = useClinicVets();
  const scheduleResult = useWeekSchedule(anchor, selectedVetId, from, to);
  const availabilityResult = useResolvedAvailabilityWeek(days, selectedVetId);

  // A refetch triggered by a socket event must never move the scroll
  // position, close an open drawer, or clear an in-progress form -- calling
  // the same `refetch` the retry button uses is sufficient here because
  // neither hook clears its own `data` while refetching (only `isLoading`
  // toggles), so the grid keeps rendering its last-known blocks throughout.
  const handleRealtimeEvent = useCallback(() => {
    scheduleResult.refetch();
    availabilityResult.refetch();
  }, [scheduleResult, availabilityResult]);

  // T-08-72 aside: the "cancelled elsewhere" inline notice (UI-SPEC § Real-
  // time sync) does NOT auto-close the drawer -- it only disables the
  // action buttons, so a staff member mid-read never loses context.
  const handleAppointmentCancelledElsewhere = useCallback((appointmentId: string) => {
    setCancelledElsewhereId(appointmentId);
  }, []);

  const connectionState = useScheduleSocket(handleRealtimeEvent, handleAppointmentCancelledElsewhere);

  // A realtime refetch (another staff member's reschedule/check-in) must
  // keep an open drawer's snapshot in sync -- otherwise a subsequent "Check
  // In Now"/"Move Appointment" action from the drawer acts on stale
  // time/status and only surfaces the conflict as an opaque server error.
  useEffect(() => {
    setOpenAppointment((current) => {
      if (!current) return current;
      const fresh = (scheduleResult.data ?? []).find((a) => a.id === current.id);
      return fresh ?? current;
    });
  }, [scheduleResult.data]);

  if (!ready) {
    return null;
  }

  const vets = vetsResult.data ?? [];
  const appointments = scheduleResult.data ?? [];
  const availabilityByDay = (availabilityResult.data ?? []).map((entries) =>
    selectedVetId ? entries.filter((e) => e.vetId === selectedVetId) : entries,
  );

  // `computeRowBounds` documents its input as "the union of every non-null
  // day's open hours across the displayed vets" -- picking only the first
  // matching vet's hours here (as opposed to the union across every vet
  // shown that day) clamps a second vet's appointments outside the first
  // vet's hours into the wrong row when "All Vets" is selected.
  const hoursByDay = availabilityByDay.map((entries) => {
    const working = entries.filter((e) => e.hours);
    if (working.length === 0) {
      return null;
    }
    return {
      openMinutes: Math.min(...working.map((e) => e.hours!.openMinutes)),
      closeMinutes: Math.max(...working.map((e) => e.hours!.closeMinutes)),
    };
  });
  const bounds = computeRowBounds(hoursByDay);

  const isLoading = scheduleResult.isLoading || vetsResult.isLoading;
  const hasError = !!scheduleResult.error;
  const isEmpty = !isLoading && !hasError && appointments.length === 0;

  function openBookingForCell(dayIndex: number, startMinutes: number) {
    setBookingPrefill({ dayIndex, startMinutes });
    setShowBookingDrawer(true);
  }

  function openNewAppointment() {
    setBookingPrefill({ dayIndex: 0, startMinutes: bounds.startMinutes });
    setShowBookingDrawer(true);
  }

  return (
    <main className={styles.page}>
      <div className={styles.headerRow}>
        <h1 className={styles.title}>Schedule</h1>
        <button type="button" className={styles.newAppointmentButton} onClick={openNewAppointment}>
          New Appointment
        </button>
      </div>

      <NotificationOptInStrip connectionState={connectionState} appointments={appointments} />

      <VetLegend vets={vets} selectedVetId={selectedVetId} onSelect={setSelectedVetId} />

      <WeekGridHeader
        days={days}
        connectionState={connectionState}
        onPrevWeek={() => setAnchor((prev) => addDaysIST(prev, -7))}
        onNextWeek={() => setAnchor((prev) => addDaysIST(prev, 7))}
        onThisWeek={() => setAnchor(new Date())}
      />

      {hasError ? (
        <div className={styles.centeredState}>
          <p className={styles.centeredStateBody}>Could not load the calendar.</p>
          <button type="button" className={styles.tryAgainButton} onClick={() => scheduleResult.refetch()}>
            Try Again
          </button>
        </div>
      ) : (
        <>
          <WeekGrid
            days={days}
            bounds={bounds}
            appointments={appointments}
            vets={vets}
            availabilityByDay={availabilityByDay}
            onOpenAppointment={setOpenAppointment}
            onOpenCell={openBookingForCell}
            showSkeleton={isLoading}
          />
          {isEmpty ? (
            <div className={styles.centeredState}>
              <h2 className={styles.centeredStateHeading}>No appointments this week</h2>
              <p className={styles.centeredStateBody}>Click any open slot to book, or use New Appointment.</p>
            </div>
          ) : null}
        </>
      )}

      <AppointmentDrawer
        appointment={openAppointment}
        onClose={() => {
          setOpenAppointment(null);
          setCancelledElsewhereId(null);
        }}
        onMove={() => {
          // D-31: reschedule re-opens the booking drawer prefilled to this
          // appointment's own current day/time, letting the shared date-and-
          // slot steps do the re-pick. The original appointment closes first
          // so the two drawers never stack.
          if (!openAppointment) return;
          const scheduledFor = new Date(openAppointment.scheduledFor);
          const dayIndex = days.findIndex((d) => d.toDateString() === scheduledFor.toDateString());
          setOpenAppointment(null);
          setBookingPrefill({ dayIndex: Math.max(0, dayIndex), startMinutes: bounds.startMinutes });
          setShowBookingDrawer(true);
        }}
        cancelledElsewhere={openAppointment != null && openAppointment.id === cancelledElsewhereId}
      />

      <BookAppointmentDrawer
        visible={showBookingDrawer}
        onDismiss={() => setShowBookingDrawer(false)}
        defaultVetId={selectedVetId}
        defaultDayIndex={bookingPrefill?.dayIndex ?? 0}
        defaultStartMinutes={bookingPrefill?.startMinutes ?? bounds.startMinutes}
        days={days}
        vets={vets}
      />
    </main>
  );
}
