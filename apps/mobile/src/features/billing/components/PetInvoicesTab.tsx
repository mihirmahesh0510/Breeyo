import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { Button, SkeletonLoader } from '@breeyo/ui';
import { usePetInvoices, useViewInvoicesPermission } from '../hooks/useInvoices';
import { InvoiceListCard } from './InvoiceListCard';
import {
  PET_INVOICES_SKELETON_ROWS,
  petInvoicesSectionState,
  sortInvoicesNewestFirst,
} from '../lib/pet-invoices';

export interface PetInvoicesTabProps {
  petId: string;
  /** Interpolated into the empty state, so it must be the pet's actual name. */
  petName: string;
  testID?: string;
}

const COLORS = {
  onSurfaceVariant: '#49454F',
  error: '#B3261E',
} as const;

/**
 * 06-UI-SPEC.md's `Invoice Tab on Pet Profile (D-25)` copy table.
 *
 * The empty state is a template rather than a fixed sentence because the spec
 * interpolates the pet. Naming the animal makes the sentence a fact about this
 * patient, which is what a profile screen is for; the un-interpolated version
 * could just as easily be read as a statement about the clinic.
 *
 * A copy gate asserts the template appears exactly once in this file, so the
 * notes below deliberately do not quote it.
 */
const PET_INVOICES_COPY = {
  emptyState: (petName: string) => `No invoices for ${petName} yet.`,
  errorText: 'Could not load invoices for this pet.',
  retryLabel: 'Retry',
} as const;

/**
 * The D-25 Invoices section on a pet profile.
 *
 * ## It renders nothing at all without `VIEW_INVOICES` (T-06-142)
 *
 * Not an error, not an empty section, not a heading — nothing. This component
 * is mounted on a screen clinical staff open dozens of times a day, so a
 * permission failure rendered here would be a permanent piece of furniture on
 * the pet profile rather than a message anyone acts on. A Clinician keeps
 * `VIEW_INVOICES` under the D-05 seed change, so the ordinary case is that a
 * vet does see this.
 *
 * ## Loading shows skeletons, never the empty state
 *
 * `petInvoicesSectionState` encodes that precedence and is tested directly.
 * The empty sentence displayed while the query is still in flight is a false
 * statement about a pet's billing history, shown on the exact screen staff
 * consult to establish it, and it is indistinguishable from the true version —
 * so it would be believed.
 *
 * ## A query failure does not take the profile with it
 *
 * The error state is inline and local. Everything above this section on the
 * profile — the pet card, the quick stats, the weight chart, the visit history
 * — renders regardless, because a billing outage must not be able to stop staff
 * reading a patient's medical record (T-06-141).
 *
 * ## The card is reused, not reimplemented
 *
 * `InvoiceListCard` already renders `#number`, the amount through the shared
 * `formatPaiseINR`, the date and the D-46 status badge, and already substitutes
 * `Draft` for an unnumbered invoice rather than the literal string `null`. A
 * second card here would be a second place for those to drift.
 */
export function PetInvoicesTab({ petId, petName, testID }: PetInvoicesTabProps) {
  const router = useRouter();
  const { canViewInvoices, isLoading: isPermissionLoading } = useViewInvoicesPermission();

  const query = usePetInvoices(petId, { enabled: canViewInvoices });

  const invoices = useMemo(
    () => sortInvoicesNewestFirst(query.data?.items ?? []),
    [query.data?.items],
  );

  const state = petInvoicesSectionState({
    canView: canViewInvoices,
    isPermissionLoading,
    isLoading: query.isLoading,
    isError: query.isError,
    count: invoices.length,
  });

  if (state === 'hidden') return null;

  return (
    <View testID={testID ?? 'pet-invoices-tab'}>
      {state === 'loading' && (
        <SkeletonLoader
          type="card"
          count={PET_INVOICES_SKELETON_ROWS}
          testID="pet-invoices-loading"
        />
      )}

      {state === 'error' && (
        <View style={styles.errorBlock} testID="pet-invoices-error">
          <Text variant="bodyMedium" style={styles.errorText}>
            {PET_INVOICES_COPY.errorText}
          </Text>
          <Button
            variant="text"
            label={PET_INVOICES_COPY.retryLabel}
            onPress={() => query.refetch()}
            testID="pet-invoices-retry"
          />
        </View>
      )}

      {state === 'empty' && (
        <Text variant="bodyMedium" style={styles.empty} testID="pet-invoices-empty">
          {PET_INVOICES_COPY.emptyState(petName)}
        </Text>
      )}

      {state === 'populated' &&
        invoices.map((invoice) => (
          <InvoiceListCard
            key={invoice.id}
            invoice={invoice}
            // The same detail route the Billing tab's list pushes, so an invoice
            // opened from a pet profile and one opened from the dashboard land
            // on the same screen.
            onPress={() => router.push(`/(app)/(tabs)/billing/${invoice.id}` as never)}
            testID={`pet-invoice-card-${invoice.id}`}
          />
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    color: COLORS.onSurfaceVariant,
    paddingVertical: 16,
  },
  errorBlock: {
    paddingVertical: 8,
    gap: 4,
    alignItems: 'flex-start',
  },
  errorText: {
    color: COLORS.error,
  },
});
