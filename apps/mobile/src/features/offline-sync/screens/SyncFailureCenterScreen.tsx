import React from 'react';
import { ScrollView, View, StyleSheet } from 'react-native';
import { Text, Button, Divider } from 'react-native-paper';
import { groupFailureCenterItems, type FailureCenterItem } from '../lib/sync-status';

export interface SyncFailureCenterScreenProps {
  items: FailureCenterItem[];
  viewerUserId: string;
  /** Resolves a user id to a display name -- injected so this screen stays free of any staff-directory fetching (matches `ClinicalConflictResolutionSheet.tsx`'s `resolveUserName` convention). */
  resolveUserName: (userId: string) => string;
  /** D-22: the current owner's own guided retry. */
  onRetry: (item: FailureCenterItem) => void;
  /** D-23/D-24/D-36: explicit hand-off to the next owner. */
  onEscalate: (item: FailureCenterItem) => void;
}

function ItemRow({
  item,
  resolveUserName,
  onRetry,
  onEscalate,
  showRetry,
  showEscalate,
}: {
  item: FailureCenterItem;
  resolveUserName: (userId: string) => string;
  onRetry: (item: FailureCenterItem) => void;
  onEscalate: (item: FailureCenterItem) => void;
  showRetry: boolean;
  showEscalate: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.domain}>{item.domain}</Text>
      <Text style={styles.owner}>
        Originating: {resolveUserName(item.originatingUserId)} · Current owner: {resolveUserName(item.currentOwnerUserId)}
      </Text>
      {item.nextSuggestedAction ? <Text style={styles.suggestion}>{item.nextSuggestedAction}</Text> : null}
      <View style={styles.actions}>
        {showRetry ? (
          <Button mode="contained-tonal" onPress={() => onRetry(item)} testID={`retry-${item.id}`}>
            Retry
          </Button>
        ) : null}
        {showEscalate ? (
          <Button mode="outlined" onPress={() => onEscalate(item)} testID={`escalate-${item.id}`}>
            Escalate
          </Button>
        ) : null}
      </View>
      <Divider />
    </View>
  );
}

/**
 * Actionable failure center (Plan 10-05 Task 1, D-20, D-22 to D-24, D-11,
 * D-36). Groups every still-unresolved failure/conflict via the shared
 * `groupFailureCenterItems` into the three named sections staff can act
 * on directly -- this screen never renders a flat "N failures" list or a
 * generic retry toast. Sections with nothing in them are omitted rather
 * than shown empty; D-11 is enforced structurally by `groupFailureCenterItems`
 * itself (RESOLVED items never reach any group), not by anything in this
 * component.
 */
export function SyncFailureCenterScreen({
  items,
  viewerUserId,
  resolveUserName,
  onRetry,
  onEscalate,
}: SyncFailureCenterScreenProps) {
  const groups = groupFailureCenterItems(items, viewerUserId);

  return (
    <ScrollView style={styles.container}>
      {groups.needsYourRetry.length > 0 ? (
        <View style={styles.section}>
          <Text variant="titleMedium">Needs your retry</Text>
          {groups.needsYourRetry.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              resolveUserName={resolveUserName}
              onRetry={onRetry}
              onEscalate={onEscalate}
              showRetry
              showEscalate={false}
            />
          ))}
        </View>
      ) : null}

      {groups.escalatedToClinician.length > 0 ? (
        <View style={styles.section}>
          <Text variant="titleMedium">Escalated to clinician</Text>
          {groups.escalatedToClinician.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              resolveUserName={resolveUserName}
              onRetry={onRetry}
              onEscalate={onEscalate}
              showRetry={item.currentOwnerUserId === viewerUserId}
              showEscalate={false}
            />
          ))}
        </View>
      ) : null}

      {groups.operationalReview.length > 0 ? (
        <View style={styles.section}>
          <Text variant="titleMedium">Operational review</Text>
          {groups.operationalReview.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              resolveUserName={resolveUserName}
              onRetry={onRetry}
              onEscalate={onEscalate}
              showRetry={false}
              showEscalate
            />
          ))}
        </View>
      ) : null}

      {items.length === 0 ? <Text style={styles.emptyState}>No sync issues need attention.</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  row: {
    paddingVertical: 8,
    gap: 4,
  },
  domain: {
    fontWeight: '600',
  },
  owner: {
    fontSize: 12,
    color: '#5D4037',
  },
  suggestion: {
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  emptyState: {
    textAlign: 'center',
    marginTop: 32,
  },
});
