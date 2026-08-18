/**
 * `ItemFormScreen`'s required-field gate (E2E-BUG-FIX-PLAN.md §5.1),
 * extracted so the Save button's disabled state is directly unit-testable
 * without mocking the whole screen's import graph — same reason
 * `stock-adjustment-logic.ts` lives here rather than inline.
 */

export interface ItemFormRequiredFields {
  name: string;
  category: string;
  unit: string;
  sellingPrice: string;
}

export function isRequiredFieldsValid(fields: ItemFormRequiredFields): boolean {
  const price = Number(fields.sellingPrice);
  return (
    fields.name.trim().length > 0 &&
    fields.category.trim().length > 0 &&
    fields.unit.trim().length > 0 &&
    fields.sellingPrice.trim().length > 0 &&
    !Number.isNaN(price) &&
    price > 0
  );
}
