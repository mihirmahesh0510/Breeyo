import React, { useCallback, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, SegmentedButtons } from 'react-native-paper';
import * as Haptics from 'expo-haptics';
// `buildStockAdjustmentSubmission` validates with `stockAdjustmentSchema`
// internally (see lib/stock-adjustment-logic.ts).
import { stockAdjustmentSchema } from '@breeyo/validators';
import { ADJUSTMENT_REASONS } from '@breeyo/types';
import { BottomSheet, FormField, BreeyoChip, Button, showToast } from '@breeyo/ui';
import { useAuth } from '../../../providers/AuthProvider';
import { useAdjustStock } from '../hooks/useInventoryApi';
import { useOfflineStockActions } from '../hooks/useOfflineStockActions';
import { isNetworkFailure } from '../services/offlineStockActionStore';
import {
  buildStockAdjustmentSubmission,
  getAdjustmentSuccessToast,
  getAdjustmentQueuedToast,
} from '../lib/stock-adjustment-logic';
import type { AdjustmentType, StockAdjustmentFormErrors } from '../lib/stock-adjustment-logic';

// --- Component ---

export interface StockAdjustmentSheetProps {
  visible: boolean;
  itemId: string;
  itemName: string;
  /** Verify-fix 10.2 (D-04): needed to seed `useOfflineStockActions`'s
   *  working-set cache the first time this item is touched offline --
   *  `StockActionKnownItem` requires it. */
  category: string;
  unit: string;
  currentStock: number;
  onDismiss: () => void;
  testID?: string;
}

/**
 * Stock Adjustment bottom sheet (D-04). Requires a reason from ADJUSTMENT_REASONS,
 * supports Add/Remove with optional notes, calls POST /inventory/items/:itemId/adjust
 * (useAdjustStock), and gives haptic + toast feedback on success per the UI-SPEC.
 *
 * Uses @breeyo/ui's BottomSheet -- the established convention for standard
 * modal-style sheets in this codebase (ItemFormScreen's category/unit pickers,
 * SortSelector), as opposed to @gorhom/bottom-sheet used directly only where a
 * sheet must coexist with a live camera preview (ScanResultBottomSheet, Plan 05-05).
 */
export function StockAdjustmentSheet({
  visible,
  itemId,
  itemName,
  category,
  unit,
  currentStock,
  onDismiss,
  testID,
}: StockAdjustmentSheetProps) {
  const { activeClinicId } = useAuth();
  const adjustStock = useAdjustStock(activeClinicId, itemId);
  // Verify-fix 10.2 (D-04, D-10, D-15 to D-17): falls through here only when
  // `adjustStock.mutateAsync` fails with a genuine network failure (never
  // reached the server) -- same shape `CheckInSheet.tsx`/`useOfflineQueueActions.ts`
  // established for queue check-in.
  const offlineStockActions = useOfflineStockActions();

  const [type, setType] = useState<AdjustmentType>('add');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<StockAdjustmentFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setType('add');
    setQuantity('');
    setReason('');
    setNotes('');
    setErrors({});
    setServerError(null);
  }, []);

  const handleDismiss = useCallback(() => {
    resetForm();
    onDismiss();
  }, [resetForm, onDismiss]);

  const handleSubmit = useCallback(async () => {
    setServerError(null);
    const result = buildStockAdjustmentSubmission(quantity, type, reason, notes);

    if (!result.success) {
      setErrors(result.errors);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setErrors({});
    setIsSubmitting(true);
    try {
      await adjustStock.mutateAsync(result.payload);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast('success', getAdjustmentSuccessToast(type, result.payload.quantity, unit, itemName));
      resetForm();
      onDismiss();
    } catch (err) {
      if (isNetworkFailure(err)) {
        // The server was never reached -- fall through to the offline
        // capture path instead of leaving the user at a dead-end error
        // (10-04-SUMMARY.md Deviation 2 / verify-fix 10.2).
        try {
          await offlineStockActions.adjustOffline(
            itemId,
            { itemId, name: itemName, category, unit, currentStock },
            result.payload,
          );
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          showToast('info', getAdjustmentQueuedToast(type, result.payload.quantity, unit, itemName));
          resetForm();
          onDismiss();
        } catch (offlineErr) {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          setServerError(offlineErr instanceof Error ? offlineErr.message : 'Could not adjust stock');
        }
      } else {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setServerError(err instanceof Error ? err.message : 'Could not adjust stock');
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [
    quantity,
    type,
    reason,
    notes,
    adjustStock,
    offlineStockActions,
    itemId,
    category,
    currentStock,
    unit,
    itemName,
    resetForm,
    onDismiss,
  ]);

  return (
    <BottomSheet visible={visible} onDismiss={handleDismiss} title="Adjust Stock" testID={testID}>
      <View style={styles.content}>
        <Text
          variant="bodyLarge"
          style={styles.currentStock}
          testID={testID ? `${testID}-current-stock` : undefined}
        >
          Current stock: {currentStock} {unit}
        </Text>

        <SegmentedButtons
          value={type}
          onValueChange={(value) => setType(value as AdjustmentType)}
          buttons={[
            { value: 'add', label: 'Add' },
            { value: 'remove', label: 'Remove' },
          ]}
          style={styles.segmented}
        />

        <View style={styles.fieldGroup}>
          <FormField
            label="Quantity"
            value={quantity}
            onChangeText={setQuantity}
            error={errors.quantity}
            helperText={errors.quantity ? undefined : 'Enter quantity'}
            required
            disabled={isSubmitting}
            testID={testID ? `${testID}-quantity` : undefined}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text variant="bodySmall" style={styles.label}>
            Reason *
          </Text>
          <View style={styles.reasonRow}>
            {ADJUSTMENT_REASONS.map((option) => (
              <BreeyoChip
                key={option.value}
                label={option.label}
                selected={reason === option.value}
                onPress={() => setReason(option.value)}
                testID={`${testID ?? 'stock-adjustment-sheet'}-reason-${option.value}`}
              />
            ))}
          </View>
          {errors.reason && (
            <Text
              variant="bodySmall"
              style={styles.fieldError}
              testID={testID ? `${testID}-reason-error` : undefined}
            >
              {errors.reason}
            </Text>
          )}
        </View>

        <View style={styles.fieldGroup}>
          <FormField
            label="Notes (optional)"
            value={notes}
            onChangeText={setNotes}
            helperText="Additional details..."
            disabled={isSubmitting}
            testID={testID ? `${testID}-notes` : undefined}
          />
        </View>

        {serverError && (
          <Text
            variant="bodySmall"
            style={styles.fieldError}
            testID={testID ? `${testID}-server-error` : undefined}
          >
            {serverError}
          </Text>
        )}

        <View style={styles.actionsRow}>
          <Button
            variant="text"
            label="Cancel"
            onPress={handleDismiss}
            disabled={isSubmitting}
            testID={testID ? `${testID}-cancel` : undefined}
          />
          <Button
            variant="filled"
            label="Apply Adjustment"
            onPress={handleSubmit}
            loading={isSubmitting}
            disabled={isSubmitting}
            testID={testID ? `${testID}-submit` : undefined}
          />
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 8,
  },
  currentStock: {
    color: '#49454F',
    marginBottom: 16,
  },
  segmented: {
    marginBottom: 16,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  label: {
    color: '#49454F',
    marginBottom: 4,
  },
  reasonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  fieldError: {
    color: '#BA1A1A',
    marginTop: 4,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
});
