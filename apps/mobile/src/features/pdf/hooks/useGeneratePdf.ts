import { useState, useCallback, useRef } from 'react';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { apiClient } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';
import { buildOwnerSummaryHtml } from '../templates/consultation-summary';
import { buildClinicalRecordHtml } from '../templates/clinical-record';
import { buildPrescriptionPadHtml } from '../templates/prescription-pad';
import {
  buildVaccinationCertificateHtml,
  type VaccinationCertificateData,
} from '../templates/vaccination-certificate';
import { buildInvoiceHtml } from '../templates/invoice';
import { buildPaymentReceiptHtml } from '../templates/payment-receipt';
import { buildCreditNoteHtml, type CreditNoteDocument } from '../templates/credit-note';
import type {
  Consultation,
  PrescriptionItem,
  ConsultationAttachment,
  Pet,
  Owner,
  Clinic,
  InvoiceDetail,
  PaymentReceipt,
} from '@breeyo/types';

interface ConsultationDetailResponse {
  data: {
    consultation: Consultation;
    prescriptions: PrescriptionItem[];
    attachments: ConsultationAttachment[];
    pet: Pet;
    owner: Owner;
    clinic: Clinic;
    vet: { fullName: string; licenseNumber: string | null };
  };
}

interface CertificateResponse {
  data: VaccinationCertificateData & {
    clinic: Clinic;
  };
}

/**
 * Generates a PDF from HTML content and opens the native share sheet.
 * Uses expo-print for HTML-to-PDF conversion and expo-sharing for distribution.
 * Logo images should use base64 data URIs for iOS compatibility.
 */
