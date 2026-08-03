import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { RegisterPatientScreen } from '../../../src/features/patient/screens/RegisterPatientScreen';

export default function RegisterPatientRoute() {
  const { initialMobile, ownerId } = useLocalSearchParams<{
    initialMobile?: string;
    ownerId?: string;
  }>();

  return (
    <RegisterPatientScreen
      initialMobile={initialMobile}
      ownerId={ownerId}
    />
  );
}
