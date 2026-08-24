import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { SyncVisibilityState } from '@breeyo/types';
import { badgeCopy, RECOVERY_CUE_COPY, type SyncStatusCounts } from '../lib/sync-status';

export interface SyncStatusBadgeProps {
  visibilityState: SyncVisibilityState;
  counts: SyncStatusCounts;
  /** D-21: the store's `shouldShowRecoveryCue` verdict, already computed on the last transition. */
  showRecoveryCue: boolean;
  onPress?: () => void;
}

const ICON_BY_STATE: Record<SyncVisibilityState, string> = {
  [SyncVisibilityState.PENDING]: '↻', // cycle arrow -- calm, not alarming
  [SyncVisibilityState.REPLAYING]: '↻',
  [SyncVisibilityState.CONFLICT]: '⚠', // small warning triangle -- actionable, not scary
  [SyncVisibilityState.FAILED]: '⚠',
  [SyncVisibilityState.CAUGHT_UP]: '✓', // checkmark
};

/**
 * Always-visible calm sync summary (Plan 10-05 Task 1, D-18 to D-21).
 * Deliberately a small persistent element, never a blocking banner or
 * native alert popup: pending/replaying work is named plainly, a
 * conflict/failed count routes staff toward the failure center via
 * `onPress` rather than dumping detail into this badge itself, and a
 * caught-up recovery is a short inline cue (`RECOVERY_CUE_COPY`) rather
 * than a celebratory toast or total silence.
 */
export function SyncStatusBadge({ visibilityState, counts, showRecoveryCue, onPress }: SyncStatusBadgeProps) {
  const copy = showRecoveryCue ? RECOVERY_CUE_COPY : badgeCopy(visibilityState, counts);
  const isActionable =
    visibilityState === SyncVisibilityState.CONFLICT || visibilityState === SyncVisibilityState.FAILED;

  return (
    <View
      style={[styles.badge, isActionable ? styles.actionable : styles.calm]}
      accessibilityRole={isActionable ? 'button' : 'text'}
      onTouchEnd={isActionable ? onPress : undefined}
    >
      <Text style={styles.icon}>{ICON_BY_STATE[visibilityState]}</Text>
      <Text style={styles.copy}>{copy}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  calm: {
    backgroundColor: '#F1F1EC',
  },
  actionable: {
    backgroundColor: '#FFF3E0',
  },
  icon: {
    fontSize: 12,
  },
  copy: {
    fontSize: 12,
  },
});
