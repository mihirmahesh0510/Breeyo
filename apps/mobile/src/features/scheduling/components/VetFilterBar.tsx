import React, { useMemo } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { BreeyoChip, vetColorForId } from '@breeyo/ui';
import type { ClinicVet } from '../hooks/useSchedule';

export interface VetFilterBarProps {
  vets: ClinicVet[];
  selectedVetId: string | null;
  onSelectVet: (vetId: string | null) => void;
}

/**
 * D-23: "All Vets" first and selected by default. Hidden entirely for a
 * solo-vet clinic -- `vetColorForId` already returns `null` whenever there's
 * one vet or fewer, so this component's own hide condition mirrors that
 * exactly rather than duplicating a separate threshold.
 */
export function VetFilterBar({ vets, selectedVetId, onSelectVet }: VetFilterBarProps) {
  const sortedVetIds = useMemo(() => [...vets].map((v) => v.id).sort(), [vets]);

  if (sortedVetIds.length <= 1) {
    return null;
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <BreeyoChip
        label="All Vets"
        selected={selectedVetId === null}
        onPress={() => onSelectVet(null)}
        testID="vet-filter-all"
      />
      {vets.map((vet) => {
        const color = vetColorForId(vet.id, sortedVetIds);
        return (
          <View key={vet.id} style={styles.chipWrapper}>
            {color ? <View style={[styles.dot, { backgroundColor: color }]} /> : null}
            <BreeyoChip
              label={vet.name}
              selected={selectedVetId === vet.id}
              onPress={() => onSelectVet(vet.id)}
              testID={`vet-filter-${vet.id}`}
            />
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 0,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  chipWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
