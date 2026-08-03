import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { OwnerDetailScreen } from '../../../src/features/patient/screens/OwnerDetailScreen';

export default function OwnerDetailRoute() {
  const { ownerId } = useLocalSearchParams<{ ownerId: string }>();

  if (!ownerId) return null;

  return <OwnerDetailScreen ownerId={ownerId} />;
}
