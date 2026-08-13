import type { BarcodeLookupResult } from '@breeyo/types';
import type { InventoryItemRepository } from './inventory-item.repository.js';

export class BarcodeLookupService {
  constructor(private readonly repository: InventoryItemRepository) {}

  /** Resolves a scanned/entered barcode to its item, or { found: false } (D-14). */
  async lookup(clinicId: string, code: string): Promise<BarcodeLookupResult> {
    const barcodeEntry = await this.repository.findByBarcode(clinicId, code);
    if (!barcodeEntry) {
      return { found: false };
    }
    // Prisma returns Decimal for sellingPrice/purchasePrice; @breeyo/types models
    // the wire-level shape as `number` (matches every other module — e.g.
    // patient.repository.ts/patient.service.ts return raw Prisma Owner/Pet rows
    // without coercing to the @breeyo/types interfaces either). Bridge with an
    // `unknown` cast rather than manually converting every Decimal field.
    return { found: true, item: barcodeEntry.item, barcodeEntry } as unknown as BarcodeLookupResult;
  }

  /** D-19: barcode-to-item catalog for the offline scan cache, incremental by updatedSince. */
  async getCatalog(clinicId: string, updatedSince?: Date) {
    return this.repository.getBarcodeCatalog(clinicId, updatedSince);
  }
}
