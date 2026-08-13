import type {
  InventoryItem,
  StockBatch,
  StockMovement,
  InventoryBarcode,
  ClinicInventoryCategory,
  ClinicInventoryUnit,
} from '@breeyo/types';

// ─── Entity Fixtures ─────────────────────────────────────────────────

export const mockClinic = {
  id: 'clinic_inv_1',
  name: 'Test Vet Clinic',
};

export const mockUser = {
  id: 'user_inv_1',
  name: 'Dr. Test',
  role: 'admin',
  clinicId: 'clinic_inv_1',
};

export const mockInventoryManager = {
  id: 'user_inv_2',
  name: 'Stock Manager',
  role: 'inventory_manager',
  clinicId: 'clinic_inv_1',
};

export const mockItem: InventoryItem = {
  id: 'item_1',
  clinicId: 'clinic_inv_1',
  name: 'Amoxicillin 250mg Tab',
  category: 'medicine',
  unit: 'tablets',
  sellingPrice: 5.5,
  parLevel: 50,
  scheduleH: false,
  notes: null,
  photoUrl: null,
  isActive: true,
  currentStock: 100,
  hsnSacCode: '30049099',
  gstRate: 12,
  createdAt: new Date('2026-01-15'),
  updatedAt: new Date('2026-01-15'),
  barcodes: [],
};

// INV-09: item without HSN/SAC code or GST rate set -- both remain fully optional per D-62
export const mockItemNoHsn: InventoryItem = {
  id: 'item_no_hsn',
  clinicId: 'clinic_inv_1',
  name: 'Cotton Rolls',
  category: 'general_supply',
  unit: 'pieces',
  sellingPrice: 15,
  parLevel: null,
  scheduleH: false,
  notes: null,
  photoUrl: null,
  isActive: true,
  currentStock: 30,
  hsnSacCode: null,
  gstRate: null,
  createdAt: new Date('2026-01-15'),
  updatedAt: new Date('2026-01-15'),
  barcodes: [],
};

export const mockItemVaccine: InventoryItem = {
  id: 'item_2',
  clinicId: 'clinic_inv_1',
  name: 'Anti-Rabies Vaccine',
  category: 'vaccine',
  unit: 'vials',
  sellingPrice: 250,
  parLevel: 10,
  scheduleH: false,
  notes: null,
  photoUrl: null,
  isActive: true,
  currentStock: 8,
  hsnSacCode: '30022090',
  gstRate: 5,
  createdAt: new Date('2026-01-15'),
  updatedAt: new Date('2026-01-15'),
  barcodes: [],
};

export const mockItemEquipment: InventoryItem = {
  id: 'item_3',
  clinicId: 'clinic_inv_1',
  name: 'Stethoscope',
  category: 'equipment',
  unit: 'pieces',
  sellingPrice: 1500,
  parLevel: null,
  scheduleH: false,
  notes: null,
  photoUrl: null,
  isActive: true,
  currentStock: 2,
  hsnSacCode: null,
  gstRate: null,
  createdAt: new Date('2026-01-15'),
  updatedAt: new Date('2026-01-15'),
  barcodes: [],
};

export const mockBatch1: StockBatch = {
  id: 'batch_1',
  itemId: 'item_1',
  clinicId: 'clinic_inv_1',
  lotNumber: 'LOT-2026-A',
  expiryDate: new Date('2027-06-15'),
  purchasePrice: 3.25,
  supplier: 'ABC Pharma',
  initialQty: 100,
  currentQty: 60,
  receivedAt: new Date('2026-01-15'),
  isExpired: false,
};

export const mockBatch2: StockBatch = {
  id: 'batch_2',
  itemId: 'item_1',
  clinicId: 'clinic_inv_1',
  lotNumber: 'LOT-2026-B',
  expiryDate: new Date('2027-12-31'),
  purchasePrice: 3.5,
  supplier: 'XYZ Pharma',
  initialQty: 50,
  currentQty: 40,
  receivedAt: new Date('2026-03-01'),
  isExpired: false,
};

export const mockExpiredBatch: StockBatch = {
  id: 'batch_expired',
  itemId: 'item_1',
  clinicId: 'clinic_inv_1',
  lotNumber: 'LOT-2025-OLD',
  expiryDate: new Date('2026-01-01'),
  purchasePrice: 3.0,
  supplier: null,
  initialQty: 20,
  currentQty: 5,
  receivedAt: new Date('2025-06-01'),
  isExpired: true,
};

export const mockBarcode: InventoryBarcode = {
  id: 'barcode_1',
  code: '8901234567890',
  format: 'ean13',
  itemId: 'item_1',
  clinicId: 'clinic_inv_1',
};

export const mockMovement: StockMovement = {
  id: 'mov_1',
  clinicId: 'clinic_inv_1',
  itemId: 'item_1',
  batchId: 'batch_1',
  type: 'received',
  quantity: 100,
  reason: null,
  runningTotal: 100,
  userId: 'user_inv_1',
  userName: 'Dr. Test',
  consultationId: null,
  invoiceId: null,
  ownerId: null,
  unitPrice: null,
  notes: null,
  createdAt: new Date('2026-01-15'),
};

// D-60: counter sale fixture — dispensed without a consultation, attributed to an owner
export const mockCounterSaleMovement: StockMovement = {
  id: 'mov_2',
  clinicId: 'clinic_inv_1',
  itemId: 'item_1',
  batchId: 'batch_1',
  type: 'dispensed',
  quantity: -2,
  reason: null,
  runningTotal: 98,
  userId: 'user_inv_1',
  userName: 'Dr. Test',
  consultationId: null,
  invoiceId: null,
  ownerId: 'owner_inv_1',
  unitPrice: 5.5,
  notes: null,
  createdAt: new Date('2026-01-16'),
};

// D-61: reusable clinic-level custom category/unit fixtures
export const mockClinicCategory: ClinicInventoryCategory = {
  id: 'cat_custom_1',
  clinicId: 'clinic_inv_1',
  value: 'dewormer',
  label: 'Dewormer',
  createdAt: new Date('2026-01-10'),
};

export const mockClinicUnit: ClinicInventoryUnit = {
  id: 'unit_custom_1',
  clinicId: 'clinic_inv_1',
  value: 'boxes',
  label: 'Boxes',
  createdAt: new Date('2026-01-10'),
};
