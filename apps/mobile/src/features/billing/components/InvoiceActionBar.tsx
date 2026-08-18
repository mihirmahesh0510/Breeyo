import React, { useMemo } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { InvoiceStatus } from '@breeyo/types';
import {
  INVOICE_ACTIONS,
  invoiceActionSet,
  visibleInvoiceActions,
  type InvoiceActionKey,
  type InvoiceActionTone,
} from '../lib/invoice-actions';

export interface InvoiceActionBarProps {
  status: InvoiceStatus;
  /**
   * Whether any payment row exists. D-12: a refund reverses money actually
   * received, so `Refund` is withheld until there is something to reverse.
   */
  hasPayments: boolean;
  /** `invoice.exceptionFlag` (D-35, D-36). Non-null suppresses money actions. */
  exceptionFlag?: string | null;
  /**
   * Whether the caller holds `MANAGE_PAYMENTS` (E2E-BUG-FIX-PLAN.md §6.3).
   * Defaults to `true` — see `InvoiceActionInput.hasManagePayments`.
   */
  hasManagePayments?: boolean;

  onPay: () => void;
  onPrint: () => void;
  onShare: () => void;
  onDownload: () => void;
  onVoid: () => void;
  onCreditNote: () => void;
  /**
   * Opens the refund surface. It takes no payment id: D-42 refunds a *specific*
   * leg, and choosing which one is the refund sheet's job (plan 06-22), not a
   * decision this bar can make from a single tap.
   */
  onRefund: () => void;
  onEdit: () => void;
  onDelete: () => void;

  testID?: string;
}

const COLORS = {
  primary: '#2E7D32',
  onPrimary: '#FFFFFF',
  error: '#BA1A1A',
  errorContainer: '#FFDAD6',
  onErrorContainer: '#410002',
  onSurface: '#1C1B1F',
  onSurfaceVariant: '#49454F',
  outline: '#79747E',
} as const;

const TONE_STYLES: Readonly<
  Record<InvoiceActionTone, { container: object; label: { color: string } }>
> = {
  'filled-primary': {
    container: { backgroundColor: COLORS.primary, borderWidth: 0 },
    label: { color: COLORS.onPrimary },
  },
  outlined: {
    container: { borderWidth: 1, borderColor: COLORS.outline },
    label: { color: COLORS.onSurface },
  },
  'text-error': {
    container: { borderWidth: 0 },
    label: { color: COLORS.error },
  },
  'text-neutral': {
    container: { borderWidth: 0 },
    label: { color: COLORS.onSurfaceVariant },
  },
  'text-primary': {
    container: { borderWidth: 0 },
    label: { color: COLORS.primary },
  },
};

/**
 * The invoice detail screen's action row (BIL-03, BIL-04).
 *
 * ## Which buttons appear is not decided here
 *
 * It is decided by `visibleInvoiceActions` in `lib/invoice-actions.ts`, which
 * derives every button from `isValidInvoiceTransition` — the same D-20 table
 * the Fastify services enforce. The UI therefore cannot offer an action the
 * server will answer with a 409, and the front desk never learns the state
 * machine by tapping into errors while an owner waits (T-06-110).
 *
 * The logic sits in a module rather than in this file because `apps/mobile`
 * cannot render a React Native component under test, so a per-status ladder
 * written inside this JSX would be a seven-state decision no test could reach.
 * `__tests__/invoice-actions.test.ts` iterates all seven states against an
 * independently written matrix.
 *
 * **Do not branch on the status value in this file.** A hardcoded per-status
 * map would be correct on the day it was written and would silently drift from
 * D-20 the first time the state machine moved. Anything this bar needs to know
 * about a state belongs in `invoiceActionSet`, next to the
 * `isValidInvoiceTransition` calls that answer it — a phase-level grep gate
 * rejects status equality tests and status switches here for that reason, and
 * this note therefore states the rule without spelling either construct out.
 *
 * ## The exception notice
 *
 * D-35/D-36: an invoice carrying an unresolved billing exception has every
 * status-changing action withheld, keeping only the document actions. Showing
 * a shorter row with no explanation would read as a bug, so the reason is
 * stated on screen.
 */
export function InvoiceActionBar({
  status,
  hasPayments,
  exceptionFlag = null,
  hasManagePayments = true,
  onPay,
  onPrint,
  onShare,
  onDownload,
  onVoid,
  onCreditNote,
  onRefund,
  onEdit,
  onDelete,
  testID,
}: InvoiceActionBarProps) {
  const input = useMemo(
    () => ({ status, hasPayments, exceptionFlag, hasManagePayments }),
    [status, hasPayments, exceptionFlag, hasManagePayments],
  );

  const actions = useMemo(() => visibleInvoiceActions(input), [input]);
  const blocked = useMemo(() => invoiceActionSet(input).blockedByException, [input]);

  const handlers: Readonly<Record<InvoiceActionKey, () => void>> = {
    pay: onPay,
    print: onPrint,
    share: onShare,
    download: onDownload,
    void: onVoid,
    creditNote: onCreditNote,
    refund: onRefund,
    edit: onEdit,
    delete: onDelete,
  };

  return (
    <View style={styles.container} testID={testID ?? 'invoice-action-bar'}>
      {blocked ? (
        <View style={styles.notice} testID="invoice-action-bar-exception">
          <MaterialCommunityIcons
            name="alert-circle-outline"
            size={18}
            color={COLORS.onErrorContainer}
          />
          <Text variant="bodySmall" style={styles.noticeText}>
            This invoice needs review before it can be changed.
          </Text>
        </View>
      ) : null}

      <View style={styles.row}>
        {actions.map((key) => {
          const action = INVOICE_ACTIONS[key];
          const tone = TONE_STYLES[action.tone];

          return (
            <Pressable
              key={key}
              onPress={handlers[key]}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              testID={`invoice-action-${key}`}
              style={({ pressed }) => [
                styles.button,
                tone.container,
                pressed ? styles.pressed : null,
              ]}
            >
              <MaterialCommunityIcons
                name={action.icon as never}
                size={18}
                color={tone.label.color}
              />
              <Text variant="labelLarge" style={tone.label} numberOfLines={1}>
                {action.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 8,
    backgroundColor: COLORS.errorContainer,
  },
  noticeText: {
    flex: 1,
    color: COLORS.onErrorContainer,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    // 06-UI-SPEC accessibility floor: every action clears 44pt on the short axis.
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  pressed: {
    opacity: 0.7,
  },
});
