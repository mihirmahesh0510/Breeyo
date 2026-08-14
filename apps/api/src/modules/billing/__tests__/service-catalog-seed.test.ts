import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  VETERINARY_SAC,
  VETERINARY_SAC_LEGACY_CORRECTABLE,
} from '@breeyo/types';
import {
  SERVICE_CATALOG_SEED_DATA,
  seedServiceCatalog,
} from '../service-catalog-seed.js';

const VALID_CATEGORIES = [
  'consultation', 'vaccination', 'surgery', 'diagnostic',
  'dental', 'grooming', 'preventive', 'emergency', 'other',
];

const CLINICAL_CATEGORIES = [
  'consultation', 'vaccination', 'surgery', 'diagnostic',
  'dental', 'preventive', 'emergency',
];

describe('Service Catalog Seed Data', () => {
  it('should have exactly 20 preset services', () => {
    expect(SERVICE_CATALOG_SEED_DATA).toHaveLength(20);
  });

  it('should contain sentinel entries', () => {
    const names = SERVICE_CATALOG_SEED_DATA.map((s) => s.name);
    expect(names).toContain('General Consultation');
    expect(names).toContain('Vaccination - Core');
    expect(names).toContain('Spay/Neuter (Small)');
    expect(names).toContain('X-Ray');
    expect(names).toContain('Grooming - Basic');
    expect(names).toContain('Grooming - Full');
  });

  it('should have all prices in paise (positive integers)', () => {
    for (const entry of SERVICE_CATALOG_SEED_DATA) {
      expect(Number.isInteger(entry.defaultPricePaise)).toBe(true);
      expect(entry.defaultPricePaise).toBeGreaterThan(0);
    }
  });

  it('should have valid categories', () => {
    for (const entry of SERVICE_CATALOG_SEED_DATA) {
      expect(VALID_CATEGORIES).toContain(entry.category);
    }
  });

  it('should have SAC codes for all clinical services', () => {
    const clinical = SERVICE_CATALOG_SEED_DATA.filter(
      (s) => CLINICAL_CATEGORIES.includes(s.category),
    );
    for (const entry of clinical) {
      expect(entry.sacCode).toBeTruthy();
      expect(entry.sacCode).toMatch(/^99\d{4}$/);
    }
  });

  it('should have gstRateOverride=0 for exempt clinical services', () => {
    const clinical = SERVICE_CATALOG_SEED_DATA.filter(
      (s) => CLINICAL_CATEGORIES.includes(s.category),
    );
    for (const entry of clinical) {
      expect(entry.gstRateOverride).toBe(0);
    }
  });

  it('should have gstRateOverride=18 for grooming services', () => {
    const grooming = SERVICE_CATALOG_SEED_DATA.filter(
      (s) => s.category === 'grooming',
    );
    expect(grooming.length).toBeGreaterThan(0);
    for (const entry of grooming) {
      expect(entry.gstRateOverride).toBe(18);
    }
  });

  /**
   * A1, resolved 2026-08-14. A newly-seeded clinic must ship the Notification
   * 12/2017-Central Tax (Rate) Entry 46 code for veterinary services. The
   * `9993xx` family the seed originally carried is preserved as
   * `VETERINARY_SAC_LEGACY_CORRECTABLE` only so already-seeded clinics can be
   * offered an opt-in correction; it must never be written into a new clinic.
   */
  it('should give every clinical preset the Entry 46 SAC, not a legacy 9993xx code', () => {
    const clinical = SERVICE_CATALOG_SEED_DATA.filter(
      (s) => CLINICAL_CATEGORIES.includes(s.category),
    );
    expect(clinical.length).toBeGreaterThan(0);
    for (const entry of clinical) {
      expect(entry.sacCode).toBe(VETERINARY_SAC);
    }
  });

  it('should ship no legacy SAC code anywhere in the preset list', () => {
    for (const entry of SERVICE_CATALOG_SEED_DATA) {
      expect(VETERINARY_SAC_LEGACY_CORRECTABLE).not.toContain(entry.sacCode);
    }
  });

  it('should have grooming services with SAC code 998612', () => {
    const grooming = SERVICE_CATALOG_SEED_DATA.filter(
      (s) => s.category === 'grooming',
    );
    for (const entry of grooming) {
      expect(entry.sacCode).toBe('998612');
    }
  });

  it('should have unique sort orders', () => {
    const sortOrders = SERVICE_CATALOG_SEED_DATA.map((s) => s.sortOrder);
    const uniqueSortOrders = new Set(sortOrders);
    expect(uniqueSortOrders.size).toBe(SERVICE_CATALOG_SEED_DATA.length);
  });
});

describe('seedServiceCatalog', () => {
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      serviceCatalog: {
        count: vi.fn(),
        createMany: vi.fn(),
      },
    };
  });

  it('should create 20 entries for a new clinic', async () => {
    mockPrisma.serviceCatalog.count.mockResolvedValue(0);
    mockPrisma.serviceCatalog.createMany.mockResolvedValue({ count: 20 });

    const result = await seedServiceCatalog(mockPrisma, 'clinic_1');

    expect(result).toBe(20);
    expect(mockPrisma.serviceCatalog.createMany).toHaveBeenCalledOnce();

    const createArgs = mockPrisma.serviceCatalog.createMany.mock.calls[0][0];
    expect(createArgs.data).toHaveLength(20);

    for (const entry of createArgs.data) {
      expect(entry.clinicId).toBe('clinic_1');
      expect(entry.isPreset).toBe(true);
    }
  });

  it('should be idempotent (skip if presets exist)', async () => {
    mockPrisma.serviceCatalog.count.mockResolvedValue(20);

    const result = await seedServiceCatalog(mockPrisma, 'clinic_1');

    expect(result).toBe(0);
    expect(mockPrisma.serviceCatalog.createMany).not.toHaveBeenCalled();
  });
});
