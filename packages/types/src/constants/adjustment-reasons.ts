// Required adjustment reason presets per D-04
export const ADJUSTMENT_REASONS = [
  { value: 'damage', label: 'Damage' },
  { value: 'theft', label: 'Theft' },
  { value: 'correction', label: 'Correction' },
  { value: 'expired_disposal', label: 'Expired Disposal' },
  { value: 'stock_take', label: 'Stock-Take' },
  { value: 'other', label: 'Other' },
] as const;

export const ADJUSTMENT_REASON_VALUES = ADJUSTMENT_REASONS.map((r) => r.value);
export type AdjustmentReasonValue = (typeof ADJUSTMENT_REASONS)[number]['value'];
