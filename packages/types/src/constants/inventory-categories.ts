// Predefined inventory categories per D-29 (7 base categories + clinic-added custom ones)
export const INVENTORY_CATEGORIES = [
  { value: 'medicine', label: 'Medicines', icon: 'pill' },
  { value: 'vaccine', label: 'Vaccines', icon: 'needle' },
  { value: 'surgical_supply', label: 'Surgical Supplies', icon: 'content-cut' },
  { value: 'lab_consumable', label: 'Lab Consumables', icon: 'test-tube' },
  { value: 'food_supplement', label: 'Food & Supplements', icon: 'food-drumstick' },
  { value: 'equipment', label: 'Equipment', icon: 'stethoscope' },
  { value: 'general_supply', label: 'General Supplies', icon: 'package-variant-closed' },
] as const;

export const CATEGORY_VALUES = INVENTORY_CATEGORIES.map((c) => c.value);
export type PredefinedCategory = (typeof INVENTORY_CATEGORIES)[number]['value'];

export function getCategoryIcon(category: string): string {
  return INVENTORY_CATEGORIES.find((c) => c.value === category)?.icon ?? 'tag';
}

export function getCategoryLabel(category: string): string {
  return INVENTORY_CATEGORIES.find((c) => c.value === category)?.label ?? category;
}
