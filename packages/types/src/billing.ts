export type ServiceCategory =
  | 'consultation'
  | 'vaccination'
  | 'surgery'
  | 'diagnostic'
  | 'dental'
  | 'grooming'
  | 'preventive'
  | 'emergency'
  | 'other';

export interface ServiceCatalog {
  id: string;
  clinicId: string;
  name: string;
  category: ServiceCategory;
  price: number; // paise
  sacCode: string | null;
  hsnCode: string | null;
  gstRateOverride: number | null; // percentage
  isActive: boolean;
  isPreset: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}
