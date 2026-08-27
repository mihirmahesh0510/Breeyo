import React from 'react';
import { View, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { SkeletonLoader, colors as COLORS } from '@breeyo/ui';
import type { BillingDashboardSummary } from '@breeyo/types';
import { buildSummaryCards, type SummaryCardKey } from '../lib/dashboard-state';

export interface BillingSummaryHeaderProps {
  summary: BillingDashboardSummary | undefined;
  isLoading: boolean;
  onCardPress: (card: SummaryCardKey) => void;
  testID?: string;
}

/**
 * Accessibility hints, keyed by the exact 06-UI-SPEC.md card label.
 *
 * A summary card is two words and a number; a screen reader user gets no
 * context from that alone, and two of the five are tappable with no visual
 * affordance saying so. The keys are the literal labels rather than the
 * `SummaryCardKey` union so a copy change in `dashboard-state.ts` that misses
 * this file shows up immediately as a missing hint rather than silently
 * degrading.
 */
const CARD_HINTS: Readonly<Record<string, string>> = {
  "Today's Revenue": 'Payments captured today',
  'Unpaid Total': 'Tap to see unpaid and overdue invoices',
  Overdue: 'Tap to see overdue invoices',
  'Recent Payments': 'Payments recorded today',
  'Patients Today': 'Distinct pets seen today',
};

/**
 * The five summary cards at the top of the Billing tab (D-24 + D-33).
 *
 * ## Skeletons, not zeros, while loading
 *
 * T-06-95: rendering `₹0.00` before the query resolves does not read as "still
 * loading" to a person glancing at the tab — it reads as "no revenue today",
 * which is a specific and alarming claim about the clinic's morning. Each card
 * slot holds a skeleton until the data lands.
 *
 * ## Why a horizontal scroll rather than a wrapped grid
 *
 * Phase 5's `SummaryHeader` wraps four cards into a 2x2 grid at `flexBasis:
 * '48%'`. Five cards would wrap to 2+2+1, leaving a half-empty third row
 * directly above the invoice list and pushing the list below the fold on a
 * small screen. A single 64px row that scrolls keeps the list where the front
 * desk expects it.
 */
export function BillingSummaryHeader({
  summary,
  isLoading,
  onCardPress,
  testID,
}: BillingSummaryHeaderProps) {
  if (isLoading) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        testID={testID ? `${testID}-loading` : undefined}
      >
        {[0, 1, 2, 3, 4].map((index) => (
          <View key={index} style={styles.card} testID={`billing-summary-skeleton-${index}`}>
            <SkeletonLoader type="text" count={2} />
          </View>
        ))}
      </ScrollView>
    );
  }

  const cards = buildSummaryCards(summary);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      testID={testID}
    >
      {cards.map((card) => {
        const content = (
          <View style={styles.card}>
            <Text
              variant="titleMedium"
              numberOfLines={1}
              style={[styles.cardValue, card.accent ? { color: COLORS.tertiary } : null]}
            >
              {card.value}
            </Text>
            <Text variant="titleMedium" numberOfLines={1} style={styles.cardLabel}>
              {card.label}
            </Text>
          </View>
        );

        if (!card.actionable) {
          return (
            <View
              key={card.key}
              accessibilityRole="text"
              accessibilityLabel={`${card.label}: ${card.value}`}
              accessibilityHint={CARD_HINTS[card.label]}
              testID={`billing-summary-${card.key}`}
            >
              {content}
            </View>
          );
        }

        return (
          <Pressable
            key={card.key}
            onPress={() => onCardPress(card.key)}
            accessibilityRole="button"
            accessibilityLabel={`${card.label}: ${card.value}`}
            accessibilityHint={CARD_HINTS[card.label]}
            testID={`billing-summary-${card.key}`}
          >
            {content}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 8,
  },
  card: {
    // 06-UI-SPEC.md "Spacing Scale" exception: 64px per summary card.
    height: 64,
    minWidth: 132,
    padding: 8,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceVariant,
    justifyContent: 'center',
  },
  cardValue: {
    fontWeight: '500',
    color: COLORS.onSurface,
  },
  cardLabel: {
    color: COLORS.onSurfaceVariant,
  },
});
