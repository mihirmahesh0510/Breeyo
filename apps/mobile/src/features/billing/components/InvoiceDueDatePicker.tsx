import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { formatInvoiceDate } from '../lib/format';
import { BUILDER_COPY } from '../lib/builder-copy';
import { dueDateFromOffset, offsetFromDueDate } from '../lib/builder-state';

export interface InvoiceDueDatePickerProps {
  /** ISO 8601, or null to accept the clinic's configured default (D-23). */
  dueDate: string | null;
  onChange: (dueDate: string | null) => void;
  /** `clinic.defaultDueDays` from billing settings (D-29). */
  defaultDays: number;
  disabled?: boolean;
  testID?: string;
}

const COLORS = {
  surfaceVariant: '#F5F0EB',
  onSurface: '#1C1B1F',
  onSurfaceVariant: '#49454F',
} as const;

/**
 * The invoice due date (D-23), defaulting to the clinic's configured offset.
 *
 * ## A day stepper, not a calendar
 *
 * `apps/mobile` declares no date-picker dependency, and adding one is a package
 * install this plan is not permitted to make unilaterally. A stepper is also
 * the better fit for the actual task: a due date in an Indian vet clinic is
 * "today", "in a week" or "end of the month", not an arbitrary date, and D-23
 * makes the clinic default the expected answer. The caption states that
 * default explicitly, so accepting it is a decision rather than an accident.
 *
 * ## `null` is meaningful
 *
 * Passing no due date leaves the server to apply `defaultDueDays` itself
 * (`InvoiceService.computeDueDate`), which keeps a settings change effective for
 * invoices raised after it. Only once the user moves the stepper does an
 * explicit date go on the wire.
 */
export function InvoiceDueDatePicker({
  dueDate,
  onChange,
  defaultDays,
  disabled = false,
  testID,
}: InvoiceDueDatePickerProps) {
  const explicitOffset = offsetFromDueDate(dueDate);
  const isDefault = explicitOffset === null;
  const offset = explicitOffset ?? defaultDays;
  const resolvedDate = dueDate ?? dueDateFromOffset(defaultDays);

  const step = (delta: number) => {
    const next = offset + delta;
    if (next < 0) return;
    onChange(dueDateFromOffset(next));
  };

  return (
    <View style={styles.container} testID={testID ?? 'invoice-due-date-picker'}>
      <View style={styles.header}>
        <Text variant="bodyLarge" style={styles.label}>
          {BUILDER_COPY.dueDateLabel}
        </Text>
        <Text variant="bodyLarge" style={styles.value} testID="due-date-value">
          {formatInvoiceDate(resolvedDate)}
        </Text>
      </View>

      <View style={styles.controls}>
        <Pressable
          style={styles.stepButton}
          onPress={() => step(-1)}
          disabled={disabled || offset <= 0}
          accessibilityRole="button"
          accessibilityLabel="Due one day earlier"
          testID="due-date-decrease"
        >
          <MaterialCommunityIcons name="minus" size={18} color={COLORS.onSurfaceVariant} />
        </Pressable>

        <Text variant="bodySmall" style={styles.caption} testID="due-date-caption">
          {isDefault
            ? BUILDER_COPY.dueDateDefaultNote(defaultDays)
            : `${offset} days from today`}
        </Text>

        <Pressable
          style={styles.stepButton}
          onPress={() => step(1)}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Due one day later"
          testID="due-date-increase"
        >
          <MaterialCommunityIcons name="plus" size={18} color={COLORS.onSurfaceVariant} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    color: COLORS.onSurfaceVariant,
  },
  value: {
    color: COLORS.onSurface,
    fontWeight: '600',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 12,
  },
  stepButton: {
    // 44x44pt minimum touch target (Phase 2 standard).
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: {
    flex: 1,
    textAlign: 'center',
    color: COLORS.onSurfaceVariant,
  },
});
