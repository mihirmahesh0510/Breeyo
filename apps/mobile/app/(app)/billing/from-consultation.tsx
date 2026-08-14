import React, { useCallback, useMemo } from 'react';
import { View, FlatList, StyleSheet, Pressable } from 'react-native';
import { Text, Button as PaperButton } from 'react-native-paper';
import { Stack, useRouter } from 'expo-router';
import { EmptyState, SkeletonLoader } from '@breeyo/ui';
import type { InvoiceListItem } from '@breeyo/types';
import { useInvoices } from '../../../src/features/billing/hooks/useInvoices';
import { formatInvoiceDate } from '../../../src/features/billing/lib/format';
import {
  PICKER_COPY,
  pickerState,
  toPickerRow,
} from '../../../src/features/billing/lib/consultation-picker';

const COLORS = {
  surface: '#FFFBF5',
  onSurface: '#1C1B1F',
  onSurfaceVariant: '#49454F',
  error: '#BA1A1A',
  outline: '#CAC4D0',
} as const;

/**
 * D-06 Path B — the picker of completed visits still waiting to be billed.
 *
 * Unlike `new.tsx` this is a real screen rather than a delegate, so it carries
 * the three states the plan requires. The decisions behind them live in
 * `lib/consultation-picker.ts`, which is where the reasoning for sourcing this
 * list from DRAFT invoices — rather than from a consultation endpoint that does
 * not exist, over a set that D-03 keeps empty by design — is written down.
 *
 * Rows push into the builder with the draft's `invoiceId`, not a
 * `consultationId`: the draft already exists and already holds the dispensed
 * items, so the builder hydrates from it directly instead of asking the server
 * to create a second one.
 */
export default function FromConsultationRoute() {
  const router = useRouter();

  // Server-side filtered and paginated. Deliberately not a full list narrowed on
  // the device — that would stop scaling on the first busy day.
  const draftsQuery = useInvoices({ status: 'draft', sort: 'newest' });

  const items = draftsQuery.data?.items;
  const state = pickerState({
    isLoading: draftsQuery.isLoading,
    isError: draftsQuery.isError,
    items,
  });

  const rows = useMemo(
    () => (items ?? []).map((invoice) => toPickerRow(invoice, formatInvoiceDate)),
    [items],
  );

  const handlePress = useCallback(
    (invoiceId: string) => {
      router.push({ pathname: '/(app)/billing/new', params: { invoiceId } } as never);
    },
    [router],
  );

  return (
    <View style={styles.screen} testID="consultation-picker-screen">
      <Stack.Screen options={{ title: PICKER_COPY.screenTitle }} />

      {state === 'loading' ? (
        <View style={styles.list} testID="consultation-picker-skeleton">
          <SkeletonLoader type="listRow" count={6} />
        </View>
      ) : null}

      {state === 'error' ? (
        <View style={styles.error} testID="consultation-picker-error">
          <Text style={styles.errorText}>{PICKER_COPY.errorTitle}</Text>
          <PaperButton mode="outlined" onPress={() => void draftsQuery.refetch()}>
            {PICKER_COPY.errorRetry}
          </PaperButton>
        </View>
      ) : null}

      {state === 'empty' ? (
        <EmptyState
          title={PICKER_COPY.emptyTitle}
          description={PICKER_COPY.emptyBody}
          testID="consultation-picker-empty"
        />
      ) : null}

      {state === 'populated' ? (
        <FlatList
          data={rows}
          keyExtractor={(row) => row.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => handlePress(item.id)}
              style={styles.row}
              accessibilityRole="button"
              testID={`consultation-picker-row-${item.id}`}
            >
              <Text variant="bodyLarge" style={styles.rowTitle}>
                {item.title}
              </Text>
              <Text variant="bodySmall" style={styles.rowSubtitle}>
                {item.subtitle}
              </Text>
            </Pressable>
          )}
          refreshing={draftsQuery.isFetching}
          onRefresh={() => void draftsQuery.refetch()}
        />
      ) : null}
    </View>
  );
}

/** Kept for the type-level assertion that rows are built from list items. */
export type PickerSource = InvoiceListItem;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  list: {
    padding: 16,
    gap: 8,
  },
  row: {
    minHeight: 64,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.outline,
  },
  rowTitle: {
    color: COLORS.onSurface,
  },
  rowSubtitle: {
    color: COLORS.onSurfaceVariant,
  },
  error: {
    padding: 32,
    gap: 12,
    alignItems: 'center',
  },
  errorText: {
    color: COLORS.error,
  },
});
