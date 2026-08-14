import type { ServiceCatalog, ServiceCategory } from '@breeyo/types';
import type { ServiceCatalogInput, ServiceCatalogUpdateInput } from '@breeyo/validators';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';

/**
 * The D-02 service catalog: preset and custom billable services, the source the
 * invoice builder's "Add Service" sheet reads from.
 *
 * Structurally modelled on `drug.service.ts` — clinic-scoped reference data
 * with a search — but with two rules that reference data pointed at by
 * *financial* records needs and a drug list does not.
 *
 * ## 1. Deactivation is a soft delete, always
 *
 * A finalized `InvoiceLineItem` stores `serviceCatalogId`. A finalized invoice
 * is immutable and carries a six-year GST retention obligation (Section 36), so
 * hard-deleting a catalog row would leave a dangling reference on a record of
 * account that can never be corrected. `isActive: false` removes the entry from
 * every picker while keeping it resolvable forever. There is deliberately no
 * delete path on this service at all.
 *
 * ## 2. A preset can be repriced but not renamed
 *
 * `ServiceCatalog.name` is copied into `InvoiceLineItem.description` when a
 * line is added, but a DRAFT invoice's lines are re-read from the catalog until
 * it is finalized. Renaming "General Consultation" would therefore silently
 * change the description on every draft invoice referencing it — invoices a
 * front desk may already have shown to an owner.
 *
 * Price, activity and GST rate are the opposite case and must stay editable: a
 * clinic that cannot reprice a preset has to create a near-duplicate custom
 * entry, which fragments the catalog and defeats the one-tap-add flow. Repricing
 * is safe precisely because the *money* on a line is frozen at add-to-invoice
 * time (`unitPricePaise`), unlike the description.
 *
 * ## Search: `ILIKE`, not a trigram index
 *
 * `patient.repository.ts` uses a pg_trgm similarity search because a clinic has
 * thousands of patients and staff mistype owner names. A service catalog is
 * twenty presets plus a handful of custom entries — a few dozen rows, where a
 * sequential scan is faster than an index probe and a trigram index would be
 * pure overhead on a table that is written more often than it is searched.
 * `name ILIKE '%term%'` on the existing `(clinic_id, is_active)` index is the
 * right shape here; revisit only if a real clinic's catalog grows past a few
 * hundred rows. This is recorded rather than left implicit because the phase's
 * own plan offered pg_trgm as the default.
 */

/** The project idiom: an ordinary Error with `statusCode` and `code`. */
type DomainError = Error & { statusCode: number; code: string };

