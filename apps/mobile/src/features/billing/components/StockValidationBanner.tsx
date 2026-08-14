import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { StockShortfall } from '@breeyo/types';
import { BUILDER_COPY } from '../lib/builder-copy';

export interface StockValidationBannerProps {
  /** Straight from `stockShortfallsFrom(error)` — never parsed from a message. */
  shortfalls: readonly StockShortfall[];
  testID?: string;
}

const COLORS = {
  errorContainer: '#FFDAD6',
  onErrorContainer: '#410002',
  error: '#BA1A1A',
} as const;

/**
 * BIL-02's per-item shortfall banner.
 *
 * ## The sentence is built from numbers, not from the server's prose
 *
 * Each row reads `[Item Name] has insufficient stock ([available] available,
 * [requested] requested)` — 06-UI-SPEC's "Stock validation error" copy — and is
 * assembled by `BUILDER_COPY.stockShortfall` from the 409's structured
 * `available` and `requested` fields. Rendering `error.message` instead would
 * put the client's copy contract in the server's hands and would lose the
 * per-item breakdown entirely, since one 409 covers every short line at once.
 *
 * ## Why this is only half of BIL-02
 *
 * The authoritative check holds row locks inside the finalize transaction. This
 * banner is what the front desk sees when that check fails, which it can
 * legitimately do minutes after the draft was assembled — someone else
 * dispensed the last of the item in the meantime. The blocking behaviour (a
 * disabled Finalize button, the affected rows highlighted) belongs to the screen
 * in plan 06-21; this component only reports.
 */
export function StockValidationBanner({ shortfalls, testID }: StockValidationBannerProps) {
  if (shortfalls.length === 0) return null;

  return (
    <View
      style={styles.banner}
      accessibilityRole="alert"
      testID={testID ?? 'stock-validation-banner'}
    >
      <MaterialCommunityIcons name="alert-circle-outline" size={20} color={COLORS.error} />
      <View style={styles.messages}>
        {shortfalls.map((shortfall, index) => (
          <Text
            key={`${shortfall.inventoryItemId}-${index}`}
            variant="bodySmall"
            style={styles.message}
            testID={`stock-shortfall-${shortfall.inventoryItemId}`}
          >
            {BUILDER_COPY.stockShortfall(shortfall)}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: COLORS.errorContainer,
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  messages: {
    flex: 1,
    gap: 4,
  },
  message: {
    color: COLORS.onErrorContainer,
  },
});
