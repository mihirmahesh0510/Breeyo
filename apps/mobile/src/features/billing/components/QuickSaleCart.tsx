import React from 'react';
import { View, Pressable, StyleSheet, TextInput } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { formatPaiseINR } from '../lib/format';
import { lineGrossPaise } from '../lib/builder-state';
import type { QuickSaleCartItem, QuickSaleShortfalls } from '../stores/quickSaleCartStore';

export interface QuickSaleCartProps {
  items: readonly QuickSaleCartItem[];
  /** `inventoryItemId` to the quantity actually available, from the 409. */
  shortfalls: QuickSaleShortfalls;
  onIncrement: (inventoryItemId: string) => void;
  onDecrement: (inventoryItemId: string) => void;
  onSetQuantity: (inventoryItemId: string, quantity: number) => void;
  onRemove: (inventoryItemId: string) => void;
  /** Blocks every control while the checkout request is in flight. */
  disabled?: boolean;
  testID?: string;
}

const COLORS = {
  surface: '#FFFFFF',
  outlineVariant: '#CAC4D0',
  onSurface: '#1C1B1F',
  onSurfaceVariant: '#49454F',
  error: '#B3261E',
  primary: '#2E7D32',
} as const;

/**
 * The per-row stock error the UI-SPEC specifies, e.g.
 * `Royal Canin Adult 2kg: only 2 available`.
 *
 * A sentence per affected row rather than one banner above the cart, because
 * the fix is per row: the staff member has to change one quantity, and a banner
 * listing three items leaves them matching names against rows while a customer
 * waits.
 */
export function shortfallMessage(description: string, available: number): string {
  return `${description}: only ${available} available`;
}

/**
 * The counter-sale cart.
 *
 * ## The one multiplication
 *
 * The `Rs [unit] x [qty] = Rs [total]` row multiplies two integers through the
 * shared `lineGrossPaise`. That is exact — there is no rounding decision to get
 * wrong — and it is not a total of anything: it excludes every tax head, so it
 * is not comparable to the invoice's line total and is never sent. The figures
 * that ARE totals live in `QuickSaleTotals` and come from the server.
 *
 * ## Stock errors are rendered, not prevented
 *
 * T-06-123: the client cannot stop an oversell. Availability is decided under a
 * row lock inside the checkout transaction, and anything this screen knew a
 * moment earlier is stale. So the cart shows what the server said, per row, and
 * the screen disables checkout until the quantity changes.
 */
export function QuickSaleCart({
  items,
  shortfalls,
  onIncrement,
  onDecrement,
  onSetQuantity,
  onRemove,
  disabled = false,
  testID,
}: QuickSaleCartProps) {
  return (
    <View testID={testID ?? 'quick-sale-cart'}>
      {items.map((item) => {
        const available = shortfalls[item.inventoryItemId];
        const isShort = available !== undefined;

        return (
          <View key={item.inventoryItemId} testID={`cart-row-${item.inventoryItemId}`}>
            <View style={[styles.row, isShort ? styles.rowShort : null]}>
              <View style={styles.nameColumn}>
                <Text variant="bodyLarge" numberOfLines={1} style={styles.name}>
                  {item.description}
                </Text>
                <Text variant="bodySmall" numberOfLines={1} style={styles.price}>
                  {`${formatPaiseINR(item.unitPricePaise)} x ${item.quantity} = ${formatPaiseINR(
                    lineGrossPaise(item),
                  )}`}
                </Text>
              </View>

              <View style={styles.stepper}>
                <Pressable
                  style={styles.stepperButton}
                  onPress={() => onDecrement(item.inventoryItemId)}
                  disabled={disabled}
                  accessibilityRole="button"
                  accessibilityLabel={`Decrease ${item.description}`}
                  testID={`cart-decrement-${item.inventoryItemId}`}
                >
                  <Text variant="titleMedium" style={styles.stepperLabel}>
                    -
                  </Text>
                </Pressable>

                <TextInput
                  style={styles.quantityInput}
                  value={String(item.quantity)}
                  onChangeText={(raw) => {
                    // Digits only. A pasted `2.5` or `-1` is discarded rather
                    // than coerced, matching the store's own rejection and the
                    // server's positive-integer schema.
                    const digits = raw.replace(/[^0-9]/g, '');
                    if (digits === '') return;
                    onSetQuantity(item.inventoryItemId, Number(digits));
                  }}
                  keyboardType="number-pad"
                  editable={!disabled}
                  accessibilityLabel={`Quantity for ${item.description}`}
                  testID={`cart-quantity-${item.inventoryItemId}`}
                />

                <Pressable
                  style={styles.stepperButton}
                  onPress={() => onIncrement(item.inventoryItemId)}
                  disabled={disabled}
                  accessibilityRole="button"
                  accessibilityLabel={`Increase ${item.description}`}
                  testID={`cart-increment-${item.inventoryItemId}`}
                >
                  <Text variant="titleMedium" style={styles.stepperLabel}>
                    +
                  </Text>
                </Pressable>
              </View>

              <Pressable
                style={styles.removeButton}
                onPress={() => onRemove(item.inventoryItemId)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${item.description}`}
                testID={`cart-remove-${item.inventoryItemId}`}
              >
                <MaterialCommunityIcons
                  name="trash-can-outline"
                  size={20}
                  color={COLORS.error}
                />
              </Pressable>
            </View>

            {isShort && (
              <Text
                variant="bodySmall"
                style={styles.shortfall}
                testID={`cart-shortfall-${item.inventoryItemId}`}
              >
                {shortfallMessage(item.description, available)}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    // 06-UI-SPEC.md "Spacing Scale": 56px per Quick Sale cart item — balanced
    // density for counter interactions, with the stepper and remove controls
    // still clearing the 44x44pt tap minimum.
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: COLORS.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.outlineVariant,
  },
  rowShort: {
    borderBottomWidth: 0,
  },
  nameColumn: {
    flex: 1,
    marginRight: 8,
  },
  name: {
    color: COLORS.onSurface,
    fontWeight: '600',
  },
  price: {
    color: COLORS.onSurfaceVariant,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stepperButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperLabel: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  quantityInput: {
    minWidth: 40,
    height: 44,
    textAlign: 'center',
    color: COLORS.onSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.outlineVariant,
    borderRadius: 8,
    paddingHorizontal: 4,
  },
  removeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortfall: {
    color: COLORS.error,
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: COLORS.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.outlineVariant,
  },
});
