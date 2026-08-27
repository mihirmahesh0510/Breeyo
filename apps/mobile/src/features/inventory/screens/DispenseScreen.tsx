import React, { useCallback, useMemo, useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Button, showToast } from '@breeyo/ui';
// `buildDispenseSubmission` validates with `dispenseSchema` internally (see
// lib/fifo-dispense-logic.ts for the full pipeline: D-25 expired-batch
// blocking, then insufficient-stock check, then dispenseSchema itself).
import { dispenseSchema } from '@breeyo/validators';
import { useAuth } from '../../../providers/AuthProvider';
import { useInventoryItem } from '../hooks/useInventoryApi';
import { useFifoDispense } from '../hooks/useFifoDispense';
import { useOfflineStockActions } from '../hooks/useOfflineStockActions';
import { isNetworkFailure } from '../services/offlineStockActionStore';
import { QuantityStepper } from '../components/QuantityStepper';
import { FifoBatchDisplay } from '../components/FifoBatchDisplay';
import { BatchOverrideList } from '../components/BatchOverrideList';
import { ExpiredBatchBlocker } from '../components/ExpiredBatchBlocker';
import { OwnerAttributionPicker } from '../components/OwnerAttributionPicker';
import {
  selectFifoBatch,
  isBatchExpired,
  getInsufficientStockError,
  buildDispenseSubmission,
  getDispenseQueuedToast,
} from '../lib/fifo-dispense-logic';
import type { StockBatch } from '@breeyo/types';

// --- Component ---

/**
 * Dispense screen (D-22 FIFO auto-select + override, D-25 expired-batch
 * blocking, D-49/D-52 consultation-linked vs. counter-sale, D-60 optional
 * owner attribution). Composes QuantityStepper, FifoBatchDisplay (+
 * BatchOverrideList when toggled), ExpiredBatchBlocker, and
 * OwnerAttributionPicker (only when there's no consultationId, i.e. a
 * counter sale per D-52), then submits via useFifoDispense.
 *
 * itemName/unit/currentStock/batches are read from the fetched item
 * (useInventoryItem) so the screen works correctly however it's navigated
 * to, with the same-named route params used as an immediate fallback while
 * that fetch is in flight -- same pattern StockReceiptScreen established in
 * Task 1, since InventoryItemDetailScreen's current "Dispense" button
 * (out of scope for this task) only passes `itemId`.
 */
