import React from 'react';
import { View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BottomSheet, ListItem } from '@breeyo/ui';
import { BILLING_COPY, NEW_INVOICE_OPTIONS } from '../lib/dashboard-state';

export interface NewInvoiceSheetProps {
  visible: boolean;
  onDismiss: () => void;
  /** Opens the consultation picker for completed visits without an invoice. */
  onFromConsultation: () => void;
  /** Opens the D-04 Quick Sale screen. */
  onQuickSale: () => void;
  testID?: string;
}

const ICON_COLOR = '#49454F';

/**
 * The FAB's two-option sheet (D-24 interaction contract).
 *
 * ## Why the destinations are callbacks rather than router pushes
 *
 * `Quick Sale` navigates to a route plan 06-18 has not created yet. Importing
 * or pushing a path that does not exist would either fail to typecheck or
 * silently no-op at runtime; taking both destinations as props means this
 * component compiles and behaves correctly today, and the screen — which owns
 * the router — supplies whatever the paths turn out to be. The paths this plan
 * used are recorded in `06-14-SUMMARY.md` so 06-18 creates matching files.
 */
export function NewInvoiceSheet({
  visible,
  onDismiss,
  onFromConsultation,
  onQuickSale,
  testID,
}: NewInvoiceSheetProps) {
  const handlers: Record<string, () => void> = {
    fromConsultation: onFromConsultation,
    quickSale: onQuickSale,
  };

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      title={BILLING_COPY.fabLabel}
      testID={testID ?? 'new-invoice-sheet'}
    >
      <View>
        {NEW_INVOICE_OPTIONS.map((option) => (
          <ListItem
            key={option.key}
            title={option.label}
            description={option.description}
            left={
              <MaterialCommunityIcons
                name={option.icon as never}
                size={24}
                color={ICON_COLOR}
              />
            }
            onPress={() => {
              onDismiss();
              handlers[option.key]?.();
            }}
            testID={`new-invoice-option-${option.key}`}
          />
        ))}
      </View>
    </BottomSheet>
  );
}
