import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Text, Button as PaperButton } from 'react-native-paper';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { showToast } from '@breeyo/ui';
import type { DiscountType, InventoryItem, InvoiceSource } from '@breeyo/types';
import { useAuth } from '../../../providers/AuthProvider';
import { useInventoryItems } from '../../inventory/hooks/useInventoryApi';
import { useBillingSettings } from '../hooks/useBillingSettings';
import { useInvoiceDetail } from '../hooks/useInvoiceDetail';
import { useServiceCatalog } from '../hooks/useServiceCatalog';
import {
  useCreateInvoice,
  useFinalizeInvoice,
  usePreviewTotals,
  useUpdateDraft,
} from '../hooks/useInvoiceMutations';
import { useInvoiceBuilderStore } from '../stores/invoiceBuilderStore';
import { PatientInvoiceHeader } from '../components/PatientInvoiceHeader';
import { ServiceCatalogSheet } from '../components/ServiceCatalogSheet';
import { InvoiceLineItemRow } from '../components/InvoiceLineItemRow';
import { InvoiceDiscountRow } from '../components/InvoiceDiscountRow';
import { InvoiceTotalsSection } from '../components/InvoiceTotalsSection';
import { StockValidationBanner } from '../components/StockValidationBanner';
import { InvoiceDueDatePicker } from '../components/InvoiceDueDatePicker';
import { BUILDER_COPY, sortCatalogEntries, type ServiceCatalogEntry } from '../lib/builder-copy';
import { PREVIEW_TOTALS_DEBOUNCE_MS, shouldPreviewTotals } from '../lib/builder-state';
import {
  BUILDER_SCREEN_COPY,
  buildDraftPayload,
  buildFinalizeInput,
  classifyFinalizeError,
  draftFromInvoiceDetail,
  inventoryLineFrom,
  isFinalizeBlocked,
  linesSignature,
  partitionLines,
  screenTitle,
  serviceLineFrom,
  shortfallLocalIds,
  totalsToRender,
  type FinalizeBlock,
  type PreviewResult,
} from '../lib/builder-screen';
import { BILLING_ROUTES } from './BillingDashboardScreen';

const COLORS = {
  surface: '#FFFBF5',
  onSurface: '#1C1B1F',
  onSurfaceVariant: '#49454F',
  error: '#BA1A1A',
  outline: '#CAC4D0',
} as const;

export interface InvoiceBuilderScreenProps {
  /** An existing draft to edit — the D-01/D-03 path from a consultation. */
  invoiceId?: string;
  /** Set when the builder was opened for a consultation with no draft yet. */
  consultationId?: string;
  petId?: string;
  ownerId?: string;
}

/**
 * The invoice builder (BIL-01, BIL-02, BIL-07 — D-01, D-02, D-06, D-07).
 *
 * ## This file decides nothing
 *
 * Every decision it appears to make is delegated to `lib/builder-screen.ts`:
 * the request bodies, the finalize-failure classification, the finalize block
 * and its clearing, the section split, the title and the totals presentation.
 * That module is React-Native-free and unit-tested, and this file is the layout
 * over it. The reason is mechanical rather than stylistic — `apps/mobile` cannot
 * render a React Native component under test (vitest `node` environment, no
 * Metro transform, no `react-test-renderer`), so any logic living in this file
 * would be logic nothing can check. 06-14, 06-15, 06-16 and 06-23 are built the
 * same way.
 *
 * ## The client never computes money
 *
 * There is no addition of any paise value in this file and no total in the
 * store. The live figure comes from `preview-totals` and is rendered by
 * `InvoiceTotalsSection`, which takes server-computed objects and performs no
 * arithmetic either. `grandTotalPaise` and the three tax heads appear in this
 * feature only as reads from a server response (T-06-102, T-06-103).
 *
 * ## Save, then preview
 *
 * `preview-totals` computes from the invoice's PERSISTED line items — it takes
 * an invoice id, not a body of lines (plan 06-16). So the debounced effect saves
 * the draft first and previews from the response. That ordering is a feature: the
 * preview and the finalize read the same rows, so the figure the front desk
 * reads out cannot disagree with the figure charged.
 */