export function DispenseScreen() {
  const params = useLocalSearchParams<{
    itemId: string;
    itemName?: string;
    unit?: string;
    totalStock?: string;
    consultationId?: string;
    petName?: string;
    batchesData?: string;
  }>();
  const itemId = params.itemId;
  const consultationId = params.consultationId || null;
  const router = useRouter();
  const { activeClinicId } = useAuth();

  const itemQuery = useInventoryItem(activeClinicId, itemId);
  const dispenseStock = useFifoDispense(activeClinicId, itemId);
  // Verify-fix 10.2 (D-04, D-10, D-15 to D-17): falls through here only when
  // `dispenseStock.mutateAsync` fails with a genuine network failure (never
  // reached the server) -- same shape `CheckInSheet.tsx`/`useOfflineQueueActions.ts`
  // established for queue check-in.
  const offlineStockActions = useOfflineStockActions();

  const [quantity, setQuantity] = useState(1);
  const [isOverriding, setIsOverriding] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null);
  const [selectedOwnerName, setSelectedOwnerName] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [quantityError, setQuantityError] = useState<string | null>(null);

  const item = itemQuery.data;
  const itemName = item?.name ?? params.itemName ?? '';
  const unit = item?.unit ?? params.unit ?? '';
  const available = item?.currentStock ?? (params.totalStock ? Number(params.totalStock) : 0);

  const batches: StockBatch[] = useMemo(() => {
    if (item?.batches) return item.batches;
    if (params.batchesData) {
      try {
        return JSON.parse(params.batchesData) as StockBatch[];
      } catch {
        return [];
      }
    }
    return [];
  }, [item?.batches, params.batchesData]);

  const fifoBatch = useMemo(() => selectFifoBatch(batches), [batches]);
  const overrideBatch = isOverriding && selectedBatchId ? batches.find((b) => b.id === selectedBatchId) ?? null : null;
  const activeBatch = overrideBatch ?? fifoBatch;
  const isOverridden = Boolean(overrideBatch && overrideBatch.id !== fifoBatch?.id);
  const activeBatchExpired = activeBatch ? isBatchExpired(activeBatch) : false;

  const handleQuantityChange = useCallback(
    (value: number) => {
      setQuantity(value);
      setQuantityError(getInsufficientStockError(value, available, unit));
    },
    [available, unit],
  );

  const handleOverrideToggle = useCallback(() => {
    setIsOverriding((prev) => !prev);
  }, []);

  const handleSelectBatch = useCallback((batchId: string) => {
    setSelectedBatchId(batchId);
  }, []);

  const handleOwnerSelect = useCallback((ownerId: string, ownerName: string) => {
    setSelectedOwnerId(ownerId);
    setSelectedOwnerName(ownerName);
  }, []);

  const handleOwnerClear = useCallback(() => {
    setSelectedOwnerId(null);
    setSelectedOwnerName(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    setServerError(null);
    const result = buildDispenseSubmission({
      quantity,
      available,
      unit,
      selectedBatch: activeBatch,
      fifoBatchId: fifoBatch?.id ?? null,
      consultationId,
      invoiceId: null,
      ownerId: selectedOwnerId,
    });

    if (!result.success) {
      setQuantityError(result.errors.quantity ?? null);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setQuantityError(null);
    setIsSubmitting(true);
    try {
      await dispenseStock.mutateAsync(result.payload);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast('success', `${quantity} ${unit} of ${itemName} dispensed`);
      router.back();
    } catch (err) {
      if (isNetworkFailure(err)) {
        // The server was never reached -- fall through to the offline
        // capture path instead of leaving the user at a dead-end error
        // (10-04-SUMMARY.md Deviation 2 / verify-fix 10.2).
        try {
          await offlineStockActions.dispenseOffline(
            itemId,
            { itemId, name: itemName, category: item?.category ?? '', unit, currentStock: available },
            result.payload,
          );
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          showToast('info', getDispenseQueuedToast(quantity, unit, itemName));
          router.back();
        } catch (offlineErr) {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          setServerError(offlineErr instanceof Error ? offlineErr.message : 'Could not dispense stock');
        }
      } else {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setServerError(err instanceof Error ? err.message : 'Could not dispense stock');
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [
    quantity,
    available,
    unit,
    activeBatch,
    fifoBatch,
    consultationId,
    selectedOwnerId,
    dispenseStock,
    offlineStockActions,
    itemId,
    item,
    itemName,
    router,
  ]);

  if (itemQuery.isLoading && !params.itemName) {
    return (
      <View style={styles.centered} testID="dispense-screen-loading">
        <ActivityIndicator size="large" color="#2E7D32" />
      </View>
    );
  }

  const canDispense = !isSubmitting && !!activeBatch && !activeBatchExpired && !quantityError;

  return (
    <>
      <Stack.Screen options={{ title: `Dispense ${itemName}` }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content} testID="dispense-screen">
        <Text variant="headlineMedium" style={styles.title}>
          Dispense {itemName}
        </Text>

        <Text variant="bodyLarge" style={styles.available} testID="dispense-available-stock">
          Available: {available} {unit}
        </Text>

        {!consultationId ? (
          <View style={styles.badgeRow}>
            <View style={styles.counterSaleBadge} testID="dispense-counter-sale-badge">
              <Text variant="labelSmall" style={styles.counterSaleBadgeText}>
                Counter Sale
              </Text>
            </View>
          </View>
        ) : (
          <Text variant="bodySmall" style={styles.consultationCaption} testID="dispense-consultation-caption">
            Linked to consultation: {params.petName ?? 'this patient'}
          </Text>
        )}

        <View style={styles.section}>
          <Text variant="bodySmall" style={styles.label}>
            Quantity to Dispense
          </Text>
          <QuantityStepper
            value={quantity}
            onChange={handleQuantityChange}
            min={1}
            max={Math.max(available, 1)}
            unit={unit}
            disabled={isSubmitting}
            testID="dispense-quantity-stepper"
          />
          {quantityError && (
            <Text variant="bodySmall" style={styles.fieldError} testID="dispense-quantity-error">
              {quantityError}
            </Text>
          )}
        </View>

        {activeBatch ? (
          <View style={styles.section}>
            <FifoBatchDisplay
              batch={activeBatch}
              unit={unit}
              isOverridden={isOverridden}
              onOverride={handleOverrideToggle}
              testID="dispense-fifo-batch"
            />
          </View>
        ) : (
          <Text variant="bodyMedium" style={styles.fieldError} testID="dispense-no-batch">
            No available (non-expired) batch to dispense from.
          </Text>
        )}

        {isOverriding && (
          <View style={styles.section}>
            <BatchOverrideList
              batches={batches}
              unit={unit}
              selectedBatchId={activeBatch?.id ?? null}
              onSelect={handleSelectBatch}
              testID="dispense-batch-override-list"
            />
          </View>
        )}

        {activeBatchExpired && activeBatch && (
          <ExpiredBatchBlocker expiryDate={activeBatch.expiryDate} testID="dispense-expired-blocker" />
        )}

        {!consultationId && (
          <View style={styles.section}>
            <OwnerAttributionPicker
              selectedOwnerId={selectedOwnerId}
              selectedOwnerName={selectedOwnerName}
              onSelect={handleOwnerSelect}
              onClear={handleOwnerClear}
              testID="dispense-owner-picker"
            />
            <Text variant="bodySmall" style={styles.ownerStatusCaption} testID="dispense-owner-status">
              {selectedOwnerName ? `For: ${selectedOwnerName}` : 'No owner attached'}
            </Text>
          </View>
        )}

        {serverError && (
          <Text variant="bodySmall" style={styles.serverError} testID="dispense-server-error">
            {serverError}
          </Text>
        )}

        <View style={styles.actionsRow}>
          <Button variant="text" label="Cancel" onPress={() => router.back()} disabled={isSubmitting} testID="dispense-cancel" />
          <Button
            variant="filled"
            label="Dispense"
            onPress={handleSubmit}
            loading={isSubmitting}
            disabled={!canDispense}
            testID="dispense-submit"
          />
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFBF5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFBF5',
  },
  content: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  title: {
    fontWeight: '700',
    color: '#1C1B1F',
    marginBottom: 8,
  },
  available: {
    color: '#49454F',
    marginBottom: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  counterSaleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#D7CCC8',
  },
  counterSaleBadgeText: {
    color: '#3E2723',
    fontWeight: '700',
  },
  consultationCaption: {
    color: '#49454F',
    marginBottom: 12,
  },
  section: {
    marginBottom: 20,
  },
  label: {
    color: '#49454F',
    marginBottom: 8,
  },
  fieldError: {
    color: '#BA1A1A',
    marginTop: 8,
  },
  ownerStatusCaption: {
    color: '#49454F',
    marginTop: 6,
  },
  serverError: {
    color: '#BA1A1A',
    marginTop: 8,
    marginBottom: 8,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
    marginBottom: 32,
  },
});
