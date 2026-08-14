import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Text, TextInput, Checkbox } from 'react-native-paper';
import {
  CREDIT_NOTE_COPY,
  creditLinePaise,
  type CreditLineDraft,
} from '../lib/credit-note-form';

export interface CreditItemSelectorProps {
  drafts: readonly CreditLineDraft[];
  onToggle: (invoiceLineItemId: string) => void;
  onAmountChange: (invoiceLineItemId: string, value: string) => void;
  testID?: string;
}

const COLORS = {
  onSurface: '#1C1B1F',
  onSurfaceVariant: '#49454F',
  error: '#BA1A1A',
  outline: '#CAC4D0',
  surfaceVariant: '#F5F0EB',
} as const;

/**
 * The checkbox list of original line items with editable credit amounts
 * (D-22, T-06-112).
 *
 * Each row seeds from its original line total and is clamped to it, with the
 * inline error rendered directly above the amount that caused it — a credit
 * above the original reduces revenue with nothing on the other side of the
 * entry, and the server answers `CREDIT_EXCEEDS_LINE_TOTAL` for exactly that.
 * Catching it here means the front desk finds out while the number is still
 * being typed rather than after telling the owner what they are getting back.
 *
 * The clamp itself and the rupee-to-paise conversion live in
 * `lib/credit-note-form.ts`, because `apps/mobile` cannot render a React Native
 * component under test and a bound expressed inside this JSX would be a bound
 * nothing can check.
 */
export function CreditItemSelector({
  drafts,
  onToggle,
  onAmountChange,
  testID,
}: CreditItemSelectorProps) {
  return (
    <View style={styles.container} testID={testID ?? 'credit-item-selector'}>
      <Text variant="titleMedium" style={styles.header}>
        {CREDIT_NOTE_COPY.itemsHeader}
      </Text>
      <Text variant="bodySmall" style={styles.instruction}>
        {CREDIT_NOTE_COPY.selectInstruction}
      </Text>

      {drafts.map((draft) => {
        const result = creditLinePaise(draft);
        const showError = draft.selected && !result.ok;

        return (
          <View key={draft.invoiceLineItemId} style={styles.row}>
            <Pressable
              onPress={() => onToggle(draft.invoiceLineItemId)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: draft.selected }}
              accessibilityLabel={CREDIT_NOTE_COPY.itemLine(
                draft.description,
                draft.lineTotalPaise,
              )}
              testID={`credit-item-toggle-${draft.invoiceLineItemId}`}
              style={styles.checkboxRow}
            >
              <Checkbox status={draft.selected ? 'checked' : 'unchecked'} />
              <Text variant="bodyMedium" style={styles.label}>
                {CREDIT_NOTE_COPY.itemLine(draft.description, draft.lineTotalPaise)}
              </Text>
            </Pressable>

            {draft.selected ? (
              <>
                {showError ? (
                  <Text
                    variant="bodySmall"
                    style={styles.error}
                    testID={`credit-item-error-${draft.invoiceLineItemId}`}
                  >
                    {result.ok ? '' : result.error}
                  </Text>
                ) : null}

                <TextInput
                  mode="outlined"
                  dense
                  value={draft.amountInput}
                  onChangeText={(value) => onAmountChange(draft.invoiceLineItemId, value)}
                  keyboardType="decimal-pad"
                  error={showError}
                  testID={`credit-item-amount-${draft.invoiceLineItemId}`}
                />
              </>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  header: {
    color: COLORS.onSurface,
    fontWeight: '600',
  },
  instruction: {
    color: COLORS.onSurfaceVariant,
  },
  row: {
    gap: 4,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.outline,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 48,
  },
  label: {
    flex: 1,
    color: COLORS.onSurface,
  },
  error: {
    color: COLORS.error,
  },
});
