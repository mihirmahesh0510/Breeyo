import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

// --- D-24: mobile day agenda wireframe -- four states matching the Phase 02
// wireframe convention (Empty / Loading / Populated / Error). Fulfils
// 08-UI-SPEC.md Open Item 4, which asked for exactly this file filled in.

// --- Fixtures ---

interface AgendaAppointment {
  id: string;
  timeRange: string;
  petLabel: string;
  vetLabel: string;
  variant: 'normal' | 'multiPet' | 'recurring' | 'cancelled';
}

const MORNING_APPOINTMENTS: AgendaAppointment[] = [
  { id: 'appt-1', timeRange: '9:00 – 9:15 AM', petLabel: 'Bruno', vetLabel: 'Dr. Rao', variant: 'normal' },
  {
    id: 'appt-2',
    timeRange: '9:30 – 10:00 AM',
    petLabel: 'Milo + Coco (2 pets)',
    vetLabel: 'Dr. Rao',
    variant: 'multiPet',
  },
  {
    id: 'appt-3',
    timeRange: '10:15 – 10:30 AM',
    petLabel: 'Simba (weekly repeat)',
    vetLabel: 'Dr. Rao',
    variant: 'recurring',
  },
];

const AFTERNOON_APPOINTMENTS: AgendaAppointment[] = [
  {
    id: 'appt-4',
    timeRange: '2:00 – 2:15 PM',
    petLabel: 'Chintu (cancelled)',
    vetLabel: 'Dr. Rao',
    variant: 'cancelled',
  },
  { id: 'appt-5', timeRange: '3:00 – 3:15 PM', petLabel: 'Rocky', vetLabel: 'Dr. Iyer', variant: 'normal' },
];

const BLOCKED_BAND = { timeRange: '1:00 – 2:00 PM', label: 'Blocked · Lunch' };

// --- Stub Component ---

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16, backgroundColor: '#FFFBF5' },
  heading: { fontSize: 22, fontWeight: '600', color: '#1C1B1F', marginBottom: 4 },
  description: { fontSize: 14, color: '#49454F', marginBottom: 16 },
  groupHeading: { fontSize: 14, fontWeight: '600', color: '#49454F', marginTop: 16, marginBottom: 8 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    marginBottom: 8,
  },
  rowCancelled: { opacity: 0.5 },
  rowText: { fontSize: 14, color: '#1C1B1F' },
  rowMeta: { fontSize: 12, color: '#79747E' },
  badge: { fontSize: 11, color: '#2E7D32', fontWeight: '600' },
  blockedBand: {
    backgroundColor: '#F5F0EB',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  skeletonRow: {
    height: 80,
    borderRadius: 12,
    backgroundColor: '#EFEAE3',
    marginBottom: 8,
  },
});

function AppointmentRow({ appointment }: { appointment: AgendaAppointment }) {
  const badgeLabel =
    appointment.variant === 'multiPet'
      ? 'Multi-pet'
      : appointment.variant === 'recurring'
        ? 'Repeats weekly'
        : appointment.variant === 'cancelled'
          ? 'Cancelled'
          : null;

  return React.createElement(
    View,
    { style: [styles.row, appointment.variant === 'cancelled' && styles.rowCancelled] },
    React.createElement(
      View,
      null,
      React.createElement(Text, { style: styles.rowText }, `${appointment.timeRange} · ${appointment.petLabel}`),
      React.createElement(Text, { style: styles.rowMeta }, appointment.vetLabel),
    ),
    badgeLabel ? React.createElement(Text, { style: styles.badge }, badgeLabel) : null,
  );
}

function CalendarScreen({ state, testID }: { state: string; testID?: string }) {
  if (state === 'loading') {
    return React.createElement(
      View,
      { style: styles.screen, testID },
      React.createElement(Text, { style: styles.heading }, 'Today'),
      React.createElement(View, { style: styles.skeletonRow }),
      React.createElement(View, { style: styles.skeletonRow }),
      React.createElement(View, { style: styles.skeletonRow }),
      React.createElement(View, { style: styles.skeletonRow }),
    );
  }

  if (state === 'empty') {
    return React.createElement(
      View,
      { style: styles.screen, testID },
      React.createElement(Text, { style: styles.heading }, 'No appointments today'),
      React.createElement(
        Text,
        { style: styles.description },
        'Tap Book Appointment to schedule one, or open Queue for walk-ins.',
      ),
    );
  }

  if (state === 'error') {
    return React.createElement(
      View,
      { style: styles.screen, testID },
      React.createElement(Text, { style: styles.heading }, 'Could not load the calendar'),
      React.createElement(Text, { style: styles.description }, 'Pull down to try again.'),
    );
  }

  // Populated: a representative day -- morning + afternoon groups, one
  // multi-pet appointment, one recurring appointment, one cancelled
  // appointment at reduced opacity, and one blocked-period band.
  return React.createElement(
    View,
    { style: styles.screen, testID },
    React.createElement(Text, { style: styles.heading }, 'Tue, 18 Aug'),
    React.createElement(Text, { style: styles.groupHeading }, 'Morning'),
    ...MORNING_APPOINTMENTS.map((appointment) =>
      React.createElement(AppointmentRow, { key: appointment.id, appointment }),
    ),
    React.createElement(Text, { style: styles.groupHeading }, 'Afternoon'),
    React.createElement(
      View,
      { style: styles.blockedBand },
      React.createElement(Text, { style: styles.rowText }, `${BLOCKED_BAND.timeRange} · ${BLOCKED_BAND.label}`),
    ),
    ...AFTERNOON_APPOINTMENTS.map((appointment) =>
      React.createElement(AppointmentRow, { key: appointment.id, appointment }),
    ),
  );
}

// --- Stories ---

export default {
  title: 'Wireframes/Scheduling/CalendarScreen',
  component: CalendarScreen,
};

export const Empty = () =>
  React.createElement(CalendarScreen, {
    state: 'empty',
    testID: 'calendar-empty',
  });

export const Loading = () =>
  React.createElement(CalendarScreen, {
    state: 'loading',
    testID: 'calendar-loading',
  });

export const Populated = () =>
  React.createElement(CalendarScreen, {
    state: 'populated',
    testID: 'calendar-populated',
  });

export const Error = () =>
  React.createElement(CalendarScreen, {
    state: 'error',
    testID: 'calendar-error',
  });
