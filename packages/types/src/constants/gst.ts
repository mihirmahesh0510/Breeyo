/**
 * Indian GST constants for Phase 6 billing (BIL-07, D-08/D-17 as superseded).
 *
 * Everything a tax calculation depends on that can change by government
 * notification lives in this one file, so that a Council notification is a
 * one-line edit rather than a grep across the codebase.
 *
 * **The applied rate is frozen onto each finalized invoice line.** A historical
 * invoice must never be recomputed from the constants below — slabs change, and
 * a re-derived historical invoice would silently disagree with the GSTR-1
 * already filed against it. `invoice_line_items.gst_rate_percent` is the record.
 */

/**
 * Current GST rate slabs.
 *
 * GST 2.0, announced at the 56th GST Council meeting and effective
 * **22 September 2025**, collapsed the rate structure to 5 / 18 / 40 (40 for
 * luxury and sin goods), plus nil. Most medicines, diagnostic devices and pet
 * products moved down a slab; 33 life-saving drugs went to nil.
 *
 * The 12 and 28 per-cent slabs no longer exist as general rates. They were
 * retired by that notification and **must not be reintroduced here** — the two
 * numerals appear in this file only in this sentence, and a grep gate asserts
 * they never reach the exported array. `05-08-PLAN.md` still
 * validates its GST rate picker against the pre-2.0 list (06-PATTERNS.md
 * Warning 6); this constant is the corrected source of truth, and the shipped
 * `service-catalog-seed.ts` already uses only nil and the standard slab, so no
 * seed data depends on the stale values.
 */
const GST_RATE_SLAB_TUPLE = [0, 5, 18, 40] as const;

/**
 * The narrow union of permitted slabs, derived from the same tuple as
 * {@link GST_RATE_SLABS} so the two can never drift apart.
 */
export type GstRateSlab = (typeof GST_RATE_SLAB_TUPLE)[number];

/**
 * Widened to `readonly number[]` deliberately: callers validate an arbitrary
 * incoming `number` with `GST_RATE_SLABS.includes(rate)`, which does not
 * typecheck against a narrow literal tuple. Use {@link GstRateSlab} where a
 * compile-time-known slab is wanted.
 */
export const GST_RATE_SLABS: readonly number[] = GST_RATE_SLAB_TUPLE;

/**
 * Per-line tax treatment (Finding G1 — the single most consequential research
 * finding in this phase).
 *
 * Entry 46 of Notification No. 12/2017-Central Tax (Rate) exempts "services by
 * way of veterinary clinic in relation to health care of animals or birds."
 * A consultation, vaccination or surgery line is therefore `exempt` **by law**.
 * Applying one flat rate across every line would not be a simplification, it
 * would be an incorrect tax charge on an exempt supply.
 *
 * - `exempt`     — outside the charge by notification (veterinary healthcare)
 * - `taxable`    — attracts CGST+SGST intra-state or IGST inter-state
 * - `nil_rated`  — within the charge but at a 0% rate
 */
export const TAX_TREATMENTS = ['exempt', 'taxable', 'nil_rated'] as const;
export type TaxTreatment = (typeof TAX_TREATMENTS)[number];

/**
 * Document heading, per CGST Rule 46A (Finding G4). The heading is a function
 * of the clinic's registration status and the exempt/taxable mix of the lines
 * on the invoice:
 *
 * | Clinic GST-registered? | Invoice contains  | Document type                |
 * |------------------------|-------------------|------------------------------|
 * | No                     | anything          | `invoice`                    |
 * | Yes                    | only exempt lines | `bill_of_supply`             |
 * | Yes                    | only taxable      | `tax_invoice`                |
 * | Yes                    | mixed             | `invoice_cum_bill_of_supply` |
 *
 * A typical vet invoice — exempt consultation plus taxable dispensed medicine —
 * is exactly the Rule 46A mixed case, which is why the combined document type
 * exists (inserted by Notification 45/2017-CT, proviso added by 26/2022-CT).
 */
export const INVOICE_DOCUMENT_TYPES = [
  'invoice',
  'tax_invoice',
  'bill_of_supply',
  'invoice_cum_bill_of_supply',
] as const;
export type InvoiceDocumentType = (typeof INVOICE_DOCUMENT_TYPES)[number];

/**
 * SAC for pet veterinary services under heading 9983 — rate nil / exempt per
 * Notification No. 12/2017-Central Tax (Rate) Entry 46.
 */
export const VETERINARY_SAC = '998351';

/**
 * SAC strings already written into per-clinic `service_catalog` rows by
 * `apps/api/src/modules/billing/service-catalog-seed.ts`.
 *
 * These are recorded rather than corrected. The *rates* the seed applies are
 * already right (nil for clinical services, standard for grooming), so no
 * invoice produced today is mis-taxed; only the SAC strings differ from
 * Finding G1's recommendation. Changing the seed would leave every
 * already-onboarded clinic on the old codes unless a data migration ran against
 * their customised catalog rows, so the migration is a deliberate separate
 * decision (06-PATTERNS.md Warning 7) and is not made in this plan.
 */
export const VETERINARY_SAC_LEGACY: readonly string[] = [
  '999311',
  '999312',
  '999313',
  '999399',
  '998612',
] as const;

/**
 * GSTIN format: 2-digit state code, 5-letter PAN prefix, 4-digit PAN number,
 * 1-letter PAN entity char, 1 alphanumeric entity number, a literal `Z`, then a
 * 1-character checksum. Fifteen characters, uppercase only.
 *
 * Example of a well-formed GSTIN: `27AAPFU0939F1ZV`.
 */
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

/**
 * The GST state code is the first two characters of the GSTIN, and it drives
 * the intra-state (CGST+SGST) versus inter-state (IGST) split.
 *
 * Returns `null` rather than a prefix when the GSTIN is malformed: slicing a
 * garbage string would yield a plausible-looking two-digit code and silently
 * mis-classify the place of supply.
 */
export function stateCodeFromGstin(gstin: string): string | null {
  return GSTIN_REGEX.test(gstin) ? gstin.slice(0, 2) : null;
}

/**
 * CGST Rule 46(b): the document number is a consecutive serial number, unique
 * for the financial year, of at most sixteen characters. D-15's
 * `INV-YYYYMM-XXXX` is fifteen.
 */
export const MAX_DOCUMENT_NUMBER_LENGTH = 16;

/**
 * Finding G5: for a B2C supply above ₹50,000 to an unregistered recipient, the
 * recipient's name, address and state of delivery become mandatory on the
 * document. Expressed in paise, matching every other money value in Phase 6.
 * Vet invoices rarely cross it; surgery invoices can.
 */
export const B2C_ADDRESS_REQUIRED_ABOVE_PAISE = 5_000_000;

/**
 * Finding G6 / Section 170 + Rule 51: tax is rounded to the nearest rupee per
 * tax head, at invoice level — never per line, which accumulates error and will
 * not reconcile with GSTR-1. The persisted round-off delta keeps
 * `taxable + taxes + roundOff = grandTotal` exact.
 */
export const PAISE_PER_RUPEE = 100;
