// INV-09: HSN/SAC code + GST rate reference constants for GST-compliant invoicing.
// Per D-62, these are reference data for UI autocomplete only -- HSN/SAC code and
// GST rate remain fully optional on every InventoryItem regardless of category,
// with no save-time enforcement (unlike D-27's category-based expiry requirement).

// The slab list and the GstRateSlab union used to be declared here, encoding the
// pre-GST-2.0 rates. They now live in `./gst.js`, which is the single source of
// truth for anything a Council notification can change (06-PATTERNS.md Warning 6).
import type { GstRateSlab } from './gst.js';

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
//
// Rates updated for GST 2.0 (effective 2025-09-22): medicines, medical devices
// and diagnostic reagents moved from the retired 12 per-cent slab down to 5.
// These are autocomplete suggestions only (D-62) -- no persisted InventoryItem
// row is changed by editing this list.
export const COMMON_VET_HSN_CODES: VetHsnCodeEntry[] = [
  // Medicines
  { code: '30049099', description: 'Veterinary medicaments (other)', category: 'medicine', defaultGstRate: 5 },
  { code: '30042099', description: 'Antibiotics for veterinary use', category: 'medicine', defaultGstRate: 5 },
  { code: '30043900', description: 'Hormones/steroids for veterinary use', category: 'medicine', defaultGstRate: 5 },
  { code: '30045000', description: 'Vitamins and provitamins', category: 'medicine', defaultGstRate: 5 },

  // Vaccines
  { code: '30022090', description: 'Veterinary vaccines', category: 'vaccine', defaultGstRate: 5 },
  { code: '30021200', description: 'Antisera and blood fractions', category: 'vaccine', defaultGstRate: 5 },

  // Surgical supplies
  { code: '90189099', description: 'Surgical instruments (other)', category: 'surgical_supply', defaultGstRate: 5 },
  { code: '30059090', description: 'Bandages and dressings', category: 'surgical_supply', defaultGstRate: 5 },
  { code: '40151900', description: 'Surgical gloves', category: 'surgical_supply', defaultGstRate: 18 },

  // Lab consumables
  { code: '38220090', description: 'Diagnostic reagents', category: 'lab_consumable', defaultGstRate: 5 },
  { code: '90279090', description: 'Lab instruments (other)', category: 'lab_consumable', defaultGstRate: 18 },

  // Food and supplements
  { code: '23099090', description: 'Animal feed preparations', category: 'food_supplement', defaultGstRate: 18 },
  { code: '23091090', description: 'Pet food (retail)', category: 'food_supplement', defaultGstRate: 18 },

  // Equipment
  { code: '90189019', description: 'Veterinary equipment (other)', category: 'equipment', defaultGstRate: 5 },
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
