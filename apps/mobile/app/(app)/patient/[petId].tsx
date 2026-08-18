import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { PatientDetailScreen } from '../../../src/features/patient/screens/PatientDetailScreen';

export default function PetDetailRoute() {
  const { petId } = useLocalSearchParams<{ petId: string }>();

  if (!petId) return null;

  return <PatientDetailScreen />;
}
