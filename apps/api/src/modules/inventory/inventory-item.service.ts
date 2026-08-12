import { createItemSchema, updateItemSchema, barcodeEntrySchema } from '@breeyo/validators';
import type { InventoryItemRepository, ListItemsFilters } from './inventory-item.repository.js';

function notFoundError(message: string, code: string): Error & { statusCode: number; code: string } {
  const error = new Error(message) as Error & { statusCode: number; code: string };
  error.statusCode = 404;
  error.code = code;
  return error;
}

export class InventoryItemService {
  constructor(private readonly repository: InventoryItemRepository) {}

  /**
   * INV-01: creates an inventory item. currentStock/isActive defaults are set
   * by the repository. Category/unit custom-value persistence is D-61,
   * handled inside repository.create().
   */
  async createItem(clinicId: string, _userId: string, input: unknown) {
    const parsed = createItemSchema.parse(input);
    // INV-09: normalize omitted hsnSacCode/gstRate to null (D-62 -- both are fully
    // optional on every item) so the repository always receives an explicit value.
    return this.repository.create(clinicId, {
      ...parsed,
      hsnSacCode: parsed.hsnSacCode ?? null,
      gstRate: parsed.gstRate ?? null,
    });
  }

  /**
   * Partial update of item fields. 404s if the item doesn't belong to this clinic.
   */
  async updateItem(clinicId: string, itemId: string, input: unknown) {
    const parsed = updateItemSchema.parse(input);
    const updated = await this.repository.update(clinicId, itemId, parsed);
    if (!updated) throw notFoundError('Inventory item not found', 'ITEM_NOT_FOUND');
    return updated;
  }

  async getItem(clinicId: string, itemId: string) {
    const item = await this.repository.findById(clinicId, itemId);
    if (!item) throw notFoundError('Inventory item not found', 'ITEM_NOT_FOUND');
    return item;
  }

  async listItems(clinicId: string, filters: ListItemsFilters) {
    return this.repository.list(clinicId, filters);
  }

  async getSummary(clinicId: string) {
    return this.repository.getSummary(clinicId);
  }

  /** D-61: predefined categories merged with this clinic's custom entries. */
  async getCategories(clinicId: string) {
    return this.repository.listCategories(clinicId);
  }

  /** D-61: predefined units merged with this clinic's custom entries. */
  async getUnits(clinicId: string) {
    return this.repository.listUnits(clinicId);
  }

  /** D-63: passes the repository's success/conflict shape through unchanged. */
  async addBarcode(clinicId: string, itemId: string, input: unknown) {
    const parsed = barcodeEntrySchema.parse(input);
    return this.repository.addBarcode(clinicId, itemId, parsed.code, parsed.format);
  }

  async removeBarcode(clinicId: string, barcodeId: string) {
    return this.repository.removeBarcode(clinicId, barcodeId);
  }

  /** D-64: presigned S3 PUT URL for an item photo. */
  async getPhotoUploadUrl(clinicId: string, itemId: string) {
    const result = await this.repository.generatePhotoUploadUrl(clinicId, itemId);
    if (!result) throw notFoundError('Inventory item not found', 'ITEM_NOT_FOUND');
    return result;
  }
}
