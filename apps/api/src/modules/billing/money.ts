/**
 * Integer-paise money arithmetic for Phase 6 billing.
 *
 * Every money value inside billing is an integer number of paise. There are no
 * floats on any path that produces a persisted amount: a float cannot represent
 * `0.07` exactly, so `0.07 * 100` is `7.000000000000001`, and a chain of those
 * errors is the difference between an invoice that reconciles and one that does
 * not.
 *
 * This module is pure: it holds no connection, performs no I/O, and every
 * function is a deterministic mapping from its arguments to its result. The only
 * module-level state is the cached currency formatter, which is immutable.
 */

import type { Prisma } from '@prisma/client';
import { PAISE_PER_RUPEE } from '@breeyo/types';

/**
 * A well-formed rupee amount: non-negative, at most two decimal places, no
 * thousands separators, no exponent notation.
 *
 * A third decimal place is rejected rather than rounded. Silently absorbing a
 * sub-paise fraction is how an amount that cannot be collected, printed or
 * remitted enters a financial record.
 */
const RUPEE_PATTERN = /^\d+(\.\d{1,2})?$/;

/**
 * Converts a rupee amount to integer paise — the single money boundary of
 * Phase 6 (D-31).
 *
 * Phase 6's own tables store paise (matching the already-shipped
 * `ServiceCatalog.price Int`). Phase 5's columns store rupees as
 * `Decimal(10,2)` and are deliberately NOT migrated:
 *
 *   * `InventoryItem.sellingPrice` — the price a product line enters an invoice at
 *   * `StockMovement.unitPrice`    — the price a dispensed batch was moved at
 *
 * Those two columns are the only inputs this function exists for, and the
 * invoice line-item builder is the only place it is called. Converting at one
 * boundary rather than ad hoc at each call site is what makes the 100x
 * conversion error testable in a single place instead of unfalsifiable.
 *
 * The conversion is exact integer arithmetic on the decimal string: the value is
 * split on the decimal point and the two halves are combined as integers, so the
 * float multiply that introduces drift never happens.
 *
 * @throws if the amount is negative, non-finite, non-numeric, or carries more
 *   than two decimal places.
 */
export function toPaise(rupees: Prisma.Decimal | string | number): number {
  // `String()` is correct for all three input types: `Decimal.toString()` emits
  // the exact decimal representation, never an approximation.
  const raw = String(rupees);

  if (!RUPEE_PATTERN.test(raw)) {
    throw new Error(`Invalid rupee amount: ${raw}`);
  }

  const [whole, frac = ''] = raw.split('.');
  const paise = Number(whole) * PAISE_PER_RUPEE + Number(frac.padEnd(2, '0'));

  if (!Number.isSafeInteger(paise)) {
    throw new Error(`Invalid rupee amount: ${raw} (exceeds exact integer range)`);
  }

  return paise;
}

/**
 * Renders integer paise as a bare decimal rupee string with exactly two decimal
 * places — the inverse of {@link toPaise}, and the form written into a PDF cell
 * or handed to a payment gateway that wants rupees.
 *
 * The sign is applied to the whole string rather than derived from the integer
 * part, so a delta between -1 and -99 paise renders as `-0.50` and not `0.50`.
 * Round-off deltas (Section 170 / Rule 51) and refund amounts are routinely
 * negative and sub-rupee.
 */
export function fromPaise(paise: number): string {
  if (!Number.isInteger(paise)) {
    throw new Error(`Invalid paise amount: ${paise} (must be a whole number of paise)`);
  }

  const sign = paise < 0 ? '-' : '';
  const magnitude = Math.abs(paise);
  const whole = Math.trunc(magnitude / PAISE_PER_RUPEE);
  const frac = String(magnitude % PAISE_PER_RUPEE).padStart(2, '0');

  return `${sign}${whole}.${frac}`;
}

/**
 * Cached at module scope deliberately. Constructing an `Intl.NumberFormat` is
 * the expensive part of formatting, and the billing dashboard formats one amount
 * per invoice row. The instance is immutable and therefore safe to share.
 */
const INR_FORMATTER = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formats integer paise for display: `123435` becomes `₹1,234.35`, with Indian
 * lakh/crore grouping rather than thousands grouping.
 *
 * This is the one function in the module that divides by
 * {@link PAISE_PER_RUPEE} into a float, and it is safe precisely because the
 * result is display-only: it is a string handed to a UI or a PDF template and it
 * never re-enters a calculation. No persisted amount is ever derived from it.
 */
export function formatPaiseINR(paise: number): string {
  return INR_FORMATTER.format(paise / PAISE_PER_RUPEE);
}

/**
 * Distributes an integer total across integer weights with no loss: the returned
 * array always sums to exactly `totalToAllocate`.
 *
 * This is the D-07 invoice-discount allocator. Under GST Section 15(3)(a) a
 * discount known at the time of supply reduces the taxable value, so an
 * invoice-level discount has to be pushed down onto the lines *before* tax is
 * computed. If the split lost a paise, `Σ line.taxableValue` would no longer
 * equal `invoice.taxableValue` and the invoice would not reconcile with GSTR-1.
 *
 * The remainder from the integer division is assigned to the largest weight,
 * with ties broken toward the lowest index, so the function is deterministic:
 * the same input always produces the same output, which matters because the
 * result is persisted per line and must be reproducible during an audit.
 *
 * A negative total is allocated exactly the same way, which is what makes the
 * function reusable for split-payment refund math (D-42): truncation toward zero
 * keeps the per-element magnitudes below the exact share for negative totals
 * too, so no element is ever over-allocated before the remainder closes the sum.
 */
export function allocateProRata(
  totalToAllocate: number,
  weights: readonly number[],
): number[] {
  if (!Number.isInteger(totalToAllocate)) {
    throw new Error(
      `allocateProRata requires an integer total, received: ${totalToAllocate}`,
    );
  }

  if (weights.length === 0) {
    return [];
  }

  for (const weight of weights) {
    if (!Number.isInteger(weight) || weight < 0) {
      throw new Error(
        `allocateProRata requires non-negative integer weights, received: ${weight}`,
      );
    }
  }

  const sumWeights = weights.reduce((acc, weight) => acc + weight, 0);

  // Nothing to weight by (e.g. every line is free). The total still has to land
  // somewhere for the sum to be exact, so it goes to the first element.
  if (sumWeights === 0) {
    return weights.map((_, index) => (index === 0 ? totalToAllocate : 0));
  }

  const allocated = weights.map((weight) => {
    const product = totalToAllocate * weight;
    if (!Number.isSafeInteger(product)) {
      throw new Error(
        `allocateProRata cannot allocate ${totalToAllocate} across weight ${weight}: the intermediate product is outside the exact integer range and loses precision`,
      );
    }
    // Truncation toward zero, not `Math.floor`: for a negative total `floor`
    // would round away from zero and over-allocate every element.
    return Math.trunc(product / sumWeights);
  });

  const remainder =
    totalToAllocate - allocated.reduce((acc, part) => acc + part, 0);

  if (remainder !== 0) {
    let largestIndex = 0;
    for (let index = 1; index < weights.length; index += 1) {
      // Strictly greater, so a tie keeps the earlier index.
      if (weights[index] > weights[largestIndex]) {
        largestIndex = index;
      }
    }
    allocated[largestIndex] += remainder;
  }

  return allocated;
}
