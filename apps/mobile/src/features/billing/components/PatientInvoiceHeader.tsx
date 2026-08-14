import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import type { InvoiceOwnerSummary, InvoicePetSummary } from '@breeyo/types';
import { BUILDER_COPY } from '../lib/builder-copy';

export interface PatientInvoiceHeaderProps {
  /** Null on a counter sale — a Quick Sale invoice has no patient (D-04). */
  pet: InvoicePetSummary | null;
  /** Null when a walk-in has no owner record on file (D-44). */
  owner: InvoiceOwnerSummary | null;
  testID?: string;
}

const COLORS = {
  surfaceVariant: '#F5F0EB',
  onSurfaceVariant: '#49454F',
} as const;

/**
 * The read-only patient banner at the top of the builder, mirroring the Phase 4
 * consultation screen's.
 *
 * It renders nothing at all when there is no pet, rather than an empty frame or
 * a placeholder: a counter sale has no patient, and a banner reading
 * `— Owner: —` would look like data that failed to load on the screen where
 * staff are about to take money.
 */
export function PatientInvoiceHeader({ pet, owner, testID }: PatientInvoiceHeaderProps) {
  if (!pet) return null;

  const label = BUILDER_COPY.patientBanner(pet.name, pet.species, owner?.name ?? '—');

  return (
    <View style={styles.banner} testID={testID ?? 'patient-invoice-header'}>
      <Text variant="bodyLarge" numberOfLines={2} style={styles.text} accessibilityRole="header">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: COLORS.surfaceVariant,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  text: {
    color: COLORS.onSurfaceVariant,
  },
});
