import React, { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Text } from 'react-native-paper';
import { Stack, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button, SearchBar, showToast } from '@breeyo/ui';
import type { InventoryItem } from '@breeyo/types';
import { useAuth } from '../../../providers/AuthProvider';
import { useInventoryItems } from '../../inventory/hooks/useInventoryApi';
import { useQuickSaleCartStore, hasUnresolvedShortfall } from '../stores/quickSaleCartStore';
import { useQuickSaleCheckout, useQuickSalePreview } from '../hooks/useQuickSale';
import { QuickSaleCart } from '../components/QuickSaleCart';
import { QuickSaleTotals } from '../components/QuickSaleTotals';
import { formatPaiseINR } from '../lib/format';
import { parseRupeesToPaise, stockShortfallsFrom } from '../lib/builder-state';
import { BILLING_ROUTES } from './BillingDashboardScreen';

/**
 * 06-UI-SPEC.md's `Quick Sale Screen (D-04)` copy table, verbatim.
 *
 * Held as one object so each string appears exactly once in this file — the
 * phase's copy gates count occurrences, and a literal repeated at two call
 * sites is also how two screens drift apart after a wording change.
 */
const QUICK_SALE_COPY = {
  title: 'Quick Sale',
  scanBarcode: 'Scan Barcode',
  searchPlaceholder: 'Search products',
  cartHeader: 'Cart',
  cartEmpty: 'Scan or search to add items',
  checkout: 'Generate Invoice',
  checkoutDisabled: 'Add items to continue',
  successToast: 'Invoice created',
  outOfStockNote: 'Out of stock',
  searchHint: 'Type at least 2 characters to search products.',
  searchNoResults: 'No products match that search.',
  checkoutErrorToast: 'Could not complete the sale',
} as const;

const COLORS = {
  surface: '#FFFBF5',
  onSurface: '#1C1B1F',
  onSurfaceVariant: '#49454F',
  outlineVariant: '#CAC4D0',
  disabled: '#9E9E9E',
  primary: '#2E7D32',
} as const;

const SEARCH_MIN_CHARS = 2;

/**
 * An inventory item's selling price as display paise.
 *
 * D-31's single money boundary on this screen. Phase 5 stores a rupee
 * `Decimal(10,2)` and Phase 6 carries integer paise, and the crossing goes
 * through `parseRupeesToPaise` on the string form rather than multiplying a
 * float — `12.29 * 100` is `1228.9999999999998`, and a chain of those is the
 * difference between a sale that reconciles and one that does not.
 *
 * `null` for an unparseable price rather than a zero: `₹0.00` beside a product
 * name reads as "free" to whoever is at the counter, whereas a missing price
 * reads as what it is.
 */
function sellingPricePaise(item: InventoryItem): number | null {
  const parsed = parseRupeesToPaise(String(item.sellingPrice));
  return parsed.ok ? parsed.paise : null;
}

/**
 * D-04, the POS path: scan or search, cart, one tap.
 *
 * ## The cart empties on unmount, always
 *
 * T-06-124. The cart store is module-level, so it outlives this screen. Without
 * the cleanup below, a staff member who backs out of a half-built sale and
 * starts the next customer's would find the previous customer's items already
 * in the cart — and, if they did not notice, sell them. D-48 accepts losing an
 * in-progress cart to a crash precisely because re-adding items is cheap;
 * billing the wrong person is not.
 *
 * ## Totals come from the server
 *
 * `QuickSaleTotals` is handed the preview response and performs no arithmetic.
 * See that component and `useQuickSalePreview` for why a device-computed
 * counter-sale total is the one thing this screen must not do (T-06-122).
 *
 * ## Stock is the server's decision
 *
 * D-45 greys out an item the clinic has none of at search time, which catches
 * the ordinary case early. It is not a guarantee: availability is settled under
 * a row lock inside the checkout transaction, so the authoritative answer is
 * the 409, rendered per cart row and blocking checkout until the quantity
 * changes (T-06-123).
 */
