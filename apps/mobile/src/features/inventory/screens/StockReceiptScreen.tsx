import React, { useCallback, useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Button, showToast } from '@breeyo/ui';
import { useAuth } from '../../../providers/AuthProvider';
import { useInventoryItem, useReceiveStock } from '../hooks/useInventoryApi';
import { useOfflineStockActions } from '../hooks/useOfflineStockActions';
import { isNetworkFailure } from '../services/offlineStockActionStore';
import { StockReceiptForm } from '../components/StockReceiptForm';
// `buildStockReceiptSubmission` validates with `stockReceiptSchema` internally
// (see lib/stock-receipt-logic.ts for the full validation pipeline: the D-27
// category-conditional expiry requirement, then stockReceiptSchema itself).
import {
  buildStockReceiptSubmission,
  EMPTY_STOCK_RECEIPT_FORM,
  getStockReceiptQueuedToast,
} from '../lib/stock-receipt-logic';
import type { StockReceiptFormData, StockReceiptFormErrors } from '../lib/stock-receipt-logic';
import { stockReceiptSchema } from '@breeyo/validators';

// --- Component ---

/**
 * Stock Receipt screen (D-01, D-03, D-09, D-11, D-27). Composes StockReceiptForm,
 * validates + submits via POST /inventory/items/:itemId/receive (useReceiveStock),
 * and gives haptic + toast feedback on success per the UI-SPEC.
 *
 * itemName/unit/category are read from the fetched item (useInventoryItem) so the
 * screen works correctly however it's navigated to; the same-named route params are
 * used as an immediate fallback while that fetch is in flight.
 */
export function StockReceiptScreen() {
  const params = useLocalSearchParams<{
    itemId: string;
    itemName?: string;
    unit?: string;
    category?: string;
  }>();
  const itemId = params.itemId;
  const router = useRouter();
  const { activeClinicId } = useAuth();

  const itemQuery = useInventoryItem(activeClinicId, itemId);
  const receiveStock = useReceiveStock(activeClinicId, itemId);
  // Verify-fix 10.2 (D-04, D-10, D-15 to D-17): falls through here only when
  // `receiveStock.mutateAsync` fails with a genuine network failure (never
  // reached the server) -- same shape `CheckInSheet.tsx`/`useOfflineQueueActions.ts`
  // established for queue check-in.
  const offlineStockActions = useOfflineStockActions();

  const [data, setData] = useState<StockReceiptFormData>(EMPTY_STOCK_RECEIPT_FORM);
  const [errors, setErrors] = useState<StockReceiptFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const item = itemQuery.data;
  const itemName = item?.name ?? params.itemName ?? '';
  const unit = item?.unit ?? params.unit ?? '';
  const category = item?.category ?? params.category ?? '';

  const handleSubmit = useCallback(async () => {
    setServerError(null);
    const result = buildStockReceiptSubmission(data, category);

    if (!result.success) {
      setErrors(result.errors);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setErrors({});
    setIsSubmitting(true);
    try {
      await receiveStock.mutateAsync(result.payload);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast('success', `${result.payload.quantity} ${unit} of ${itemName} received`);
      router.back();
    } catch (err) {
      if (isNetworkFailure(err)) {
        // The server was never reached -- fall through to the offline
        // capture path instead of leaving the user at a dead-end error
        // (10-04-SUMMARY.md Deviation 2 / verify-fix 10.2).
        try {
          await offlineStockActions.receiveOffline(
            itemId,
            { itemId, name: itemName, category, unit, currentStock: item?.currentStock ?? 0 },
            result.payload,
          );
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          showToast('info', getStockReceiptQueuedToast(result.payload.quantity, unit, itemName));
          router.back();
        } catch (offlineErr) {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          setServerError(offlineErr instanceof Error ? offlineErr.message : 'Could not receive stock');
        }
      } else {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setServerError(err instanceof Error ? err.message : 'Could not receive stock');
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [data, category, receiveStock, offlineStockActions, itemId, item, unit, itemName, router]);

  if (itemQuery.isLoading && !params.itemName) {
    return (
      <View style={styles.centered} testID="stock-receipt-loading">
        <ActivityIndicator size="large" color="#2E7D32" />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Receive Stock' }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        testID="stock-receipt-screen"
      >
        <Text variant="headlineMedium" style={styles.title}>
          Receive Stock
        </Text>

        <StockReceiptForm
          itemName={itemName}
          unit={unit}
          category={category}
          data={data}
          onChange={setData}
          errors={errors}
          disabled={isSubmitting}
          testID="stock-receipt-form"
        />

        {serverError && (
          <Text variant="bodySmall" style={styles.serverError} testID="stock-receipt-server-error">
            {serverError}
          </Text>
        )}

        <View style={styles.actionsRow}>
          <Button
            variant="text"
            label="Cancel"
            onPress={() => router.back()}
            disabled={isSubmitting}
            testID="stock-receipt-cancel"
          />
          <Button
            variant="filled"
            label="Receive Stock"
            onPress={handleSubmit}
            loading={isSubmitting}
            disabled={isSubmitting}
            testID="stock-receipt-submit"
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
    marginBottom: 16,
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
