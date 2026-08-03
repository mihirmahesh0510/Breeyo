import React from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { EmptyState, SkeletonLoader } from '@breeyo/ui';
import type { PetWithOwner, Species } from '@breeyo/types';
import { useRecentPatients } from '../hooks/usePatientProfile';
import { PatientListItem } from './PatientListItem';

interface RecentPatientsListProps {
  onSelectPet: (petId: string) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  testID?: string;
}

function RecentPatientsLoading() {
  return <SkeletonLoader type="listRow" count={6} testID="recent-skeleton" />;
}

export function RecentPatientsList({
  onSelectPet,
  onRefresh,
  refreshing = false,
  testID,
}: RecentPatientsListProps) {
  const { data: patients, isLoading, isError, refetch } = useRecentPatients(20);

  if (isLoading) {
    return <RecentPatientsLoading />;
  }

  if (isError) {
    return (
      <EmptyState
        title="Could not load patients"
        description="Something went wrong. Pull down to try again."
        testID="recent-error"
      />
    );
  }

  if (!patients || patients.length === 0) {
    return (
      <EmptyState
        title="No patients yet"
        description="Registered patients will appear here after their first visit."
        testID="recent-empty"
      />
    );
  }

  const handleRefresh = () => {
    if (onRefresh) {
      onRefresh();
    } else {
      refetch();
    }
  };

  return (
    <FlatList<PetWithOwner>
      data={patients}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <PatientListItem
          petId={item.id}
          petName={item.name}
          species={item.species as Species}
          ownerName={item.owner.name}
          lastVisitDate={item.updatedAt}
          onPress={onSelectPet}
          testID={`recent-patient-${item.id}`}
        />
      )}
      refreshing={refreshing}
      onRefresh={handleRefresh}
      contentContainerStyle={styles.listContent}
      testID={testID}
    />
  );
}

const styles = StyleSheet.create({
  listContent: {
    flexGrow: 1,
  },
});
