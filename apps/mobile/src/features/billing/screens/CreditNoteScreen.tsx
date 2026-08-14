import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Text, TextInput, ActivityIndicator } from 'react-native-paper';
import { useRouter, Stack } from 'expo-router';
import { EmptyState, showToast } from '@breeyo/ui';
import { useInvoice } from '../hooks/useInvoice';
import { usePaymentMutations } from '../hooks/usePaymentMutations';
import { CreditItemSelector } from '../components/CreditItemSelector';
import { INVOICE_SCREEN_COPY, screenTitleFor } from '../lib/invoice-screen';
import {
  CREDIT_NOTE_COPY,
  CREDIT_NOTE_REASON_OPTIONS,
  buildCreditNoteInput,
  creditLineFrom,
  creditTotalPaise,
  type CreditLineDraft,
  type CreditNoteReason,
} from '../lib/credit-note-form';

export interface CreditNoteScreenProps {
  invoiceId: string;
}

const COLORS = {
  surface: '#FFFBF5',
  surfaceVariant: '#F5F0EB',
  onSurface: '#1C1B1F',
  onSurfaceVariant: '#49454F',
  outline: '#CAC4D0',
  primary: '#2E7D32',
  primaryContainer: '#C8E6C9',
  onPrimaryContainer: '#1B5E20',
  onPrimary: '#FFFFFF',
  error: '#BA1A1A',
} as const;

/**
 * D-19 / D-22's credit note against an existing invoice.
 *
 * ## A credit note is a separate document, not an edit
 *
 * A finalized invoice is immutable — it has a gap-free number, a frozen tax
 * snapshot and a six-year retention obligation. Reducing what an owner owes
 * therefore creates a second numbered record that references the first, which
 * is why this is a screen of its own rather than a field on the invoice.
 *
 * ## Bounds and vocabulary come from the shared schema
 *
 * The five reasons are `CREDIT_NOTE_REASONS` mapped through the shipped label
 * table, so the picker cannot offer a value `creditNoteSchema` rejects. Each
 * line's amount is clamped to the original line total, which is the same rule
 * the server enforces as `CREDIT_EXCEEDS_LINE_TOTAL` (T-06-112). Both live in
 * `lib/credit-note-form.ts`; this file is layout, because `apps/mobile` cannot
 * render a React Native component under test.
 *
 * ## The credit note's own totals are not predicted here
 *
 * `Credit Amount` previews what the user selected. The credit note's taxable
 * value, its tax heads and its total are computed inside plan 06-10's
 * transaction from these line amounts and rendered from the response — a second
 * implementation of a statutory rounding rule on the device would disagree with
 * the server on the first fractional head (T-06-103).
 */