export function QuickSaleScreen() {
  const router = useRouter();
  const { activeClinicId } = useAuth();

  const items = useQuickSaleCartStore((state) => state.items);
  const shortfalls = useQuickSaleCartStore((state) => state.shortfalls);
  const addItem = useQuickSaleCartStore((state) => state.addItem);
  const incrementQuantity = useQuickSaleCartStore((state) => state.incrementQuantity);
  const decrementQuantity = useQuickSaleCartStore((state) => state.decrementQuantity);
  const setQuantity = useQuickSaleCartStore((state) => state.setQuantity);
  const removeItem = useQuickSaleCartStore((state) => state.removeItem);
  const setShortfalls = useQuickSaleCartStore((state) => state.setShortfalls);

  const [searchTerm, setSearchTerm] = useState('');

  const preview = useQuickSalePreview(items);
  const checkout = useQuickSaleCheckout();

  const isSearchActive = searchTerm.trim().length >= SEARCH_MIN_CHARS;
  const search = useInventoryItems(activeClinicId, {
    search: isSearchActive ? searchTerm.trim() : '',
  });

  // The unmount reset. Written as a bare cleanup with no dependencies so it
  // runs exactly once, when the screen actually goes away.
  useEffect(() => {
    return () => {
      useQuickSaleCartStore.getState().reset();
    };
  }, []);

  const handleAddProduct = useCallback(
    (item: InventoryItem) => {
      const paise = sellingPricePaise(item);
      // An item whose stored price cannot be read is not added at a guessed
      // figure. The server prices the invoice from its own copy anyway, but a
      // cart row showing a price nobody can verify is what gets read aloud.
      if (paise === null) return;

      addItem({
        inventoryItemId: item.id,
        description: item.name,
        unitPricePaise: paise,
      });
      setSearchTerm('');
    },
    [addItem],
  );

  const handleScan = useCallback(() => {
    // Phase 5's scanner, reused rather than rebuilt. It is a route of its own
    // that writes into `useScannerStore`; opening it here keeps one scanner
    // implementation in the app.
    router.push('/(app)/(tabs)/inventory/scan?mode=single' as never);
  }, [router]);

  const handleCheckout = useCallback(() => {
    checkout.mutate(items, {
      onSuccess: (response) => {
        const invoice = response.data;
        showToast('success', QUICK_SALE_COPY.successToast);
        useQuickSaleCartStore.getState().reset();
        // Straight to payment collection: a counter sale is finalized already,
        // and the customer is still standing there with money in hand.
        router.replace(BILLING_ROUTES.invoiceDetail(invoice.id) as never);
      },
      onError: (error) => {
        const found = stockShortfallsFrom(error);
        if (found.length > 0) {
          setShortfalls(found);
          return;
        }
        showToast('error', QUICK_SALE_COPY.checkoutErrorToast);
      },
    });
  }, [checkout, items, router, setShortfalls]);

  const isCartEmpty = items.length === 0;
  const isBlocked = hasUnresolvedShortfall(shortfalls);
  const isSubmitting = checkout.isPending;
  const canCheckout = !isCartEmpty && !isBlocked && !isSubmitting;

  return (
    <>
      <Stack.Screen options={{ title: QUICK_SALE_COPY.title }} />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        testID="quick-sale-screen"
      >
        <View style={styles.section}>
          <Button
            variant="filled"
            label={QUICK_SALE_COPY.scanBarcode}
            icon="barcode-scan"
            onPress={handleScan}
            disabled={isSubmitting}
            testID="quick-sale-scan"
          />
        </View>

        <View style={styles.section}>
          <SearchBar
            value={searchTerm}
            onChangeText={setSearchTerm}
            placeholder={QUICK_SALE_COPY.searchPlaceholder}
            testID="quick-sale-search"
          />
        </View>

        {isSearchActive && (
          <View style={styles.results} testID="quick-sale-results">
            {search.isLoading && <ActivityIndicator color={COLORS.primary} />}

            {!search.isLoading && (search.data?.items.length ?? 0) === 0 && (
              <Text variant="bodySmall" style={styles.hint}>
                {QUICK_SALE_COPY.searchNoResults}
              </Text>
            )}

            {search.data?.items.map((item) => {
              // D-45: an item the clinic has none of stays visible, greyed and
              // labelled. Hiding it sends staff hunting for something they know
              // is carried; leaving it selectable fails at checkout with a 409
              // after the customer has been quoted a total.
              const outOfStock = item.currentStock <= 0;
              const price = sellingPricePaise(item);

              return (
                <Pressable
                  key={item.id}
                  style={styles.resultRow}
                  disabled={outOfStock || isSubmitting}
                  onPress={() => handleAddProduct(item)}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: outOfStock }}
                  testID={`quick-sale-result-${item.id}`}
                >
                  <View style={styles.resultText}>
                    <Text
                      variant="bodyLarge"
                      numberOfLines={1}
                      style={outOfStock ? styles.resultNameDisabled : styles.resultName}
                    >
                      {item.name}
                    </Text>
                    {outOfStock && (
                      <Text
                        variant="bodySmall"
                        style={styles.resultNote}
                        testID={`quick-sale-out-of-stock-${item.id}`}
                      >
                        {QUICK_SALE_COPY.outOfStockNote}
                      </Text>
                    )}
                  </View>
                  <Text
                    variant="bodyLarge"
                    style={outOfStock ? styles.resultNameDisabled : styles.resultName}
                  >
                    {price === null ? '' : formatPaiseINR(price)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {!isSearchActive && searchTerm.length > 0 && (
          <Text variant="bodySmall" style={styles.hint}>
            {QUICK_SALE_COPY.searchHint}
          </Text>
        )}

        <View style={styles.cartHeaderRow}>
          <MaterialCommunityIcons name="cart-outline" size={20} color={COLORS.onSurfaceVariant} />
          <Text variant="titleMedium" style={styles.cartHeader}>
            {QUICK_SALE_COPY.cartHeader}
          </Text>
        </View>

        {isCartEmpty ? (
          <Text variant="bodyMedium" style={styles.empty} testID="quick-sale-cart-empty">
            {QUICK_SALE_COPY.cartEmpty}
          </Text>
        ) : (
          <QuickSaleCart
            items={items}
            shortfalls={shortfalls}
            onIncrement={incrementQuantity}
            onDecrement={decrementQuantity}
            onSetQuantity={setQuantity}
            onRemove={removeItem}
            disabled={isSubmitting}
          />
        )}

        {!isCartEmpty && (
          <QuickSaleTotals
            breakdown={preview.data?.breakdown}
            subtotalPaise={preview.data?.subtotalPaise}
            gstEnabled={preview.data?.gstEnabled ?? false}
            isLoading={preview.isFetching}
          />
        )}

        <View style={styles.section}>
          <Button
            variant="filled"
            label={canCheckout ? QUICK_SALE_COPY.checkout : QUICK_SALE_COPY.checkoutDisabled}
            onPress={handleCheckout}
            disabled={!canCheckout}
            loading={isSubmitting}
            testID="quick-sale-checkout"
          />
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  content: {
    paddingBottom: 32,
  },
  section: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  results: {
    marginTop: 8,
    marginHorizontal: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.outlineVariant,
    borderRadius: 12,
    overflow: 'hidden',
  },
  resultRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.outlineVariant,
  },
  resultText: {
    flex: 1,
    marginRight: 8,
  },
  resultName: {
    color: COLORS.onSurface,
  },
  resultNameDisabled: {
    color: COLORS.disabled,
  },
  resultNote: {
    color: COLORS.disabled,
  },
  cartHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 24,
    marginBottom: 8,
  },
  cartHeader: {
    color: COLORS.onSurface,
    fontWeight: '700',
  },
  empty: {
    color: COLORS.onSurfaceVariant,
    paddingHorizontal: 16,
    paddingVertical: 24,
    textAlign: 'center',
  },
  hint: {
    color: COLORS.onSurfaceVariant,
    paddingHorizontal: 16,
    marginTop: 8,
  },
});
