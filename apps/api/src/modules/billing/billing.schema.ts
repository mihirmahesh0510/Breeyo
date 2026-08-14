import { z } from 'zod';
import { PAYMENT_METHODS } from '@breeyo/types';
import { invoiceListQuerySchema } from '@breeyo/validators';

/**
 * Path, query and small body schemas local to the billing module.
 *
 * The split follows `queue.schema.ts` and `emr.schema.ts`: the shapes the mobile
 * forms also validate against live in `@breeyo/validators` so a payload the
 * phone accepts is exactly the payload the server accepts, while path params and
 * transport-only bodies — which no client form ever builds — stay here.
 *
 * `invoiceListQuerySchema` is re-exported so every route handler has a single
 * import site for its schemas.
 */

export { invoiceListQuerySchema };

export const invoiceParamsSchema = z.object({
  invoiceId: z.string().uuid(),
});

export const petParamsSchema = z.object({
  petId: z.string().uuid(),
});

export const consultationParamsSchema = z.object({
  consultationId: z.string().uuid(),
});

/**
 * The live-totals preview for the mobile builder.
 *
 * The invoice id travels in the body rather than the path because the route is
 * `POST /billing/invoices/preview-totals` — a fixed path, so that it can never
 * be shadowed by the `/billing/invoices/:invoiceId` pattern. `InvoiceService.previewTotals`
 * computes from the PERSISTED line items of an existing draft and writes
 * nothing, so this is a read dressed as a POST, not a mutation.
 */
export const previewTotalsBodySchema = z.object({
  invoiceId: z.string().uuid(),
});

/**
 * D-10 manual payment capture.
 *
 * Deliberately not `recordPaymentSchema` from `@breeyo/validators`: that schema
 * models the full single/split discriminated union of plan 06-09's payment
 * module, and requires an explicit positive `amountPaise`. Mark-paid is the
 * narrower "staff took cash for the whole outstanding balance" control, where
 * omitting the amount means "settle the balance" and the service derives it.
 * Reusing the wider schema would force the client to compute a money figure —
 * exactly the thing D-31 and ASVS V11 keep off the wire.
 */
export const markPaidBodySchema = z.object({
  method: z.enum(PAYMENT_METHODS),
  amountPaise: z.number().int().positive().optional(),
  reference: z.string().max(100).optional(),
});

/**
 * D-13 "View Receipt". Both ids are validated: the receipt is looked up by
 * `(id, clinicId, invoiceId)` so a valid receipt id from another invoice — or
 * another clinic — cannot be read through this route.
 */
export const receiptParamsSchema = z.object({
  invoiceId: z.string().uuid(),
  receiptId: z.string().uuid(),
});

export type InvoiceParams = z.infer<typeof invoiceParamsSchema>;
export type ReceiptParams = z.infer<typeof receiptParamsSchema>;
export type PreviewTotalsBody = z.infer<typeof previewTotalsBodySchema>;
export type MarkPaidBody = z.infer<typeof markPaidBodySchema>;
