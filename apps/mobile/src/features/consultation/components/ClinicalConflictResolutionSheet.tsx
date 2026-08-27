import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button, Divider } from 'react-native-paper';
import { BottomSheet } from '@breeyo/ui';
import {
  buildFieldComparisonRows,
  isMergeSafeFieldsAvailable,
  isUnresolved,
  escalationOwnerLabel,
  type ClinicalConflictSummary,
} from '../lib/clinical-conflict-resolution';

/** Renders a SOAP-note-shaped field value as a short, human-scannable
 *  preview -- the comparison sheet's job is "which one do you want", not a
 *  raw JSON dump. */
function previewValue(value: unknown): string {
  if (value === null || value === undefined) return '(empty)';
  if (typeof value === 'string') return value.trim().length > 0 ? value : '(empty)';
  if (Array.isArray(value)) return value.length > 0 ? `${value.length} item(s)` : '(empty)';
  if (typeof value === 'object') {
    const entries = Object.values(value as Record<string, unknown>).filter(
      (v) => v !== null && v !== undefined && v !== '',
    );
    return entries.length > 0 ? JSON.stringify(value) : '(empty)';
  }
  return String(value);
}

export interface ClinicalConflictResolutionSheetProps {
  visible: boolean;
  conflict: ClinicalConflictSummary;
  /** Resolves a user id to a display name for the escalation owner line
   *  (D-09/D-24). Injected rather than looked up internally so this
   *  component stays free of any staff-directory data-fetching concern. */
  resolveUserName: (userId: string) => string;
  onDismiss: () => void;
  /** D-08: adopt this device's local edits for every disputed field. */
  onKeepLocal: (conflict: ClinicalConflictSummary) => void;
  /** D-08: discard this device's local edits for every disputed field,
   *  keeping the server's current (other device's) values. */
  onKeepServer: (conflict: ClinicalConflictSummary) => void;
  /** D-07: apply only the fields nobody else touched; disputed fields stay
   *  open. Omitted by the caller when `isMergeSafeFieldsAvailable` is
   *  false. */
  onMergeSafeFields?: (conflict: ClinicalConflictSummary) => void;
  /** D-22: the originating user's own guided retry. */
  onRetry: (conflict: ClinicalConflictSummary) => void;
  /** D-23/D-24/D-36: hand off to the next owner. */
  onEscalate: (conflict: ClinicalConflictSummary) => void;
}

/**
 * The structured clinical conflict resolution sheet (Plan 10-03 Task 2,
 * D-05, D-06, D-08, D-09, D-11, D-24). Deliberately NOT a generic retry
 * toast: it always shows the disputed fields side by side (local vs.
 * server) and always offers the same five explicit actions, never a
 * silent auto-resolve. Stays mounted (`isUnresolved`) for every
 * resolution state except `RESOLVED` -- D-11 requires an unresolved
 * clinical conflict to remain visible until someone actually clears it,
 * not just until the next screen navigation.
 */
export function ClinicalConflictResolutionSheet({
  visible,
  conflict,
  resolveUserName,
  onDismiss,
  onKeepLocal,
  onKeepServer,
  onMergeSafeFields,
  onRetry,
  onEscalate,
}: ClinicalConflictResolutionSheetProps) {
  if (!isUnresolved(conflict.resolutionState)) {
    return null;
  }

  const rows = buildFieldComparisonRows(conflict);
  const canMergeSafeFields = isMergeSafeFieldsAvailable(conflict);
  const ownerName = escalationOwnerLabel(conflict, resolveUserName);

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} title="Review conflicting edits">
      <View style={styles.container}>
        <Text style={styles.intro}>
          This consultation was edited on another device while this one was offline. Compare
          the changes below and choose how to resolve each one.
        </Text>

        {rows.map((row, index) => (
          <View key={row.field} style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>{row.label}</Text>
            <View style={styles.compareRow}>
              <View style={styles.compareColumn}>
                <Text style={styles.compareHeading}>This device</Text>
                <Text style={styles.compareValue}>{previewValue(row.localValue)}</Text>
              </View>
              <View style={styles.compareColumn}>
                <Text style={styles.compareHeading}>Server (other device)</Text>
                <Text style={styles.compareValue}>{previewValue(row.serverValue)}</Text>
              </View>
            </View>
            {index < rows.length - 1 && <Divider style={styles.divider} />}
          </View>
        ))}

        {ownerName && (
          <Text style={styles.ownerLine}>Recommended to resolve: {ownerName}</Text>
        )}

        <View style={styles.actions}>
          <Button mode="contained" onPress={() => onKeepLocal(conflict)} style={styles.actionButton}>
            Keep This Device&apos;s Version
          </Button>
          <Button mode="outlined" onPress={() => onKeepServer(conflict)} style={styles.actionButton}>
            Keep Server Version
          </Button>
          {canMergeSafeFields && onMergeSafeFields && (
            <Button mode="outlined" onPress={() => onMergeSafeFields(conflict)} style={styles.actionButton}>
              Merge Safe Fields Only
            </Button>
          )}
          <Button mode="text" onPress={() => onRetry(conflict)} style={styles.actionButton}>
            Retry Sync
          </Button>
          <Button mode="text" onPress={() => onEscalate(conflict)} style={styles.actionButton}>
            Escalate to Another Vet
          </Button>
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  intro: {
    fontSize: 13,
    color: '#49454F',
    marginBottom: 16,
  },
  fieldBlock: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1B1F',
    marginBottom: 6,
  },
  compareRow: {
    flexDirection: 'row',
    gap: 12,
  },
  compareColumn: {
    flex: 1,
  },
  compareHeading: {
    fontSize: 11,
    color: '#79747E',
    marginBottom: 2,
  },
  compareValue: {
    fontSize: 13,
    color: '#1C1B1F',
  },
  divider: {
    marginTop: 12,
  },
  ownerLine: {
    fontSize: 12,
    color: '#5D4037',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  actions: {
    gap: 8,
  },
  actionButton: {
    width: '100%',
  },
});
