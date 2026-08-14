import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { CreditNote } from '@breeyo/types';
import { INVOICE_DETAIL_COPY, linkedCreditNoteLabel } from '../lib/invoice-detail';

export interface LinkedCreditNotesProps {
  creditNotes: readonly CreditNote[];
  /** Opens the credit-note detail screen (plan 06-22). */
  onTap: (creditNoteId: string) => void;
  testID?: string;
}

const COLORS = {
  onSurface: '#1C1B1F',
  onSurfaceVariant: '#49454F',
  outlineVariant: '#CAC4D0',
} as const;

/**
 * The D-22 credit notes raised against this invoice.
 *
 * ## Nothing at all when there are none
 *
 * Not an empty state — nothing. Unlike the payment history, where "no payments"
 * is an answer someone is actively looking for, a credit note is the exception
 * rather than the expected case: an invoice with none is simply an invoice, and
 * a "No credit notes" panel on every screen would be noise that trains people to
 * skip the region on the invoices where it does carry something.
 *
 * ## Money
 *
 * The amount comes pre-formatted from `linkedCreditNoteLabel`, which calls the
 * shared `formatPaiseINR`. This file performs no arithmetic on a money value,
 * and a phase-level grep gate enforces that.
 */
export function LinkedCreditNotes({ creditNotes, onTap, testID }: LinkedCreditNotesProps) {
  if (creditNotes.length === 0) return null;

  return (
    <View style={styles.container} testID={testID ?? 'invoice-linked-credit-notes'}>
      <Text variant="titleSmall" style={styles.header}>
        {INVOICE_DETAIL_COPY.creditNotesHeader}
      </Text>

      {creditNotes.map((creditNote) => (
        <Pressable
          key={creditNote.id}
          onPress={() => onTap(creditNote.id)}
          accessibilityRole="button"
          accessibilityLabel={linkedCreditNoteLabel(creditNote)}
          testID={`credit-note-${creditNote.id}`}
          style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
        >
          <Text variant="bodySmall" style={styles.label} numberOfLines={1}>
            {linkedCreditNoteLabel(creditNote)}
          </Text>
          <MaterialCommunityIcons
            name="chevron-right"
            size={20}
            color={COLORS.onSurfaceVariant}
          />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  header: {
    color: COLORS.onSurface,
    fontWeight: '600',
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // 06-UI-SPEC accessibility floor.
    minHeight: 44,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.outlineVariant,
  },
  pressed: {
    opacity: 0.7,
  },
  label: {
    flex: 1,
    color: COLORS.onSurfaceVariant,
  },
});