function domainError(message: string, statusCode: number, code: string): DomainError {
  const error = new Error(message) as DomainError;
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

/**
 * 404 rather than 403 for another clinic's entry.
 *
 * A 403 would confirm the id exists somewhere, which is a cross-tenant
 * existence oracle. Absent and forbidden must be indistinguishable here.
 */
function serviceNotFound(): DomainError {
  return domainError('Service not found', 404, 'SERVICE_NOT_FOUND');
}

/**
 * The fields a preset entry refuses to change. See the class doc above: a
 * rename would rewrite the description on every draft invoice referencing it,
 * and flipping `isPreset` would smuggle the row out from under this very guard.
 */
const PRESET_IMMUTABLE_FIELDS = ['name', 'isPreset'] as const;

/**
 * The raw Prisma row, whose `gstRateOverride` is a `Decimal`, not a `number`.
 */
interface ServiceCatalogRow {
  id: string;
  clinicId: string;
  name: string;
  category: string;
  price: number;
  sacCode: string | null;
  hsnCode: string | null;
  gstRateOverride: { toString(): string } | null;
  isActive: boolean;
  isPreset: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Maps a row to the wire shape declared by `ServiceCatalog` in `@breeyo/types`.
 *
 * This exists for one column. `gst_rate_override` is `Decimal(5,2)`, and Prisma
 * surfaces a `Decimal` whose `toJSON` emits a **string** — so an unmapped row
 * puts `"0"` on the wire where `@breeyo/types` promises `number | null`. The
 * mismatch is invisible to the compiler, because the Prisma row is never
 * checked against the shared interface, and it is quietly destructive at the
 * point of use: `rate === 0` is false for `"0"`, so the exempt check that
 * Finding G1 hangs on — veterinary healthcare is exempt by law — takes the
 * taxable branch for every exempt service in the catalog.
 *
 * `Number(...)` and not `parseFloat(...)`: a malformed value should become
 * `NaN` loudly rather than being parsed up to the first bad character.
 */
function toServiceCatalog(row: ServiceCatalogRow): ServiceCatalog {
  return {
    id: row.id,
    clinicId: row.clinicId,
    name: row.name,
    category: row.category as ServiceCategory,
    price: row.price,
    sacCode: row.sacCode,
    hsnCode: row.hsnCode,
    gstRateOverride: row.gstRateOverride === null ? null : Number(row.gstRateOverride),
    isActive: row.isActive,
    isPreset: row.isPreset,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class ServiceCatalogService {
  constructor(private readonly prisma: TenantPrismaClient) {}

  /**
   * The invoice builder's "Add Service" list.
   *
   * Presets first, ordered by the curated `sortOrder` the seed assigns, then
   * custom entries. `isPreset: 'desc'` puts `true` first — the common services
   * a front desk taps every day sit at the top without scrolling.
   */
  async list(clinicId: string): Promise<ServiceCatalog[]> {
    const rows = await this.prisma.serviceCatalog.findMany({
      where: { clinicId, isActive: true },
      orderBy: [{ isPreset: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });

    return rows.map(toServiceCatalog);
  }

  /**
   * Live search over the catalog by name, case-insensitive and substring-based
   * so `consult` finds `General Consultation`.
   *
   * Deactivated entries are excluded: search feeds the same add-to-invoice flow
   * as {@link list}, and an entry a clinic has retired must not be re-addable
   * through a different route.
   */
  async search(clinicId: string, term: string, limit = 20): Promise<ServiceCatalog[]> {
    const rows = await this.prisma.serviceCatalog.findMany({
      where: {
        clinicId,
        isActive: true,
        name: { contains: term, mode: 'insensitive' },
      },
      orderBy: [{ isPreset: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      take: limit,
    });

    return rows.map(toServiceCatalog);
  }

  /** Scoped by `(id, clinicId)`, so another tenant's id reads as absent. */
  async get(clinicId: string, serviceId: string): Promise<ServiceCatalog> {
    return toServiceCatalog(await this.getRow(clinicId, serviceId));
  }

  /**
   * The unmapped row, for internal callers that need `isPreset` before the
   * response shape is built. Kept private so no handler can return a `Decimal`
   * to a device by reaching for it.
   */
  private async getRow(clinicId: string, serviceId: string): Promise<ServiceCatalogRow> {
    const entry = await this.prisma.serviceCatalog.findFirst({
      where: { id: serviceId, clinicId },
    });

    if (!entry) {
      throw serviceNotFound();
    }

    return entry;
  }

  /**
   * Creates a custom entry.
   *
   * `isPreset` is hardcoded to `false` and is not taken from the input: a
   * preset is something the seed creates, and letting a request declare one
   * would let a client mint a row that the update guard then refuses to let
   * anyone rename or correct.
   */
  async create(clinicId: string, input: ServiceCatalogInput): Promise<ServiceCatalog> {
    const created = await this.prisma.serviceCatalog.create({
      data: {
        clinicId,
        name: input.name,
        category: input.category,
        price: input.price,
        sacCode: input.sacCode ?? null,
        hsnCode: input.hsnCode ?? null,
        // `?? null` and not `|| null`: 0 is a real, meaningful rate — veterinary
        // healthcare is exempt by law (Finding G1) — and `||` would discard it,
        // silently falling back to the clinic default and taxing an exempt
        // supply.
        gstRateOverride: input.gstRateOverride ?? null,
        isActive: input.isActive,
        isPreset: false,
        sortOrder: input.sortOrder ?? 0,
      },
    });

    return toServiceCatalog(created);
  }

  /**
   * Updates an entry, enforcing the preset guard.
   *
   * The existing row is read first so the guard runs against what is actually
   * stored rather than against anything the client asserts about it.
   */
  async update(
    clinicId: string,
    serviceId: string,
    input: ServiceCatalogUpdateInput,
  ): Promise<ServiceCatalog> {
    const existing = await this.getRow(clinicId, serviceId);

    if (existing.isPreset) {
      const attempted = PRESET_IMMUTABLE_FIELDS.filter(
        (field) => input[field] !== undefined,
      );

      if (attempted.length > 0) {
        throw domainError(
          `A preset service cannot have its ${attempted.join(' or ')} changed. ` +
            'Its price, GST rate and availability are editable; to offer it under a ' +
            'different name, add a custom service instead.',
          400,
          'CANNOT_MODIFY_PRESET',
        );
      }
    }

    // Built key by key rather than spread: an absent key must mean "unchanged",
    // and spreading the parsed input would write an explicit `undefined` into
    // the update for every field the client did not send.
    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.category !== undefined) data.category = input.category;
    if (input.price !== undefined) data.price = input.price;
    if (input.sacCode !== undefined) data.sacCode = input.sacCode;
    if (input.hsnCode !== undefined) data.hsnCode = input.hsnCode;
    if (input.gstRateOverride !== undefined) data.gstRateOverride = input.gstRateOverride;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;

    return toServiceCatalog(
      await this.prisma.serviceCatalog.update({
        where: { id: serviceId },
        data,
      }),
    );
  }

  /**
   * Retires an entry from the pickers without removing it.
   *
   * Presets are deactivatable — a clinic that does not offer grooming should be
   * able to hide it — which is why `isActive` is outside
   * {@link PRESET_IMMUTABLE_FIELDS}.
   */
  async deactivate(clinicId: string, serviceId: string): Promise<ServiceCatalog> {
    await this.getRow(clinicId, serviceId);

    return toServiceCatalog(
      await this.prisma.serviceCatalog.update({
        where: { id: serviceId },
        data: { isActive: false },
      }),
    );
  }
}
