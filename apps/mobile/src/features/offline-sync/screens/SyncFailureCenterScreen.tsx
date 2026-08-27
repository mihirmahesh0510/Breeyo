import React, { useCallback, useState } from 'react';
import { ScrollView, View, Pressable, StyleSheet } from 'react-native';
import { Text, Button, Divider } from 'react-native-paper';
import { ConflictSeverity } from '@breeyo/types';
import type { SaveDraftInput } from '@breeyo/types';
import { groupFailureCenterItems, isClinicalConflictItem, resolveItemPressAction, type FailureCenterItem } from '../lib/sync-status';
import { ClinicalConflictResolutionSheet } from '../../consultation/components/ClinicalConflictResolutionSheet';
import {
  buildClinicalConflictSummaryFromEnvelope,
  type ClinicalConflictResolutionActionType,
  type ClinicalConflictSummary,
} from '../../consultation/lib/clinical-conflict-resolution';

export interface SyncFailureCenterScreenProps {
  items: FailureCenterItem[];
  viewerUserId: string;
  /** Resolves a user id to a display name -- injected so this screen stays free of any staff-directory fetching (matches `ClinicalConflictResolutionSheet.tsx`'s `resolveUserName` convention). */
  resolveUserName: (userId: string) => string;
  /** D-22: the current owner's own guided retry. */
  onRetry: (item: FailureCenterItem) => void;
  /** D-23/D-24/D-36: explicit hand-off to the next owner. */
  onEscalate: (item: FailureCenterItem) => void;
  /**
   * verify-fix 10.4 (D-08): fires for the structured sheet's
   * KEEP_LOCAL/KEEP_SERVER/MERGE_SAFE_FIELDS actions on a clinical
   * conflict. Optional and decoupled from any specific endpoint shape --
   * finding 10.5 (not part of this fix) is what wires this to a real
   * `POST .../conflicts/:conflictId/resolve` call; this screen's job is
   * only to open the sheet and surface the chosen action.
   */
  onResolveClinicalConflict?: (conflict: ClinicalConflictSummary, action: ClinicalConflictResolutionActionType) => void;
}

function ItemRow({
  item,
  resolveUserName,
  onRetry,
  onEscalate,
  showRetry,
  showEscalate,
  onOpenClinicalConflict,
}: {
  item: FailureCenterItem;
  resolveUserName: (userId: string) => string;
  onRetry: (item: FailureCenterItem) => void;
  onEscalate: (item: FailureCenterItem) => void;
  showRetry: boolean;
  showEscalate: boolean;
  onOpenClinicalConflict: (item: FailureCenterItem) => void;
}) {
  const rowContent = (
    <>
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
    </>
  );

  // verify-fix 10.4 (D-08): an EMR SAFETY_CRITICAL conflict gets a tap
  // target that opens the structured resolution sheet -- every other
  // domain (queue/inventory operational review) keeps this exact row,
  // unwrapped, with only its existing Retry/Escalate buttons.
  if (isClinicalConflictItem(item)) {
    return (
      <Pressable
        style={styles.row}
        onPress={() => onOpenClinicalConflict(item)}
        testID={`sync-failure-clinical-trigger-${item.id}`}
      >
        {rowContent}
      </Pressable>
    );
  }

  return <View style={styles.row}>{rowContent}</View>;
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
  onResolveClinicalConflict,
}: SyncFailureCenterScreenProps) {
  const groups = groupFailureCenterItems(items, viewerUserId);
  const [selectedConflictItem, setSelectedConflictItem] = useState<FailureCenterItem | null>(null);

  // verify-fix 10.4 (D-08): the shared, RN-free routing decision -- only an
  // EMR SAFETY_CRITICAL item ever opens the structured sheet; every other
  // domain's tap resolves to NONE and the row's existing Retry/Escalate
  // buttons remain the only affordance (D-10's lighter operational review).
  const handleItemPress = useCallback((item: FailureCenterItem) => {
    const action = resolveItemPressAction(item);
    if (action.kind === 'OPEN_CLINICAL_CONFLICT_SHEET') {
      setSelectedConflictItem(action.item);
    }
  }, []);

  const selectedConflictSummary: ClinicalConflictSummary | null = selectedConflictItem
    ? buildClinicalConflictSummaryFromEnvelope({
        conflictId: selectedConflictItem.id,
        entityId: selectedConflictItem.entityId ?? selectedConflictItem.id,
        severity: selectedConflictItem.severity ?? ConflictSeverity.SAFETY_CRITICAL,
        localPayload: selectedConflictItem.localPayload as SaveDraftInput,
        serverPayload: selectedConflictItem.serverPayload as SaveDraftInput,
        recommendedOwnerUserId: selectedConflictItem.currentOwnerUserId,
        resolutionState: selectedConflictItem.resolutionState,
      })
    : null;

  const handleResolveAction = useCallback(
    (action: ClinicalConflictResolutionActionType) => {
      if (selectedConflictSummary) {
        onResolveClinicalConflict?.(selectedConflictSummary, action);
      }
      setSelectedConflictItem(null);
    },
    [selectedConflictSummary, onResolveClinicalConflict],
  );

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
              onOpenClinicalConflict={handleItemPress}
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
              onOpenClinicalConflict={handleItemPress}
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
              onOpenClinicalConflict={handleItemPress}
            />
          ))}
        </View>
      ) : null}

      {items.length === 0 ? <Text style={styles.emptyState}>No sync issues need attention.</Text> : null}

      {selectedConflictSummary ? (
        <ClinicalConflictResolutionSheet
          visible
          conflict={selectedConflictSummary}
          resolveUserName={resolveUserName}
          onDismiss={() => setSelectedConflictItem(null)}
          onKeepLocal={() => handleResolveAction('KEEP_LOCAL')}
          onKeepServer={() => handleResolveAction('KEEP_SERVER')}
          onMergeSafeFields={() => handleResolveAction('MERGE_SAFE_FIELDS')}
          onRetry={() => {
            if (selectedConflictItem) onRetry(selectedConflictItem);
            setSelectedConflictItem(null);
          }}
          onEscalate={() => {
            if (selectedConflictItem) onEscalate(selectedConflictItem);
            setSelectedConflictItem(null);
          }}
        />
      ) : null}
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
