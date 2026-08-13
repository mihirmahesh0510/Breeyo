import type { ServiceCategory } from '../billing.js';

export const SERVICE_CATEGORIES: readonly ServiceCategory[] = [
  'consultation',
  'vaccination',
  'surgery',
  'diagnostic',
  'dental',
  'grooming',
  'preventive',
  'emergency',
  'other',
] as const;

/**
 * 20 preset service entries shipped with Breeyo.
 * Defined inline to avoid cross-package dependency (packages/types cannot import from apps/api).
 * Phase 6 06-01 may extend or replace this constant.
 */
export const PRESET_SERVICES: readonly { name: string; price: number }[] = [
  { name: 'General Consultation', price: 50000 },
  { name: 'Follow-Up Consultation', price: 30000 },
  { name: 'Home Visit Consultation', price: 80000 },
  { name: 'Emergency Consultation', price: 100000 },
  { name: 'Vaccination - Core', price: 60000 },
  { name: 'Vaccination - Non-Core', price: 90000 },
  { name: 'Deworming', price: 30000 },
  { name: 'Tick & Flea Treatment', price: 50000 },
  { name: 'Spay/Neuter (Small)', price: 800000 },
  { name: 'Spay/Neuter (Large)', price: 1200000 },
  { name: 'Minor Surgery', price: 500000 },
  { name: 'Major Surgery', price: 1200000 },
  { name: 'Dental Cleaning', price: 350000 },
  { name: 'Dental Extraction', price: 500000 },
  { name: 'X-Ray', price: 80000 },
  { name: 'Ultrasound', price: 150000 },
  { name: 'Lab Test - Basic (CBC)', price: 80000 },
  { name: 'Lab Test - Comprehensive', price: 250000 },
  { name: 'Grooming - Basic', price: 80000 },
  { name: 'Grooming - Full', price: 150000 },
] as const;

/**
 * Credit note reasons (D-22). The five options in the Credit Note Screen's
 * reason picker; `other` requires free-text notes to be useful.
 */
export const CREDIT_NOTE_REASONS = [
  'incorrect_charge',
  'service_not_provided',
  'product_returned',
  'price_adjustment',
  'other',
] as const;
export type CreditNoteReason = (typeof CREDIT_NOTE_REASONS)[number];

export const CREDIT_NOTE_REASON_LABELS: Readonly<Record<CreditNoteReason, string>> = {
  incorrect_charge: 'Incorrect charge',
  service_not_provided: 'Service not provided',
  product_returned: 'Product returned',
  price_adjustment: 'Price adjustment',
  other: 'Other',
} as const;

/**
 * Billing dashboard filter chips (D-24), in display order with `all` selected
 * by default.
 *
 * This is a *filter* vocabulary, not the status vocabulary: it is lowercase, it
 * has no `finalized` chip (a finalized invoice with no payment is surfaced
 * under `unpaid`), and `all` is not a status at all. Do not conflate it with
 * `INVOICE_STATUSES`.
 */
export const INVOICE_LIST_FILTERS = [
  'all',
  'draft',
  'unpaid',
  'overdue',
  'paid',
  'voided',
] as const;
export type InvoiceListFilter = (typeof INVOICE_LIST_FILTERS)[number];

/** Sort options for the billing dashboard invoice list. */
export const INVOICE_LIST_SORTS = [
  'newest',
  'oldest',
  'amount_high',
  'amount_low',
  'due_date',
] as const;
export type InvoiceListSort = (typeof INVOICE_LIST_SORTS)[number];
