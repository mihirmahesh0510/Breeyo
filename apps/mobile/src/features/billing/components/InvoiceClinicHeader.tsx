import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import type { ClinicInvoiceHeader as ClinicHeader } from '@breeyo/types';
import { clinicHeaderRows } from '../lib/invoice-detail';

export interface InvoiceClinicHeaderProps {
  clinic: ClinicHeader;
  /**
   * `invoice.gstEnabledSnapshot` — the registration status frozen onto this
   * invoice at finalize, NOT the clinic's current setting. See the note below.
   */
  gstEnabledSnapshot: boolean;
  testID?: string;
}

const COLORS = {
  surfaceVariant: '#F5F0EB',
  outlineVariant: '#CAC4D0',
  onSurface: '#1C1B1F',
  onSurfaceVariant: '#49454F',
} as const;

/**
 * The D-14 clinic block at the top of the invoice.
 *
 * ## The GSTIN row is conditional, and the condition comes from the invoice
 *
 * T-06-137: an unregistered clinic that shows a GSTIN is asserting a
 * registration it does not hold, on a document the owner may present to their
 * own accountant. Most solo vets sit below the ₹20L threshold, so the absent
 * case is the common one, not the edge case.
 *
 * The flag is `gstEnabledSnapshot` from the invoice rather than
 * `clinic.gstEnabled` because a clinic that registers in year two must not have
 * year one's invoices retroactively start claiming a GSTIN they were not raised
 * under. `clinicHeaderRows` returns `null` — no row, not an empty one — and its
 * test covers the unregistered, missing and blank-GSTIN cases.
 */
export function InvoiceClinicHeader({
  clinic,
  gstEnabledSnapshot,
  testID,
}: InvoiceClinicHeaderProps) {
  const rows = clinicHeaderRows(clinic, gstEnabledSnapshot);

  return (
    <View style={styles.container} testID={testID ?? 'invoice-clinic-header'}>
      {clinic.logoUrl ? (
        <Image
          source={{ uri: clinic.logoUrl }}
          style={styles.logo}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      ) : null}

      <Text variant="titleMedium" style={styles.name}>
        {rows.name}
      </Text>
      <Text variant="bodySmall" style={styles.meta}>
        {rows.address}
      </Text>
      <Text variant="bodySmall" style={styles.meta}>
        {rows.phone}
      </Text>

      {rows.gstin ? (
        <Text variant="bodySmall" style={styles.meta} testID="invoice-clinic-gstin">
          {rows.gstin}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: COLORS.surfaceVariant,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.outlineVariant,
  },
  logo: {
    width: 96,
    height: 48,
    marginBottom: 8,
  },
  name: {
    color: COLORS.onSurface,
    fontWeight: '600',
    marginBottom: 4,
  },
  meta: {
    color: COLORS.onSurfaceVariant,
  },
});
