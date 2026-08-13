// Predefined units of measure per D-05 (plus clinic-added custom units)
export const INVENTORY_UNITS = [
  { value: 'tablets', label: 'Tablets' },
  { value: 'capsules', label: 'Capsules' },
  { value: 'ml', label: 'mL' },
  { value: 'strips', label: 'Strips' },
  { value: 'bottles', label: 'Bottles' },
  { value: 'vials', label: 'Vials' },
  { value: 'sachets', label: 'Sachets' },
  { value: 'kg', label: 'kg' },
  { value: 'grams', label: 'Grams' },
  { value: 'pieces', label: 'Pieces' },
] as const;

export const UNIT_VALUES = INVENTORY_UNITS.map((u) => u.value);
export type PredefinedUnit = (typeof INVENTORY_UNITS)[number]['value'];