async function generatePdf(html: string, filename: string): Promise<void> {
  // Generate PDF from HTML
  const { uri } = await Print.printToFileAsync({ html });

  // Move to meaningful filename in cache directory
  const pdfFilename = `${filename.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
  const destinationUri = `${FileSystem.cacheDirectory}${pdfFilename}`;

  await FileSystem.moveAsync({
    from: uri,
    to: destinationUri,
  });

  // Open native share sheet
  await Sharing.shareAsync(destinationUri, {
    mimeType: 'application/pdf',
    dialogTitle: `Share ${filename}`,
    UTI: 'com.adobe.pdf',
  });
}

// ─── Phase 6 billing documents (BIL-04, D-16) ───────────────────────────────
//
// Everything between here and `UseGeneratePdfReturn` is deliberately at module
// scope rather than inside the hook. `apps/mobile` cannot render a React
// component or a hook under test — `vitest.config.ts` is the `node` environment
// with no Metro transform and no `react-test-renderer` (06-14-SUMMARY.md
// deviation 1) — so logic that lives inside a `useCallback` is logic that
// cannot be asserted at all. The hook's billing callbacks below are thin
// wrappers that supply `tokenRef.current` and manage `isGenerating` / `error`;
// the work itself is here, where `__tests__/billing-pdf-actions.test.ts` can
// reach it.
//
// SECURITY (T-06-97): a generated billing PDF carries owner PII and clinic
// financial data. Every write below targets the app-private cache or documents
// directory. The shared-gallery and shared-storage APIs are forbidden here,
// because anything written through them is readable by every other app on the
// device. A grep gate enforces that, so this note deliberately names none of
// the forbidden identifiers — a gate that trips on the comment explaining it is
// worse than no gate (the same resolution 06-14 reached for the money gates).

/** An assembled document, ready to print, share or save. */
export interface BillingPdfDocument {
  html: string;
  filename: string;
}

interface InvoiceDetailResponse {
  data: InvoiceDetail;
}

interface ReceiptResponse {
  data: PaymentReceipt;
}

interface CreditNoteResponse {
  data: CreditNoteDocument;
}

export async function fetchInvoiceDetail(
  invoiceId: string,
  token: string | null,
): Promise<InvoiceDetail> {
  const response = await apiClient<InvoiceDetailResponse>(
    `/api/v1/billing/invoices/${invoiceId}`,
    { token: token || undefined },
  );
  return response.data;
}

export async function fetchReceipt(
  invoiceId: string,
  receiptId: string,
  token: string | null,
): Promise<PaymentReceipt> {
  const response = await apiClient<ReceiptResponse>(
    `/api/v1/billing/invoices/${invoiceId}/receipts/${receiptId}`,
    { token: token || undefined },
  );
  return response.data;
}

export async function fetchCreditNote(
  creditNoteId: string,
  token: string | null,
): Promise<CreditNoteDocument> {
  const response = await apiClient<CreditNoteResponse>(
    `/api/v1/billing/credit-notes/${creditNoteId}`,
    { token: token || undefined },
  );
  return response.data;
}

/**
 * Downloads the clinic logo and returns it as a `data:` URI.
 *
 * This file's own header already documents the constraint — *"Logo images
 * should use base64 data URIs for iOS compatibility"* — and `expo-print`'s API
 * documentation states it outright: printing from HTML on iOS does not support
 * local or remote asset URLs, because of a `WKWebView` limitation, and inlined
 * base64 strings are the documented workaround. A remote `<img src>` therefore
 * yields a silently logo-less PDF on iOS, which nobody notices until a clinic
 * complains that their branding vanished.
 *
 * Returns `undefined` on any failure, and never throws: a clinic on a bad
 * connection must still be able to hand an owner an invoice.
 */
export async function resolveLogoBase64(
  logoUrl: string | null,
): Promise<string | undefined> {
  if (!logoUrl) return undefined;

  try {
    const target = `${FileSystem.cacheDirectory}clinic-logo-cache`;
    await FileSystem.downloadAsync(logoUrl, target);
    const base64 = await FileSystem.readAsStringAsync(target, { encoding: 'base64' });
    if (!base64) return undefined;

    return `data:${mimeTypeForUrl(logoUrl)};base64,${base64}`;
  } catch {
    return undefined;
  }
}

function mimeTypeForUrl(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes('.jpg') || lower.includes('.jpeg')) return 'image/jpeg';
  if (lower.includes('.webp')) return 'image/webp';
  return 'image/png';
}

/** BIL-04: the Rule 46 invoice document. */
export async function buildInvoiceDocument(
  invoiceId: string,
  token: string | null,
): Promise<BillingPdfDocument> {
  const invoice = await fetchInvoiceDetail(invoiceId, token);
  const logoBase64 = await resolveLogoBase64(invoice.clinic.logoUrl);

  return {
    html: buildInvoiceHtml(invoice.clinic, invoice, { logoBase64 }),
    filename: `Invoice_${invoice.invoiceNumber ?? formatDateForFilename(invoice.createdAt)}`,
  };
}

/** D-13: the payment receipt, rendered on demand from the server's record. */
export async function buildReceiptDocument(
  invoiceId: string,
  receiptId: string,
  token: string | null,
): Promise<BillingPdfDocument> {
  // The receipt endpoint returns the receipt row alone, with no clinic header,
  // so the invoice is fetched for the header and the invoice-number reference.
  const [receipt, invoice] = await Promise.all([
    fetchReceipt(invoiceId, receiptId, token),
    fetchInvoiceDetail(invoiceId, token),
  ]);
  const logoBase64 = await resolveLogoBase64(invoice.clinic.logoUrl);

  return {
    html: buildPaymentReceiptHtml(invoice.clinic, receipt, invoice, { logoBase64 }),
    filename: `Receipt_${receipt.receiptNumber}`,
  };
}

/** D-19 / D-22: the credit note, which needs its original invoice for GST gating. */
export async function buildCreditNoteDocument(
  creditNoteId: string,
  token: string | null,
): Promise<BillingPdfDocument> {
  const creditNote = await fetchCreditNote(creditNoteId, token);
  const invoice = await fetchInvoiceDetail(creditNote.invoiceId, token);
  const logoBase64 = await resolveLogoBase64(invoice.clinic.logoUrl);

  return {
    html: buildCreditNoteHtml(invoice.clinic, creditNote, invoice, { logoBase64 }),
    filename: `CreditNote_${creditNote.creditNoteNumber}`,
  };
}

/**
 * D-16 action 1 — Print.
 *
 * `Print.printAsync` hands the HTML straight to the platform print dialog,
 * which drives both a thermal roll printer and an ordinary A4 one. It writes no
 * file and opens no share sheet, which is the whole point: before this, "print"
 * anywhere in the product meant share-a-PDF-and-hope.
 */
export async function printPdf(html: string): Promise<void> {
  await Print.printAsync({ html });
}

/**
 * D-16 action 3 — Download.
 *
 * The file lands in `FileSystem.documentDirectory`, which persists across app
 * launches (unlike `cacheDirectory`, which the OS may reclaim under pressure)
 * and is app-private on both platforms.
 *
 * **Platform caveat, deliberately not papered over:** `documentDirectory` is
 * app-private. On Android it is internal app storage; on iOS it appears in the
 * Files app only when `UIFileSharingEnabled` and
 * `LSSupportsOpeningDocumentsInPlace` are set, and this app's `app.json` sets
 * neither. So "Download" today means *saved and retrievable by this app*, not
 * *visible in the system file browser*. The alternative — routing the save
 * through `Sharing.shareAsync` so the user picks "Save to Files" — was rejected
 * because it makes Download indistinguishable from Share, which is exactly the
 * conflation D-16 exists to end. Writing to shared external storage was
 * rejected outright: these documents carry owner PII (T-06-97).
 *
 * @returns the URI of the saved file, so the caller can name it in a toast.
 */
export async function savePdf(html: string, filename: string): Promise<string> {
  const { uri } = await Print.printToFileAsync({ html });

  const destinationUri = `${FileSystem.documentDirectory}${sanitisePdfFilename(filename)}`;

  // `moveAsync` fails if the destination already exists, and re-downloading the
  // same invoice is the normal case rather than the exception.
  await FileSystem.deleteAsync(destinationUri, { idempotent: true });
  await FileSystem.moveAsync({ from: uri, to: destinationUri });

  return destinationUri;
}

/**
 * The same sanitisation `generatePdf` applies inline. It is duplicated rather
 * than factored out because `generatePdf` is shipped Phase 4 code on four live
 * call sites, and this plan adds to that file rather than restructuring it.
 */
function sanitisePdfFilename(filename: string): string {
  return `${filename.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
}

interface UseGeneratePdfReturn {
  generateOwnerSummary: (consultationId: string) => Promise<void>;
  generateClinicalRecord: (consultationId: string) => Promise<void>;
  generatePrescriptionPad: (consultationId: string) => Promise<void>;
  generateVaccinationCertificate: (
    petId: string,
    vaccinationId: string,
  ) => Promise<void>;

  // ── Phase 6 billing documents (BIL-04) ──
  /** Share: builds the PDF and opens the native share sheet. */
  generateInvoice: (invoiceId: string) => Promise<void>;
  generateReceipt: (invoiceId: string, receiptId: string) => Promise<void>;
  generateCreditNote: (creditNoteId: string) => Promise<void>;
  /** Print: opens the native print dialog. No file, no share sheet. */
  printInvoice: (invoiceId: string) => Promise<void>;
  printReceipt: (invoiceId: string, receiptId: string) => Promise<void>;
  printCreditNote: (creditNoteId: string) => Promise<void>;
  /** Download: writes to the app documents directory, returns the URI. */
  saveInvoice: (invoiceId: string) => Promise<string>;
  saveReceipt: (invoiceId: string, receiptId: string) => Promise<string>;
  saveCreditNote: (creditNoteId: string) => Promise<string>;

  isGenerating: boolean;
  error: string | null;
}

export function useGeneratePdf(): UseGeneratePdfReturn {
  const { accessToken } = useAuth();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef(accessToken);
  tokenRef.current = accessToken;

  const fetchConsultationDetail = useCallback(
    async (consultationId: string): Promise<ConsultationDetailResponse['data']> => {
      const response = await apiClient<ConsultationDetailResponse>(
        `/api/v1/consultations/${consultationId}/detail`,
        { token: tokenRef.current || undefined },
      );
      return response.data;
    },
    [],
  );

  const generateOwnerSummary = useCallback(
    async (consultationId: string): Promise<void> => {
      setIsGenerating(true);
      setError(null);
      try {
        const detail = await fetchConsultationDetail(consultationId);
        const html = buildOwnerSummaryHtml(
          detail.clinic,
          detail.consultation,
          detail.prescriptions,
          detail.pet,
          detail.owner,
          {
            vetName: detail.vet.fullName,
            vetLicense: detail.vet.licenseNumber || undefined,
          },
        );
        await generatePdf(
          html,
          `${detail.pet.name}_Summary_${formatDateForFilename(detail.consultation.startedAt)}`,
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to generate summary';
        setError(message);
        throw err;
      } finally {
        setIsGenerating(false);
      }
    },
    [fetchConsultationDetail],
  );

  const generateClinicalRecord = useCallback(
    async (consultationId: string): Promise<void> => {
      setIsGenerating(true);
      setError(null);
      try {
        const detail = await fetchConsultationDetail(consultationId);
        const html = buildClinicalRecordHtml(
          detail.clinic,
          detail.consultation,
          detail.consultation.vitals,
          detail.prescriptions,
          detail.attachments,
          detail.pet,
          detail.owner,
          {
            vetName: detail.vet.fullName,
            vetLicense: detail.vet.licenseNumber || undefined,
          },
        );
        await generatePdf(
          html,
          `${detail.pet.name}_Clinical_${formatDateForFilename(detail.consultation.startedAt)}`,
        );
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Failed to generate clinical record';
        setError(message);
        throw err;
      } finally {
        setIsGenerating(false);
      }
    },
    [fetchConsultationDetail],
  );

  const generatePrescriptionPad = useCallback(
    async (consultationId: string): Promise<void> => {
      setIsGenerating(true);
      setError(null);
      try {
        const detail = await fetchConsultationDetail(consultationId);
        const html = buildPrescriptionPadHtml(
          detail.clinic,
          detail.consultation,
          detail.prescriptions,
          detail.pet,
          detail.owner,
          {
            vetName: detail.vet.fullName,
            vetLicense: detail.vet.licenseNumber || undefined,
          },
        );
        await generatePdf(
          html,
          `${detail.pet.name}_Prescription_${formatDateForFilename(detail.consultation.startedAt)}`,
        );
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Failed to generate prescription';
        setError(message);
        throw err;
      } finally {
        setIsGenerating(false);
      }
    },
    [fetchConsultationDetail],
  );

  const generateVaccinationCertificate = useCallback(
    async (petId: string, vaccinationId: string): Promise<void> => {
      setIsGenerating(true);
      setError(null);
      try {
        const response = await apiClient<CertificateResponse>(
          `/api/v1/pets/${petId}/vaccinations/${vaccinationId}/certificate`,
          { token: tokenRef.current || undefined },
        );

        const { clinic, ...certificateData } = response.data;
        const html = buildVaccinationCertificateHtml(clinic, certificateData);
        await generatePdf(
          html,
          `${certificateData.pet.name}_Vaccination_Certificate_${formatDateForFilename(certificateData.vaccination.administeredAt)}`,
        );
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Failed to generate vaccination certificate';
        setError(message);
        throw err;
      } finally {
        setIsGenerating(false);
      }
    },
    [],
  );

  // ─── Phase 6 billing documents ────────────────────────────────────────────
  //
  // The four Phase 4 generators above each spell out the same
  // `setIsGenerating` / `setError` / try / catch-rethrow / `finally` envelope
  // inline. Nine more copies of it — three documents times three actions —
  // would be nine places for the `finally` to be forgotten, so the envelope is
  // written once here. The observable contract is unchanged: `isGenerating`
  // spans the whole operation, `error` holds the API message, and the original
  // error is rethrown so a caller can branch on it.
  const withGenerationState = useCallback(
    async <T,>(fallbackMessage: string, work: () => Promise<T>): Promise<T> => {
      setIsGenerating(true);
      setError(null);
      try {
        return await work();
      } catch (err) {
        setError(err instanceof Error ? err.message : fallbackMessage);
        throw err;
      } finally {
        setIsGenerating(false);
      }
    },
    [],
  );

  const generateInvoice = useCallback(
    (invoiceId: string): Promise<void> =>
      withGenerationState('Failed to generate invoice', async () => {
        const doc = await buildInvoiceDocument(invoiceId, tokenRef.current);
        await generatePdf(doc.html, doc.filename);
      }),
    [withGenerationState],
  );

  const generateReceipt = useCallback(
    (invoiceId: string, receiptId: string): Promise<void> =>
      withGenerationState('Failed to generate receipt', async () => {
        const doc = await buildReceiptDocument(invoiceId, receiptId, tokenRef.current);
        await generatePdf(doc.html, doc.filename);
      }),
    [withGenerationState],
  );

  const generateCreditNote = useCallback(
    (creditNoteId: string): Promise<void> =>
      withGenerationState('Failed to generate credit note', async () => {
        const doc = await buildCreditNoteDocument(creditNoteId, tokenRef.current);
        await generatePdf(doc.html, doc.filename);
      }),
    [withGenerationState],
  );

  const printInvoice = useCallback(
    (invoiceId: string): Promise<void> =>
      withGenerationState('Failed to print invoice', async () => {
        const doc = await buildInvoiceDocument(invoiceId, tokenRef.current);
        await printPdf(doc.html);
      }),
    [withGenerationState],
  );

  const printReceipt = useCallback(
    (invoiceId: string, receiptId: string): Promise<void> =>
      withGenerationState('Failed to print receipt', async () => {
        const doc = await buildReceiptDocument(invoiceId, receiptId, tokenRef.current);
        await printPdf(doc.html);
      }),
    [withGenerationState],
  );

  const printCreditNote = useCallback(
    (creditNoteId: string): Promise<void> =>
      withGenerationState('Failed to print credit note', async () => {
        const doc = await buildCreditNoteDocument(creditNoteId, tokenRef.current);
        await printPdf(doc.html);
      }),
    [withGenerationState],
  );

  const saveInvoice = useCallback(
    (invoiceId: string): Promise<string> =>
      withGenerationState('Failed to save invoice', async () => {
        const doc = await buildInvoiceDocument(invoiceId, tokenRef.current);
        return savePdf(doc.html, doc.filename);
      }),
    [withGenerationState],
  );

  const saveReceipt = useCallback(
    (invoiceId: string, receiptId: string): Promise<string> =>
      withGenerationState('Failed to save receipt', async () => {
        const doc = await buildReceiptDocument(invoiceId, receiptId, tokenRef.current);
        return savePdf(doc.html, doc.filename);
      }),
    [withGenerationState],
  );

  const saveCreditNote = useCallback(
    (creditNoteId: string): Promise<string> =>
      withGenerationState('Failed to save credit note', async () => {
        const doc = await buildCreditNoteDocument(creditNoteId, tokenRef.current);
        return savePdf(doc.html, doc.filename);
      }),
    [withGenerationState],
  );

  return {
    generateOwnerSummary,
    generateClinicalRecord,
    generatePrescriptionPad,
    generateVaccinationCertificate,
    generateInvoice,
    generateReceipt,
    generateCreditNote,
    printInvoice,
    printReceipt,
    printCreditNote,
    saveInvoice,
    saveReceipt,
    saveCreditNote,
    isGenerating,
    error,
  };
}

function formatDateForFilename(date: Date): string {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
