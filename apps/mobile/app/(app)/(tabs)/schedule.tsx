import React from 'react';
import { DayAgendaScreen } from '../../../src/features/scheduling/screens/DayAgendaScreen';

// `appointmentId`/`date` query params (plan 08-08's `View Appointment` push,
// plan 08-09's push-notification deep link) are consumed inside
// `DayAgendaScreen` itself via `useLocalSearchParams` -- this route stays a
// one-line wrapper, mirroring `patients.tsx`.
export default function ScheduleTab() {
  return <DayAgendaScreen />;
}
