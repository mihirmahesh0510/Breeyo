import React, { useCallback, useMemo, useState } from 'react';
import { View, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { useRouter, Stack } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { EmptyState, showToast } from '@breeyo/ui';
import { useInvoice } from '../hooks/useInvoice';
import { useInvoiceSocket } from '../hooks/useInvoiceSocket';
import { usePaymentMutations, type VoidInvoiceResult } from '../hooks/usePaymentMutations';
import { useGeneratePdf } from '../../pdf/hooks/useGeneratePdf';
import { BillingShareOptionsSheet } from '../../pdf/components/ShareOptionsSheet';
import { InvoiceClinicHeader } from '../components/InvoiceClinicHeader';
import { InvoicePaymentHistory } from '../components/InvoicePaymentHistory';
import { InvoiceActionBar } from '../components/InvoiceActionBar';
import { VoidedOverlay } from '../components/VoidedOverlay';
import { LinkedCreditNotes } from '../components/LinkedCreditNotes';
import { VoidConfirmSheet } from '../components/VoidConfirmSheet';
import { InvoiceTotalsSection } from '../components/InvoiceTotalsSection';
import { PaymentCollectionSheet } from '../components/PaymentCollectionSheet';
import { RefundSheet } from '../components/RefundSheet';
import { formatPaiseINR, invoiceStatusColors, invoiceStatusLabel } from '../lib/format';
import {
  INVOICE_SCREEN_COPY,
  buildVoidPayload,
  ownerLine,
  patientLine,
  screenTitleFor,
  showBalanceDue,
  voidSuccessToast,
} from '../lib/invoice-screen';
import { BILLING_ROUTES } from './BillingDashboardScreen';

export interface InvoiceDetailScreenProps {
  invoiceId: string;
}

const COLORS = {
  surface: '#FFFBF5',
  surfaceVariant: '#F5F0EB',
  onSurface: '#1C1B1F',
  onSurfaceVariant: '#49454F',
  outline: '#CAC4D0',
  primary: '#2E7D32',
  error: '#BA1A1A',
  errorContainer: '#FFDAD6',
  onErrorContainer: '#410002',
} as const;

/**
 * The D-18 full in-app invoice view (BIL-03, BIL-04, BIL-05, BIL-06).
 *
 * ## This file decides nothing
 *
 * Which actions the status permits comes from `lib/invoice-actions.ts`, which
 * derives every button from the same D-20 transition table the server enforces.
 * The copy, the balance gate, the void body and the void toast come from
 * `lib/invoice-screen.ts`. The payment, refund and credit-note flows are owned
 * by their own components and modules. What is left here is composition and
 * navigation — deliberately, because `apps/mobile` cannot render a React Native
 * component under test, so anything decided in this file would be decided
 * where no test can reach it.
 *
 * ## The skeleton is `PatientDetailScreen`'s
 *
 * Same loading `ActivityIndicator`, same `EmptyState` error branch with a Go
 * Back action, same `ScrollView` with `RefreshControl`, same section shape and
 * the same token values. A second detail-screen dialect would be a second thing
 * to learn for no gain.
 *
 * ## Freshness is pushed, not polled
 *
 * `useInvoiceSocket` invalidates the `['invoices']` namespace on
 * `invoice:updated` and `payment:received`, and `useInvoice` sets no polling
 * timer. Pull-to-refresh is the fallback, not the mechanism (T-06-113).
 *
 * ## Copy rendered here
 *
 * All of it from `INVOICE_SCREEN_COPY` in `lib/invoice-screen.ts`, which
 * `__tests__/InvoiceDetailScreen.test.tsx` asserts verbatim against 06-UI-SPEC.
 * Named here so a reader can find the strings without opening the copy module:
 * `Items`, `Patient: [name] ([species])`, `Owner: [name] — [phone]`,
 * `Balance Due: Rs [N]`, `Could not load invoice. Go back and try again.`,
 * `Go Back`, and the two void outcomes `Invoice voided. Items returned to stock.`
 * and `Invoice voided` — which of those two appears is decided by
 * `voidSuccessToast` from the server's own `restoredMovementCount`, not by this
 * file. The action labels belong to `lib/invoice-actions.ts`.
 */
export function InvoiceDetailScreen({ invoiceId }: InvoiceDetailScreenProps) {
  const router = useRouter();

  useInvoiceSocket();

  const { data: invoice, isLoading, isError, refetch, isFetching } = useInvoice(invoiceId);
  const mutations = usePaymentMutations(invoiceId);
  const pdf = useGeneratePdf();

  const [isPaying, setIsPaying] = useState(false);
  const [isVoiding, setIsVoiding] = useState(false);
  const [isRefunding, setIsRefunding] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  const title = screenTitleFor(invoice?.invoiceNumber ?? null);

  const exceptionBanner = useMemo(
    () => INVOICE_SCREEN_COPY.exceptionBanner(invoice?.exceptionFlag),
    [invoice?.exceptionFlag],
  );

  /**
   * Every document action reports its own failure.
   *
   * `useGeneratePdf` sets `error` and rethrows, so a Print that never reached a
   * printer is distinguishable from one that reached a printer in another room.
   * Silence here would make the two identical.
   */
  const runPdfAction = useCallback(
    async (action: () => Promise<unknown>) => {
      try {
        await action();
      } catch (error) {
        showToast(
          'error',
          INVOICE_SCREEN_COPY.pdfErrorToast(
            error instanceof Error ? error.message : 'unknown error',
          ),
        );
      }
    },
    [],
  );

  const handlePrint = useCallback(
    () => runPdfAction(() => pdf.printInvoice(invoiceId)),
    [invoiceId, pdf, runPdfAction],
  );
  const handleShare = useCallback(
    () => runPdfAction(() => pdf.generateInvoice(invoiceId)),
    [invoiceId, pdf, runPdfAction],
  );
  const handleDownload = useCallback(
    () => runPdfAction(() => pdf.saveInvoice(invoiceId)),
    [invoiceId, pdf, runPdfAction],
  );

  const handleViewReceipt = useCallback(
    (receiptId: string | null) => {
      if (!receiptId) {
        showToast('info', INVOICE_SCREEN_COPY.receiptUnavailableToast);
        return;
      }
      void runPdfAction(() => pdf.generateReceipt(invoiceId, receiptId));
    },
    [invoiceId, pdf, runPdfAction],
  );

  /**
   * D-26 / D-34: the request always carries `restoreStock: true`, and the toast
   * reports what the server actually reversed rather than what a control on
   * this device claimed. `restoredMovementCount` is zero for a services-only
   * invoice and for one whose products were dispensed during a consultation —
   * promising "Items returned to stock" in either case would be a claim the
   * stock ledger does not support.
   */
  const handleVoidConfirm = useCallback(
    ({ reason }: { reason: string; restoreStock: boolean }) => {
      let body;
      try {
        body = buildVoidPayload(reason);
      } catch (error) {
        showToast('error', error instanceof Error ? error.message : 'Invalid void request');
        return;
      }

      mutations.voidInvoice.mutate(body, {
        onSuccess: (response: { data: VoidInvoiceResult }) => {
          setIsVoiding(false);
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          showToast('success', voidSuccessToast(response.data.restoredMovementCount));
        },
        onError: (error: unknown) => {
          showToast('error', error instanceof Error ? error.message : 'Could not void the invoice');
        },
      });
    },
    [mutations.voidInvoice],
  );

  if (isLoading) {
    return (
      <View style={styles.centered} testID="invoice-detail-loading">
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (isError || !invoice) {
    return (
      <View style={styles.centered} testID="invoice-detail-error">
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
      <Stack.Screen options={{ title }} />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={COLORS.primary} />
        }
        testID="invoice-detail-scroll"
      >
        <InvoiceClinicHeader
          clinic={invoice.clinic}
          gstEnabledSnapshot={invoice.gstEnabledSnapshot}
        />

        {exceptionBanner ? (
          <View style={styles.exceptionBanner} testID="invoice-exception-banner">
            <Text variant="bodyMedium" style={styles.exceptionText}>
              {exceptionBanner}
            </Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: invoiceStatusColors(invoice.status).background },
            ]}
            testID="invoice-status-badge"
          >
            <Text
              variant="labelSmall"
              style={{ color: invoiceStatusColors(invoice.status).text }}
            >
              {invoiceStatusLabel(invoice.status)}
            </Text>
          </View>

          {invoice.pet ? (
            <Text variant="bodyMedium" style={styles.body}>
              {patientLine(invoice.pet)}
            </Text>
          ) : null}

          {invoice.owner ? (
            <Text variant="bodyMedium" style={styles.body}>
              {ownerLine(invoice.owner)}
            </Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            {INVOICE_SCREEN_COPY.itemsHeader}
          </Text>

          {invoice.lineItems.map((item) => (
            <View key={item.id} style={styles.lineRow}>
              <Text variant="bodyMedium" style={styles.lineDescription} numberOfLines={2}>
                {item.description}
              </Text>
              <Text variant="bodySmall" style={styles.caption}>
                {`${item.quantity} × ${formatPaiseINR(item.unitPricePaise)}`}
              </Text>
              <Text variant="bodyMedium" style={styles.lineTotal}>
                {formatPaiseINR(item.lineTotalPaise)}
              </Text>
            </View>
          ))}
        </View>

        {/*
          The totals are the same component the builder uses, fed a projection
          of the invoice's own persisted columns. Nothing is added here: the
          three tax heads were rounded once at invoice level, and `roundOffPaise`
          is a Section 170 / Rule 51 disclosure line that is deliberately NOT a
          component of the grand total (06-05). Re-adding it would overstate the
          document on the screen the figure is read aloud from.
        */}
        <View style={styles.section}>
          <InvoiceTotalsSection
            breakdown={{
              taxableValuePaise: invoice.taxableValuePaise,
              cgstPaise: invoice.cgstPaise,
              sgstPaise: invoice.sgstPaise,
              igstPaise: invoice.igstPaise,
              roundOffPaise: invoice.roundOffPaise,
              grandTotalPaise: invoice.grandTotalPaise,
              documentType: invoice.documentType ?? 'tax_invoice',
            }}
            amounts={{
              subtotalPaise: invoice.subtotalPaise,
              invoiceDiscountPaise: invoice.invoiceDiscountPaise,
            }}
            gstEnabled={invoice.gstEnabledSnapshot}
          />

          {showBalanceDue(invoice.status, invoice.balancePaise) ? (
            <Text variant="titleSmall" style={styles.balanceDue} testID="invoice-balance-due">
              {INVOICE_SCREEN_COPY.balanceDue(invoice.balancePaise)}
            </Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <InvoicePaymentHistory payments={invoice.payments} refunds={invoice.refunds} />
        </View>

        <View style={styles.section}>
          <LinkedCreditNotes
            creditNotes={invoice.creditNotes}
            onTap={(creditNoteId) => void runPdfAction(() => pdf.generateCreditNote(creditNoteId))}
          />
        </View>

        <InvoiceActionBar
          status={invoice.status}
          hasPayments={invoice.payments.length > 0}
          exceptionFlag={invoice.exceptionFlag}
          onPay={() => setIsPaying(true)}
          onPrint={handlePrint}
          onShare={() => setIsSharing(true)}
          onDownload={handleDownload}
          onVoid={() => setIsVoiding(true)}
          onCreditNote={() => router.push(BILLING_ROUTES.creditNote(invoiceId) as never)}
          onRefund={() => setIsRefunding(true)}
          onEdit={() => router.push(BILLING_ROUTES.editDraft(invoiceId) as never)}
          onDelete={() => setIsVoiding(true)}
        />

        {/*
          Absolutely positioned and non-interactive, so Print, Share and
          Download — the three actions a voided invoice keeps — stay reachable
          underneath the stamp.
        */}
        {invoice.status === 'VOIDED' ? (
          <VoidedOverlay voidDate={invoice.voidedAt} voidReason={invoice.voidReason} />
        ) : null}
      </ScrollView>

      <PaymentCollectionSheet
        visible={isPaying}
        onDismiss={() => setIsPaying(false)}
        amountDuePaise={invoice.balancePaise}
        amountPaidPaise={invoice.amountPaidPaise}
        mutations={mutations}
        onViewReceipt={handleViewReceipt}
      />

      <VoidConfirmSheet
        visible={isVoiding}
        onDismiss={() => setIsVoiding(false)}
        invoiceNumber={invoice.invoiceNumber}
        grandTotalPaise={invoice.grandTotalPaise}
        onConfirm={handleVoidConfirm}
        isSubmitting={mutations.voidInvoice.isPending}
      />

      <RefundSheet
        visible={isRefunding}
        onDismiss={() => setIsRefunding(false)}
        invoiceId={invoiceId}
        mutations={mutations}
      />

      <BillingShareOptionsSheet
        visible={isSharing}
        title={title}
        isGenerating={pdf.isGenerating}
        error={pdf.error}
        onPrint={handlePrint}
        onShare={handleShare}
        onDownload={handleDownload}
        onClose={() => setIsSharing(false)}
      />
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
    color: COLORS.onSurfaceVariant,
  },
  caption: {
    color: COLORS.onSurfaceVariant,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  exceptionBanner: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: COLORS.errorContainer,
  },
  exceptionText: {
    color: COLORS.onErrorContainer,
  },
  lineRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.outline,
  },
  lineDescription: {
    color: COLORS.onSurface,
  },
  lineTotal: {
    color: COLORS.onSurface,
    textAlign: 'right',
  },
  balanceDue: {
    marginTop: 8,
    color: COLORS.error,
    textAlign: 'right',
  },
});