export function InvoiceBuilderScreen({
  invoiceId: initialInvoiceId,
  consultationId,
  petId,
  ownerId,
}: InvoiceBuilderScreenProps) {
  const router = useRouter();
  const { activeClinicId } = useAuth();

  // The draft's server identity. It starts null for a standalone invoice and is
  // filled by the first successful save, which is what unlocks the preview.
  const [invoiceId, setInvoiceId] = useState<string | null>(initialInvoiceId ?? null);

  const detailQuery = useInvoiceDetail(invoiceId);
  const settingsQuery = useBillingSettings();
  const catalogQuery = useServiceCatalog();

  const createInvoice = useCreateInvoice();
  const updateDraft = useUpdateDraft();
  const finalizeInvoice = useFinalizeInvoice();
  const previewTotals = usePreviewTotals();

  const lines = useInvoiceBuilderStore((state) => state.lines);
  const invoiceDiscountType = useInvoiceBuilderStore((state) => state.invoiceDiscountType);
  const invoiceDiscountValue = useInvoiceBuilderStore((state) => state.invoiceDiscountValue);
  const dueDate = useInvoiceBuilderStore((state) => state.dueDate);
  const notes = useInvoiceBuilderStore((state) => state.notes);
  const addLine = useInvoiceBuilderStore((state) => state.addLine);
  const updateLineQuantity = useInvoiceBuilderStore((state) => state.updateLineQuantity);
  const removeLine = useInvoiceBuilderStore((state) => state.removeLine);
  const setInvoiceDiscount = useInvoiceBuilderStore((state) => state.setInvoiceDiscount);
  const setDueDate = useInvoiceBuilderStore((state) => state.setDueDate);
  const hydrate = useInvoiceBuilderStore((state) => state.hydrate);
  const reset = useInvoiceBuilderStore((state) => state.reset);

  const [serviceSheetVisible, setServiceSheetVisible] = useState(false);
  const [productSheetVisible, setProductSheetVisible] = useState(false);
  const [serviceSearch, setServiceSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [discountText, setDiscountText] = useState('');
  const [discountType, setDiscountType] = useState<DiscountType>('percent');

  const [lastPreview, setLastPreview] = useState<PreviewResult | null>(null);
  const [finalizeBlock, setFinalizeBlock] = useState<FinalizeBlock | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const productQuery = useInventoryItems(activeClinicId, { search: productSearch });

  // ── Hydrate an existing draft ────────────────────────────────────────────
  //
  // Guarded on a ref rather than on the store being empty: re-running after the
  // front desk has edited would silently discard their work every time the
  // query refetched.
  const hydratedRef = useRef<string | null>(null);
  useEffect(() => {
    const draft = detailQuery.data;
    if (!draft || hydratedRef.current === draft.id) return;

    hydratedRef.current = draft.id;
    // Normalised rather than passed straight through: `dueDate` is declared a
    // `Date` but arrives as a string, and the lines are ordered by `sortOrder`.
    hydrate(draftFromInvoiceDetail(draft));
  }, [detailQuery.data, hydrate]);

  // ── T-06-107: no leakage between patients ────────────────────────────────
  //
  // The store is module-level and shared, so without this the next patient's
  // builder opens holding the previous patient's lines — and if nobody notices,
  // bills them. Written as an explicit cleanup call rather than by returning the
  // action itself, so that what runs on unmount is legible at a glance.
  useEffect(
    () => () => {
      reset();
    },
    [reset],
  );

  const signature = linesSignature(lines, invoiceDiscountType, invoiceDiscountValue);

  // ── The debounced server preview ─────────────────────────────────────────
  //
  // 400ms of quiescence on any billable change (plan 06-16 exports the figure
  // and leaves the timer to this call site). Saves first, because the endpoint
  // reads persisted rows.
  const previewSeqRef = useRef(0);
  useEffect(() => {
    if (lines.length === 0) return undefined;

    const timer = setTimeout(() => {
      const seq = ++previewSeqRef.current;

      const payload = buildDraftPayload({
        lines,
        invoiceDiscountType,
        invoiceDiscountValue,
        dueDate,
        notes,
        petId: petId ?? null,
        ownerId: ownerId ?? null,
        consultationId: consultationId ?? null,
        source: (consultationId ? 'consultation' : 'manual') as InvoiceSource,
      });

      const save = invoiceId
        ? updateDraft.mutateAsync({ invoiceId, updates: payload })
        : createInvoice.mutateAsync(payload);

      save
        .then((response) => {
          const saved = response.data;
          if (!invoiceId) setInvoiceId(saved.id);
          if (!shouldPreviewTotals(saved.id, lines.length)) return null;

          return previewTotals.mutateAsync(saved.id).then((preview) => {
            // A slower earlier request must not overwrite a newer figure — the
            // one on screen is the one somebody is about to read out.
            if (seq !== previewSeqRef.current) return null;

            setLastPreview({
              breakdown: preview.data,
              // Both figures are read from the server's saved invoice; neither
              // is derived here.
              amounts: {
                subtotalPaise: saved.subtotalPaise,
                invoiceDiscountPaise: saved.invoiceDiscountPaise,
              },
            });
            setErrorMessage(null);
            return null;
          });
        })
        .catch(() => {
          // The previous figures stay on screen, dimmed, rather than blanking
          // or being replaced by client arithmetic (T-06-139).
          if (seq === previewSeqRef.current) setErrorMessage(BUILDER_SCREEN_COPY.saveErrorBanner);
        });
    }, PREVIEW_TOTALS_DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // `signature` stands in for the line content: a re-render that changes
    // nothing billable must not cost a round trip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  // ── Derived, all from the tested module ──────────────────────────────────

  const settings = settingsQuery.data;
  const pet = detailQuery.data?.pet ?? null;
  const owner = detailQuery.data?.owner ?? null;
  const title = screenTitle(pet?.name);
  const { services, products, hasDispensedProducts } = partitionLines(lines);
  const shortfalls = finalizeBlock?.shortfalls ?? [];
  const blockedIds = shortfallLocalIds(lines, shortfalls);
  const isSubmitting = finalizeInvoice.isPending;
  const isSaving = createInvoice.isPending || updateDraft.isPending;
  const blocked = isFinalizeBlocked(finalizeBlock, lines, invoiceDiscountType, invoiceDiscountValue);
  const totals = totalsToRender(lastPreview, previewTotals.isPending || isSaving);

  const catalogEntries: ServiceCatalogEntry[] = useMemo(
    () => sortCatalogEntries(catalogQuery.data ?? []),
    [catalogQuery.data],
  );

  /**
   * D-45 carried onto the Add Product path: an out-of-stock item is shown
   * disabled with a reason, never hidden and never selectable. The same
   * `catalogEntryAvailability` rule the service sheet uses applies, which is why
   * the flag is set here rather than a second grey-out rule being written.
   */
  const productEntries: ServiceCatalogEntry[] = useMemo(() => {
    const items: InventoryItem[] = productQuery.data?.items ?? [];
    return items.map(
      (item) =>
        ({
          id: item.id,
          clinicId: item.clinicId,
          name: item.name,
          category: 'other',
          price: 0,
          sacCode: null,
          hsnCode: item.hsnSacCode,
          gstRateOverride: item.gstRate,
          isActive: item.isActive,
          isPreset: false,
          sortOrder: 0,
          outOfStock: item.currentStock <= 0,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        }) as ServiceCatalogEntry,
    );
  }, [productQuery.data]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleAddService = useCallback(
    (entry: ServiceCatalogEntry) => {
      addLine(serviceLineFrom(entry, settings?.defaultGstRate));
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [addLine, settings?.defaultGstRate],
  );

  const handleAddProduct = useCallback(
    (entry: ServiceCatalogEntry) => {
      const item = (productQuery.data?.items ?? []).find(
        (candidate: InventoryItem) => candidate.id === entry.id,
      );
      if (!item) return;

      addLine(inventoryLineFrom(item, settings?.defaultGstRate));
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [addLine, productQuery.data, settings?.defaultGstRate],
  );

  const handleRemove = useCallback(
    (localId: string) => {
      removeLine(localId);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
    [removeLine],
  );

  const handleSaveDraft = useCallback(() => {
    const payload = buildDraftPayload({
      lines,
      invoiceDiscountType,
      invoiceDiscountValue,
      dueDate,
      notes,
      petId: petId ?? null,
      ownerId: ownerId ?? null,
      consultationId: consultationId ?? null,
      source: (consultationId ? 'consultation' : 'manual') as InvoiceSource,
    });

    const save = invoiceId
      ? updateDraft.mutateAsync({ invoiceId, updates: payload })
      : createInvoice.mutateAsync(payload);

    save
      .then((response) => {
        if (!invoiceId) setInvoiceId(response.data.id);
        setErrorMessage(null);
        showToast('success', BUILDER_SCREEN_COPY.draftSavedToast);
      })
      .catch(() => setErrorMessage(BUILDER_SCREEN_COPY.saveErrorBanner));
  }, [
    lines,
    invoiceDiscountType,
    invoiceDiscountValue,
    dueDate,
    notes,
    petId,
    ownerId,
    consultationId,
    invoiceId,
    updateDraft,
    createInvoice,
  ]);

  /**
   * Finalize sends no line items and no money — only a due date, notes and a
   * place of supply. The invoice's contents are already persisted; the server
   * numbers it, freezes the tax snapshot and deducts stock in one transaction,
   * and recomputes every figure from its own rows (T-06-102).
   */
  const handleFinalize = useCallback(() => {
    if (!invoiceId) return;

    const input = buildFinalizeInput({
      dueDate,
      notes,
      placeOfSupplyStateCode: settings?.stateCode ?? null,
    });

    finalizeInvoice
      .mutateAsync({ invoiceId, input })
      .then(() => {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showToast('success', BUILDER_SCREEN_COPY.finalizeSuccessToast);
        router.replace(BILLING_ROUTES.invoiceDetail(invoiceId) as never);
      })
      .catch((error: unknown) => {
        const outcome = classifyFinalizeError(error);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

        if (outcome.kind === 'insufficient_stock') {
          // The draft stays editable. The block clears itself as soon as any
          // billable field changes, so the front desk is never stranded.
          setFinalizeBlock({
            signature: linesSignature(lines, invoiceDiscountType, invoiceDiscountValue),
            shortfalls: outcome.shortfalls,
          });
          setErrorMessage(null);
          return;
        }

        setErrorMessage(outcome.message);

        if (outcome.navigateToDetail) {
          // D-21: someone else finalized it, the invoice is now immutable and no
          // retry from here can succeed. Say so and show them the invoice as it
          // stands rather than discarding their edits in silence.
          showToast('info', outcome.message);
          router.replace(BILLING_ROUTES.invoiceDetail(invoiceId) as never);
        }
      });
  }, [
    invoiceId,
    dueDate,
    notes,
    settings?.stateCode,
    finalizeInvoice,
    lines,
    invoiceDiscountType,
    invoiceDiscountValue,
    router,
  ]);

  // ── Render ───────────────────────────────────────────────────────────────

  const renderLine = (localId: string) => blockedIds.includes(localId);

  return (
    <View style={styles.screen} testID="invoice-builder-screen">
      <Text variant="titleLarge" style={styles.title} accessibilityRole="header">
        {title}
      </Text>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <PatientInvoiceHeader pet={pet} owner={owner} />

        <StockValidationBanner shortfalls={shortfalls} />

        {errorMessage ? (
          <Text style={styles.error} testID="invoice-builder-error">
            {errorMessage}
          </Text>
        ) : null}

        <Text variant="titleMedium" style={styles.sectionHeading}>
          {BUILDER_COPY.sectionServices}
        </Text>
        {services.map((line) => (
          <InvoiceLineItemRow
            key={line.localId}
            line={line}
            onQuantityChange={updateLineQuantity}
            onRemove={handleRemove}
            hasShortfall={renderLine(line.localId)}
            disabled={isSubmitting}
            testID={`invoice-line-${line.localId}`}
          />
        ))}
        <PaperButton
          mode="outlined"
          icon="plus"
          onPress={() => setServiceSheetVisible(true)}
          disabled={isSubmitting}
          style={styles.addButton}
          testID="add-service-button"
        >
          {BUILDER_COPY.addService}
        </PaperButton>

        <Text variant="titleMedium" style={styles.sectionHeading}>
          {BUILDER_COPY.sectionProducts}
        </Text>
        {hasDispensedProducts ? (
          <Text variant="bodySmall" style={styles.caption} testID="dispensed-caption">
            {BUILDER_COPY.productsAutoFillNote}
          </Text>
        ) : null}
        {products.map((line) => (
          <InvoiceLineItemRow
            key={line.localId}
            line={line}
            onQuantityChange={updateLineQuantity}
            onRemove={handleRemove}
            hasShortfall={renderLine(line.localId)}
            disabled={isSubmitting}
            testID={`invoice-line-${line.localId}`}
          />
        ))}
        <PaperButton
          mode="outlined"
          icon="plus"
          onPress={() => setProductSheetVisible(true)}
          disabled={isSubmitting}
          style={styles.addButton}
          testID="add-product-button"
        >
          {BUILDER_COPY.addProduct}
        </PaperButton>

        <InvoiceDiscountRow
          type={discountType}
          onTypeChange={setDiscountType}
          onChange={setInvoiceDiscount}
          text={discountText}
          onTextChange={setDiscountText}
          disabled={isSubmitting}
        />

        <InvoiceTotalsSection
          breakdown={totals.breakdown}
          amounts={totals.amounts}
          gstEnabled={settings?.gstEnabled ?? false}
          isLoading={totals.dimmed}
        />

        <InvoiceDueDatePicker
          dueDate={dueDate}
          onChange={setDueDate}
          defaultDays={settings?.defaultDueDays ?? 0}
          disabled={isSubmitting}
        />
      </ScrollView>

      <View style={styles.actions}>
        <PaperButton
          mode="contained"
          onPress={handleFinalize}
          disabled={isSubmitting || blocked || lines.length === 0 || !invoiceId}
          testID="finalize-invoice-button"
        >
          {isSubmitting ? <ActivityIndicator /> : BUILDER_SCREEN_COPY.finalizeButton}
        </PaperButton>
        <PaperButton
          mode="outlined"
          onPress={handleSaveDraft}
          disabled={isSubmitting || isSaving || lines.length === 0}
          testID="save-draft-button"
        >
          {BUILDER_SCREEN_COPY.saveDraftButton}
        </PaperButton>
        <PaperButton mode="text" onPress={() => router.back()} testID="cancel-button">
          {BUILDER_SCREEN_COPY.cancelButton}
        </PaperButton>
      </View>

      <ServiceCatalogSheet
        visible={serviceSheetVisible}
        onDismiss={() => setServiceSheetVisible(false)}
        services={catalogEntries}
        onSelect={handleAddService}
        onAddCustom={() => setServiceSheetVisible(false)}
        searchTerm={serviceSearch}
        onSearchTermChange={setServiceSearch}
        isSearching={catalogQuery.isFetching}
        testID="service-catalog-sheet"
      />

      <ServiceCatalogSheet
        visible={productSheetVisible}
        onDismiss={() => setProductSheetVisible(false)}
        services={productEntries}
        onSelect={handleAddProduct}
        onAddCustom={() => setProductSheetVisible(false)}
        searchTerm={productSearch}
        onSearchTermChange={setProductSearch}
        isSearching={productQuery.isFetching}
        testID="product-catalog-sheet"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  title: {
    color: COLORS.onSurface,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  body: {
    paddingBottom: 24,
  },
  sectionHeading: {
    color: COLORS.onSurface,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  caption: {
    color: COLORS.onSurfaceVariant,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  addButton: {
    marginHorizontal: 16,
    marginTop: 8,
  },
  error: {
    color: COLORS.error,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  actions: {
    gap: 8,
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.outline,
    backgroundColor: COLORS.surface,
  },
});