export function CreditNoteScreen({ invoiceId }: CreditNoteScreenProps) {
  const router = useRouter();
  const { data: invoice, isLoading, isError } = useInvoice(invoiceId);
  const { issueCreditNote } = usePaymentMutations(invoiceId);

  const [reason, setReason] = useState<CreditNoteReason>('incorrect_charge');
  const [notes, setNotes] = useState('');
  const [drafts, setDrafts] = useState<CreditLineDraft[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Seeded once the invoice arrives, and re-seeded if the line set changes —
  // a credit note raised against lines that are no longer on the invoice would
  // be rejected line by line with nothing on screen explaining why.
  useEffect(() => {
    if (!invoice) return;
    setDrafts(
      invoice.lineItems.map((item) =>
        creditLineFrom({
          id: item.id,
          description: item.description,
          lineTotalPaise: item.lineTotalPaise,
        }),
      ),
    );
  }, [invoice]);

  const handleToggle = useCallback((invoiceLineItemId: string) => {
    setError(null);
    setDrafts((current) =>
      current.map((draft) =>
        draft.invoiceLineItemId === invoiceLineItemId
          ? { ...draft, selected: !draft.selected }
          : draft,
      ),
    );
  }, []);

  const handleAmountChange = useCallback((invoiceLineItemId: string, value: string) => {
    setError(null);
    setDrafts((current) =>
      current.map((draft) =>
        draft.invoiceLineItemId === invoiceLineItemId ? { ...draft, amountInput: value } : draft,
      ),
    );
  }, []);

  const totalPaise = useMemo(() => creditTotalPaise(drafts), [drafts]);

  const handleIssue = useCallback(() => {
    setError(null);

    let body;
    try {
      body = buildCreditNoteInput({ reason, notes: notes || undefined, drafts });
    } catch (validationError) {
      setError(
        validationError instanceof Error ? validationError.message : 'Invalid credit note',
      );
      return;
    }

    issueCreditNote.mutate(body, {
      onSuccess: () => {
        showToast('success', CREDIT_NOTE_COPY.successToast);
        // Back to the invoice, where LinkedCreditNotes now lists it and the
        // balance the detail query refetches has come down.
        router.back();
      },
      onError: (mutationError: unknown) => {
        setError(
          mutationError instanceof Error
            ? mutationError.message
            : 'The credit note could not be issued',
        );
      },
    });
  }, [drafts, issueCreditNote, notes, reason, router]);

  if (isLoading) {
    return (
      <View style={styles.centered} testID="credit-note-loading">
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (isError || !invoice) {
    return (
      <View style={styles.centered} testID="credit-note-error">
        <EmptyState
          title={INVOICE_SCREEN_COPY.errorTitle}
          actionLabel={INVOICE_SCREEN_COPY.goBack}
          onAction={() => router.back()}
        />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: CREDIT_NOTE_COPY.screenTitle }} />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        testID="credit-note-scroll"
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="link"
          testID="credit-note-invoice-link"
          style={styles.section}
        >
          <Text variant="bodySmall" style={styles.link}>
            {CREDIT_NOTE_COPY.referencedInvoice(
              invoice.invoiceNumber ?? screenTitleFor(invoice.invoiceNumber),
            )}
          </Text>
        </Pressable>

        <View style={styles.section}>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            {CREDIT_NOTE_COPY.reasonLabel}
          </Text>

          {CREDIT_NOTE_REASON_OPTIONS.map((option) => (
            <Pressable
              key={option.value}
              onPress={() => setReason(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: reason === option.value }}
              accessibilityLabel={option.label}
              testID={`credit-reason-${option.value}`}
              style={[styles.reasonRow, reason === option.value ? styles.reasonSelected : null]}
            >
              <Text
                variant="bodyMedium"
                style={reason === option.value ? styles.reasonLabelSelected : styles.body}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.section}>
          <CreditItemSelector
            drafts={drafts}
            onToggle={handleToggle}
            onAmountChange={handleAmountChange}
          />
        </View>

        <View style={styles.section}>
          <Text variant="titleMedium" style={styles.creditTotal} testID="credit-note-total">
            {CREDIT_NOTE_COPY.creditTotal(totalPaise)}
          </Text>
        </View>

        <View style={styles.section}>
          <TextInput
            mode="outlined"
            label={CREDIT_NOTE_COPY.notesLabel}
            placeholder={CREDIT_NOTE_COPY.notesPlaceholder}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            maxLength={1000}
            testID="credit-note-notes"
          />
        </View>

        {error !== null ? (
          <View style={styles.section}>
            <Text variant="bodySmall" style={styles.error} testID="credit-note-error-text">
              {error}
            </Text>
          </View>
        ) : null}

        <View style={[styles.section, styles.actions]}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel={CREDIT_NOTE_COPY.cancelButton}
            testID="credit-note-cancel"
            style={styles.textButton}
          >
            <Text variant="labelLarge" style={styles.neutralLabel}>
              {CREDIT_NOTE_COPY.cancelButton}
            </Text>
          </Pressable>

          <Pressable
            onPress={handleIssue}
            disabled={issueCreditNote.isPending}
            accessibilityRole="button"
            accessibilityState={{ disabled: issueCreditNote.isPending }}
            accessibilityLabel={CREDIT_NOTE_COPY.issueButton}
            testID="credit-note-submit"
            style={[styles.filledButton, issueCreditNote.isPending ? styles.disabled : null]}
          >
            {issueCreditNote.isPending ? (
              <ActivityIndicator color={COLORS.onPrimary} />
            ) : (
              <Text variant="labelLarge" style={styles.filledLabel}>
                {CREDIT_NOTE_COPY.issueButton}
              </Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
  },
  section: {
    paddingHorizontal: 16,
    marginTop: 16,
    gap: 8,
  },
  sectionTitle: {
    fontWeight: '700',
    color: COLORS.onSurface,
  },
  body: {
    color: COLORS.onSurface,
  },
  link: {
    color: COLORS.primary,
  },
  reasonRow: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.outline,
  },
  reasonSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryContainer,
  },
  reasonLabelSelected: {
    color: COLORS.onPrimaryContainer,
    fontWeight: '600',
  },
  // 06-UI-SPEC: the credit total renders in the error colour, because it is a
  // reduction of what the clinic is owed.
  creditTotal: {
    color: COLORS.error,
    fontWeight: '700',
    textAlign: 'right',
  },
  error: {
    color: COLORS.error,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  textButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  neutralLabel: {
    color: COLORS.onSurfaceVariant,
  },
  filledButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 24,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
  },
  filledLabel: {
    color: COLORS.onPrimary,
  },
  disabled: {
    opacity: 0.5,
  },
});
