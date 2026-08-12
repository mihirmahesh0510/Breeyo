// INV-09: HSN/SAC code + GST rate reference constants for GST-compliant invoicing.
// Per D-62, these are reference data for UI autocomplete only -- HSN/SAC code and
// GST rate remain fully optional on every InventoryItem regardless of category,
// with no save-time enforcement (unlike D-27's category-based expiry requirement).

// The five standard Indian GST slabs.
export const GST_RATE_SLABS = [0, 5, 12, 18, 28] as const;

export type GstRateSlab = (typeof GST_RATE_SLABS)[number];

export interface VetHsnCodeEntry {
  code: string;
  description: string;
  category: string; // matches InventoryCategory values (D-29)
  defaultGstRate: GstRateSlab;
}

// Common veterinary HSN/SAC codes for autocomplete suggestions on the item form.
// Codes reflect real Indian HSN chapters for veterinary pharmaceuticals (Chapter 30),
// surgical/diagnostic goods (Chapter 90), rubber goods (Chapter 40), and animal
// feed/pet food (Chapter 23). Rates are common-practice defaults, not tax advice --
// clinics should confirm with their accountant/GST practitioner.
export const COMMON_VET_HSN_CODES: VetHsnCodeEntry[] = [
  // Medicines
  { code: '30049099', description: 'Veterinary medicaments (other)', category: 'medicine', defaultGstRate: 12 },
  { code: '30042099', description: 'Antibiotics for veterinary use', category: 'medicine', defaultGstRate: 12 },
  { code: '30043900', description: 'Hormones/steroids for veterinary use', category: 'medicine', defaultGstRate: 12 },
  { code: '30045000', description: 'Vitamins and provitamins', category: 'medicine', defaultGstRate: 12 },

  // Vaccines
  { code: '30022090', description: 'Veterinary vaccines', category: 'vaccine', defaultGstRate: 5 },
  { code: '30021200', description: 'Antisera and blood fractions', category: 'vaccine', defaultGstRate: 5 },

  // Surgical supplies
  { code: '90189099', description: 'Surgical instruments (other)', category: 'surgical_supply', defaultGstRate: 12 },
  { code: '30059090', description: 'Bandages and dressings', category: 'surgical_supply', defaultGstRate: 12 },
  { code: '40151900', description: 'Surgical gloves', category: 'surgical_supply', defaultGstRate: 18 },

  // Lab consumables
  { code: '38220090', description: 'Diagnostic reagents', category: 'lab_consumable', defaultGstRate: 12 },
  { code: '90279090', description: 'Lab instruments (other)', category: 'lab_consumable', defaultGstRate: 18 },

  // Food and supplements
  { code: '23099090', description: 'Animal feed preparations', category: 'food_supplement', defaultGstRate: 18 },
  { code: '23091090', description: 'Pet food (retail)', category: 'food_supplement', defaultGstRate: 18 },

  // Equipment
  { code: '90189019', description: 'Veterinary equipment (other)', category: 'equipment', defaultGstRate: 12 },
];

/**
 * Returns the HSN/SAC code suggestions for a given item category, for the
 * item form's category-aware autocomplete. Returns an empty array for
 * categories with no predefined codes (e.g. 'general_supply', clinic-custom
 * categories) -- this is reference data, not a validation gate (D-62).
 */
export function getHsnSuggestions(category: string): VetHsnCodeEntry[] {
  return COMMON_VET_HSN_CODES.filter((entry) => entry.category === category);
}
