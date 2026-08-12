// Item categories per D-29 (7 predefined + clinic-added custom values)
export type InventoryCategory = 'medicine' | 'vaccine' | 'surgical_supply' | 'lab_consumable' | 'food_supplement' | 'equipment' | 'general_supply' | string;

// Stock level status per UI-SPEC color map
export type StockLevelStatus = 'healthy' | 'warning' | 'critical' | 'no_par_level';

// Movement types per D-45
export type MovementType = 'received' | 'dispensed' | 'adjusted' | 'disposed' | 'stock_take' | 'returned';

// Adjustment reasons per D-04
export type AdjustmentReason = 'damage' | 'theft' | 'correction' | 'expired_disposal' | 'stock_take' | 'other';

// Barcode formats per D-15
export type BarcodeFormat = 'ean13' | 'ean8' | 'upc_a' | 'code128' | 'code39';

// Categories requiring expiry date per D-27
export const EXPIRY_REQUIRED_CATEGORIES: InventoryCategory[] = ['medicine', 'vaccine', 'lab_consumable'];

export interface InventoryItem {
  id: string;
  clinicId: string;
  name: string;
  category: InventoryCategory;
  unit: string;
  sellingPrice: number; // Decimal(10,2) as number
  parLevel: number | null; // null = no alert (D-06)
  scheduleH: boolean; // D-10
  notes: string | null; // D-12
  photoUrl: string | null; // D-34
  isActive: boolean; // D-08 persistent catalog
  currentStock: number; // Denormalized total from batches
  createdAt: Date;
  updatedAt: Date;
  barcodes: InventoryBarcode[];
}

export interface InventoryBarcode {
  id: string;
  code: string;
  format: BarcodeFormat;
  itemId: string;
  clinicId: string;
}

export interface StockBatch {
  id: string;
  itemId: string;
  clinicId: string;
  lotNumber: string | null;
  expiryDate: Date | null;
  purchasePrice: number | null; // Decimal(10,2)
  supplier: string | null; // D-02 free-text
  initialQty: number;
  currentQty: number;
  receivedAt: Date;
  isExpired: boolean;
}

export interface StockMovement {
  id: string;
  clinicId: string;
  itemId: string;
  batchId: string | null;
  type: MovementType;
  quantity: number; // positive=add, negative=deduct
  reason: string | null; // required for 'adjusted'
  runningTotal: number;
  userId: string;
  userName: string;
  consultationId: string | null;
  invoiceId: string | null;
  ownerId: string | null; // D-60: counter-sale owner attribution (dispensed movements only)
  unitPrice: number | null; // D-60: item.sellingPrice snapshot at dispense time, for later invoice construction
  notes: string | null;
  createdAt: Date;
}

// Input types
export interface CreateItemInput {
  name: string;
  category: InventoryCategory;
  unit: string;
  sellingPrice: number;
  parLevel?: number | null;
  scheduleH?: boolean;
  notes?: string | null;
  photoUrl?: string | null;
  barcodes?: Array<{ code: string; format: BarcodeFormat }>;
}

export interface UpdateItemInput {
  name?: string;
  category?: InventoryCategory;
  unit?: string;
  sellingPrice?: number;
  parLevel?: number | null;
  scheduleH?: boolean;
  notes?: string | null;
  photoUrl?: string | null;
}

export interface StockReceiptInput {
  quantity: number;
  lotNumber?: string | null;
  expiryDate?: string | null; // ISO date string
  purchasePrice?: number | null;
  supplier?: string | null;
}

export interface DispenseInput {
  quantity: number;
  overrideBatchId?: string; // D-22 manual override
  consultationId?: string | null;
  invoiceId?: string | null;
  ownerId?: string | null; // D-60: optional owner attribution for counter sales (no consultationId)
}

export interface StockAdjustmentInput {
  quantity: number;
  type: 'add' | 'remove';
  reason: AdjustmentReason;
  notes?: string | null;
}

export interface StockTakeEntry {
  itemId: string;
  actualCount: number;
}

export interface StockTakeInput {
  entries: StockTakeEntry[];
}

export interface StockTakeResult {
  itemId: string;
  itemName: string;
  systemQty: number;
  actualQty: number;
  difference: number;
  valueDifference: number;
}

export interface StockTakeSummary {
  itemsCounted: number;
  matches: number;
  discrepancies: number;
  overCount: number;
  underCount: number;
  totalValueDifference: number;
  results: StockTakeResult[];
}

// Query result types
export interface LowStockItem {
  id: string;
  name: string;
  category: InventoryCategory;
  unit: string;
  sellingPrice: number;
  parLevel: number;
  currentStock: number;
}

export interface ExpiringBatchItem {
  batchId: string;
  itemId: string;
  itemName: string;
  lotNumber: string | null;
  expiryDate: Date;
  currentQty: number;
  unit: string;
}

export interface WantListItem extends LowStockItem {
  deficit: number; // parLevel - currentStock
}

export interface BatchDeduction {
  batchId: string;
  lotNumber: string | null;
  quantity: number;
}

export interface DispenseResult {
  deductions: BatchDeduction[];
  newTotal: number;
  movementIds: string[];
}

export interface BarcodeLookupResult {
  found: boolean;
  item?: InventoryItem;
  barcodeEntry?: InventoryBarcode;
}

// D-63: structured conflict when adding a barcode already linked to a different item
export interface BarcodeConflict {
  itemId: string;
  itemName: string;
}

export type AddBarcodeResult =
  | { success: true; barcode: InventoryBarcode }
  | { success: false; conflict: BarcodeConflict };

// D-61: reusable clinic-level custom categories/units (predefined lists live in constants;
// these are the additional entries a clinic has typed in themselves)
export interface ClinicInventoryCategory {
  id: string;
  clinicId: string;
  value: string; // slug used as InventoryItem.category value
  label: string; // display label as originally typed
  createdAt: Date;
}

export interface ClinicInventoryUnit {
  id: string;
  clinicId: string;
  value: string;
  label: string;
  createdAt: Date;
}

// Inventory summary for dashboard header (D-32)
export interface InventorySummary {
  totalItems: number;
  lowStockCount: number;
  expiringCount: number;
  totalValue: number;
}

// Stock level helper per UI-SPEC color map
export function getStockLevelStatus(currentStock: number, parLevel: number | null): StockLevelStatus {
  if (parLevel === null) return 'no_par_level';
  if (currentStock === 0 || currentStock < parLevel * 0.25) return 'critical';
  if (currentStock < parLevel * 0.75) return 'warning';
  return 'healthy';
}
