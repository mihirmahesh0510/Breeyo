import type { ServiceCategory } from '../billing.js';

export const SERVICE_CATEGORIES: readonly ServiceCategory[] = [
  'consultation',
  'vaccination',
  'surgery',
  'diagnostic',
  'dental',
  'grooming',
  'preventive',
  'emergency',
  'other',
] as const;

/**
 * 20 preset service entries shipped with Breeyo.
 * Defined inline to avoid cross-package dependency (packages/types cannot import from apps/api).
 * Phase 6 06-01 may extend or replace this constant.
 */
export const PRESET_SERVICES: readonly { name: string; price: number }[] = [
  { name: 'General Consultation', price: 50000 },
  { name: 'Follow-Up Consultation', price: 30000 },
  { name: 'Home Visit Consultation', price: 80000 },
  { name: 'Emergency Consultation', price: 100000 },
  { name: 'Vaccination - Core', price: 60000 },
  { name: 'Vaccination - Non-Core', price: 90000 },
  { name: 'Deworming', price: 30000 },
  { name: 'Tick & Flea Treatment', price: 50000 },
  { name: 'Spay/Neuter (Small)', price: 800000 },
  { name: 'Spay/Neuter (Large)', price: 1200000 },
  { name: 'Minor Surgery', price: 500000 },
  { name: 'Major Surgery', price: 1200000 },
  { name: 'Dental Cleaning', price: 350000 },
  { name: 'Dental Extraction', price: 500000 },
  { name: 'X-Ray', price: 80000 },
  { name: 'Ultrasound', price: 150000 },
  { name: 'Lab Test - Basic (CBC)', price: 80000 },
  { name: 'Lab Test - Comprehensive', price: 250000 },
  { name: 'Grooming - Basic', price: 80000 },
  { name: 'Grooming - Full', price: 150000 },
] as const;
