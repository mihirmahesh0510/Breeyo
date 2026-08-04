import { describe, it, expect, vi, beforeEach } from 'vitest';
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
