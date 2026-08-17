import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { AvailabilitySettingsScreen } from '../../src/features/scheduling/screens/AvailabilitySettingsScreen';

// Registered at exactly `/availability` -- the path `DayAgendaScreen`'s
// header `calendar-clock` button already navigates to
// (`router.push('/availability' as any)`, per 08-12-SUMMARY.md).
export default function AvailabilityRoute() {
  const { vetId } = useLocalSearchParams<{ vetId?: string }>();

  return <AvailabilitySettingsScreen vetId={vetId} />;
}
