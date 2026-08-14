import { randomBytes } from 'node:crypto';
import type { ClinicBillingSettings, SacCodeCorrectionResult } from '@breeyo/types';
import {
  VETERINARY_SAC,
  VETERINARY_SAC_LEGACY_CORRECTABLE,
  stateCodeFromGstin,
} from '@breeyo/types';
import type { BillingSettingsInput } from '@breeyo/validators';
import { encryptSecret } from '../../lib/crypto.js';
import {
  BillingAuditEvent,
  writeBillingAuditLog,
} from '../../lib/billing-audit-log.js';
import type { TenantPrismaClient } from '../../lib/prisma-rls.js';
import { invalidateRazorpayCache } from './razorpay.client.js';

/**
 * D-29 billing settings — GST configuration, invoice defaults, and the
 * per-clinic Razorpay credentials.
 *
 * ## This file deliberately cannot decrypt anything
 *
 * The decrypt half of `lib/crypto.ts` is not imported here and must never be.
 * Possession of a live `key_secret` is authority to move money out of a
 * clinic's account, and the only legitimate consumer of the plaintext is
 * `razorpay.client.ts`, which needs it to construct an SDK instance. A settings
 * *read* has no such need: the screen renders "Key secret: configured", not the
 * value.
 *
 * So `getSettings` converts the two `*_enc` columns to booleans and returns
 * nothing else derived from them — not the ciphertext, not a masked prefix, not
 * a length. A masked-but-recoverable value is still a leak, and a ciphertext on
 * the wire is one key compromise away from being a plaintext (T-06-75, ASVS
 * V6/V8).
 *
 * A phase-level grep gate asserts that the decrypt function is referenced
 * nowhere under `modules/billing/` except in the two files that legitimately
 * need it. That gate is why this comment describes the function rather than
 * naming it: a gate that trips on the documentation explaining the rule is
 * worse than no gate. `settings.test.ts` backs the gate up by stringifying the
 * whole response body and asserting it contains neither the plaintext nor the
 * `v1.` envelope prefix.
 *
 * ## Absent means unchanged, for secrets and for everything else
 *
 * The mobile settings form cannot echo back a secret it never received, so a
 * save of any other field arrives with no `razorpayKeySecret` at all. Treating
 * that as "clear it" would break a clinic's payments the first time an Admin
 * edited their invoice footer (T-06-79).
 *
 * The same reasoning applies past the secrets, which is why the update below is
 * built from the keys the client actually sent rather than from the parsed
 * object. `billingSettingsSchema` carries `.default()` on `gstEnabled`,
 * `defaultDueDays` and `razorpayTestMode`, so a parsed partial submission
 * materialises those defaults — and writing them back would silently switch GST
 * off for a registered clinic that only meant to change its due-date default.
 * Validation still runs over the full parsed object, so the cross-field rules
 * (GST needs a GSTIN, state code must match) are unaffected.
 *
 * ## The SAC correction is opt-in, and that is a decision, not an omission
 *
 * `updateLegacySacCodes` below is the only thing in the codebase that rewrites
 * a clinic's `service_catalog.sac_code`. It runs when an Admin presses a button
 * and at no other time — not on deploy, not on login, not as a side effect of
 * reading these settings. A clinic's catalog rows are its own data, and an
 * accountant may already have set those codes by hand to match what the clinic
 * files; a migration that ran automatically would overwrite that judgement with
 * no one seeing it happen, and the evidence would be a changed string on a
 * legal document (follow-up A1, resolved 2026-08-14).
 *
 * If a future change needs to touch `sac_code` in bulk, it belongs behind its
 * own deliberate action too.
 *
 * ## Cache invalidation is not optional
 *
 * `razorpay.client.ts` caches one SDK instance per clinic, fingerprinted on
 * `razorpayKeyId`. That fingerprint catches a rotated key id but is blind to
 * the far more common case: a merchant regenerates the *secret* and keeps the
 * same key id. Without an explicit eviction the cached instance would go on
 * signing with a revoked secret until the process restarted, and the symptom
 * would be authentication failures at the gateway that vanish on redeploy
 * (T-06-54, T-06-78). Every credential write here calls
 * `invalidateRazorpayCache`, regardless of which field moved.
 */

type DomainError = Error & { statusCode: number; code: string };

function domainError(message: string, statusCode: number, code: string): DomainError {
  const error = new Error(message) as DomainError;
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

/**
 * The columns this service reads. Narrow on purpose: a `findUnique` with no
 * `select` would pull every column on `clinics`, including the two ciphertexts,
 * into a variable that a later refactor could return wholesale.
 */
const SETTINGS_SELECT = {
  id: true,
  gstin: true,
  gstEnabled: true,
  stateCode: true,
  defaultGstRate: true,
  defaultDueDays: true,
  bankDetails: true,
  invoiceFooterText: true,
  razorpayKeyId: true,
  razorpayTestMode: true,
  razorpayWebhookToken: true,
  // The only two ciphertext reads in this file. Both feed a `!== null`
  // presence test in `toSettings` below and are never carried any further.
  razorpayKeySecretEnc: true,
  razorpayWebhookSecretEnc: true,
} as const;

interface SettingsRow {
  id: string;
  gstin: string | null;
  gstEnabled: boolean;
  stateCode: string | null;
  defaultGstRate: { toString(): string } | null;
  defaultDueDays: number;
  bankDetails: string | null;
  invoiceFooterText: string | null;
  razorpayKeyId: string | null;
  razorpayTestMode: boolean;
  razorpayWebhookToken: string | null;
  razorpayKeySecretEnc: string | null;
  razorpayWebhookSecretEnc: string | null;
}

/** 32 bytes, the size the D-29 threat register (T-06-80) specifies. */
const WEBHOOK_TOKEN_BYTES = 32;

/**
 * `base64url` rather than `hex` or plain `base64`: the value goes in a URL path
 * segment, and base64url is the only one of the three that needs no escaping
 * while staying compact.
 */
function generateWebhookToken(): string {
  return randomBytes(WEBHOOK_TOKEN_BYTES).toString('base64url');
}

/**
 * The public base the webhook URL is built on.
 *
 * Falls back to `API_URL` — already present in every environment — and then to
 * `null`, which surfaces as a null `webhookUrl` rather than as the string
 * `"undefined/api/v1/webhooks/..."`. A plausible-looking wrong URL pasted into
 * a Razorpay dashboard fails silently at delivery time; a missing one is
 * visible on the settings screen immediately.
 */
function publicApiBase(): string | null {
  const base = process.env.PUBLIC_API_URL ?? process.env.API_URL;
  return base ? base.replace(/\/+$/, '') : null;
}

/** Non-secret fields whose changes are worth an audit trail. */
const AUDITED_SETTINGS_FIELDS = [
  'gstin',
  'gstEnabled',
  'stateCode',
  'defaultGstRate',
  'defaultDueDays',
  'bankDetails',
  'invoiceFooterText',
  'razorpayTestMode',
] as const;

/**
 * `readonly string[]` is not assignable to Prisma's `in` filter, and the shared
 * constant must stay readonly so no consumer can mutate the canonical list.
 * Copied once at module load rather than per call.
 */
const CORRECTABLE_LEGACY_SAC_CODES: string[] = [...VETERINARY_SAC_LEGACY_CORRECTABLE];

export class BillingSettingsService {
  constructor(private readonly prisma: TenantPrismaClient) {}

  /**
   * Rows of this clinic's catalog still carrying a correctable legacy SAC.
   *
   * A count, deliberately — not a fetch of the rows. The settings screen only
   * needs to know whether to offer the correction and for how many entries, and
   * the row contents are already available through the catalog endpoints.
   *
   * Deactivated rows are included. A retired preset is still resolvable from a
   * finalized invoice line, and its SAC is still what would be printed if that
   * document were re-rendered.
   */
  private async countLegacySacCodes(clinicId: string): Promise<number> {
    return this.prisma.serviceCatalog.count({
      where: { clinicId, sacCode: { in: CORRECTABLE_LEGACY_SAC_CODES } },
    });
  }

  private toSettings(row: SettingsRow, legacySacCodeCount: number): ClinicBillingSettings {
    const token = row.razorpayWebhookToken;
    const base = publicApiBase();

    return {
      clinicId: row.id,
      gstin: row.gstin,
      gstEnabled: row.gstEnabled,
      stateCode: row.stateCode,
      // Decimal(5,2) serialises to a JSON string; the shared type promises a
      // number. Same conversion, same reason, as `service-catalog.service.ts`.
      defaultGstRate: row.defaultGstRate === null ? null : Number(row.defaultGstRate),
      defaultDueDays: row.defaultDueDays,
      bankDetails: row.bankDetails,
      invoiceFooterText: row.invoiceFooterText,
      razorpayKeyId: row.razorpayKeyId,
      // Presence, never value. These two lines are the entire contract with
      // the ciphertext columns.
      hasRazorpayKeySecret: row.razorpayKeySecretEnc !== null,
      hasRazorpayWebhookSecret: row.razorpayWebhookSecretEnc !== null,
      // A capability, not a display convenience: Razorpay sends no tenant
      // identifier, so this token IS the routing key for
      // POST /webhooks/razorpay/:webhookToken. It is safe here only because
      // all three settings routes are gated on MANAGE_CLINIC_SETTINGS, which
      // the seed grants to Admin alone, and because the query above is scoped
      // to the caller's own clinic. It must never be logged or placed in an
      // error body.
      razorpayWebhookToken: token,
      razorpayTestMode: row.razorpayTestMode,
      webhookUrl: token && base ? `${base}/api/v1/webhooks/razorpay/${token}` : null,
      // Both halves are required: the token routes the delivery and the secret
      // verifies its signature. A clinic with one and not the other cannot
      // process a confirmation, so reporting "configured" would be worse than
      // useless.
      webhookConfigured: token !== null && row.razorpayWebhookSecretEnc !== null,
      // Follow-up A1. Surfaces the opt-in correction on the settings screen;
      // reading it rewrites nothing.
      legacySacCodeCount,
    };
  }

  private async loadRow(clinicId: string): Promise<SettingsRow> {
    const row = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: SETTINGS_SELECT,
    });

    if (!row) {
      throw domainError('Clinic not found', 404, 'CLINIC_NOT_FOUND');
    }

    return row;
  }

  async getSettings(clinicId: string): Promise<ClinicBillingSettings> {
    const [row, legacySacCodeCount] = await Promise.all([
      this.loadRow(clinicId),
      this.countLegacySacCodes(clinicId),
    ]);

    return this.toSettings(row, legacySacCodeCount);
  }

  /**
   * Applies a settings change.
   *
   * @param providedFields the keys the client actually sent, so a partial
   *   submission does not write schema defaults over untouched columns. See the
   *   "Absent means unchanged" note in the class documentation.
   */
  async updateSettings(
    clinicId: string,
    userId: string,
    input: BillingSettingsInput,
    providedFields: ReadonlySet<string>,
  ): Promise<ClinicBillingSettings> {
    const existing = await this.loadRow(clinicId);

    const data: Record<string, unknown> = {};

    for (const field of AUDITED_SETTINGS_FIELDS) {
      if (providedFields.has(field)) {
        data[field] = input[field];
      }
    }

    // The place-of-supply code drives the CGST+SGST versus IGST split on every
    // invoice the clinic issues. Deriving it from the GSTIN rather than asking
    // for it twice removes the chance of the two disagreeing; the schema
    // already rejects an explicit code that contradicts the GSTIN.
    if (
      providedFields.has('gstin') &&
      !providedFields.has('stateCode') &&
      input.gstin !== undefined
    ) {
      const derived = stateCodeFromGstin(input.gstin);
      if (derived !== null) {
        data.stateCode = derived;
      }
    }

    const keyIdChanged =
      providedFields.has('razorpayKeyId') && input.razorpayKeyId !== existing.razorpayKeyId;
    if (providedFields.has('razorpayKeyId')) {
      data.razorpayKeyId = input.razorpayKeyId;
    }

    // Absent means unchanged: the `*Enc` column is omitted from the update
    // object entirely rather than being set to null (T-06-79).
    const keySecretChanged =
      providedFields.has('razorpayKeySecret') && input.razorpayKeySecret !== undefined;
    if (keySecretChanged) {
      data.razorpayKeySecretEnc = encryptSecret(input.razorpayKeySecret!);
    }

    const webhookSecretChanged =
      providedFields.has('razorpayWebhookSecret') && input.razorpayWebhookSecret !== undefined;
    if (webhookSecretChanged) {
      data.razorpayWebhookSecretEnc = encryptSecret(input.razorpayWebhookSecret!);
    }

    const credentialChanged = keyIdChanged || keySecretChanged || webhookSecretChanged;

    // A first credential save mints the routing token. An existing one is left
    // alone: silently rotating it would break a webhook the Admin has already
    // pasted into their Razorpay dashboard, and the payment confirmations would
    // simply stop with no error surfaced anywhere.
    const rotateRequested = input.rotateWebhookToken === true;
    const needsToken = credentialChanged && existing.razorpayWebhookToken === null;
    const webhookTokenRotated = rotateRequested || needsToken;
    if (webhookTokenRotated) {
      data.razorpayWebhookToken = generateWebhookToken();
    }

    const updated = await this.prisma.clinic.update({
      where: { id: clinicId },
      data,
      select: SETTINGS_SELECT,
    });

    if (credentialChanged) {
      // Before the response is built, so a caller that immediately creates a
      // payment link cannot race a stale instance.
      invalidateRazorpayCache(clinicId);

      await writeBillingAuditLog(
        this.prisma,
        BillingAuditEvent.RAZORPAY_CREDENTIALS_UPDATED,
        {
          clinicId,
          userId,
          // Booleans only. Never a value, encrypted or otherwise: audit rows
          // are long-lived by design, which makes them the worst possible
          // place for a credential to come to rest (T-06-76, ASVS V7).
          metadata: {
            keyIdChanged,
            keySecretChanged,
            webhookSecretChanged,
            webhookTokenRotated,
          },
        },
      );
    }

    const changedSettingsFields = AUDITED_SETTINGS_FIELDS.filter((field) =>
      providedFields.has(field),
    );
    if (changedSettingsFields.length > 0) {
      await writeBillingAuditLog(this.prisma, BillingAuditEvent.BILLING_SETTINGS_UPDATED, {
        clinicId,
        userId,
        // Field names, not values: `gstin` is a public registration number, but
        // enumerating values here would set the precedent that this metadata
        // may carry them.
        metadata: { changedFields: changedSettingsFields },
      });
    }

    return this.toSettings(updated, await this.countLegacySacCodes(clinicId));
  }

  /**
   * Mints a new webhook routing token (T-06-80).
   *
   * A separate endpoint rather than a flag on the ordinary save, because the
   * consequence is not a settings change: the clinic stops receiving payment
   * confirmations until the Admin pastes the new URL into their Razorpay
   * dashboard. That belongs behind its own deliberate action.
   */
  async rotateWebhookToken(clinicId: string, userId: string): Promise<ClinicBillingSettings> {
    await this.loadRow(clinicId);

    const updated = await this.prisma.clinic.update({
      where: { id: clinicId },
      data: { razorpayWebhookToken: generateWebhookToken() },
      select: SETTINGS_SELECT,
    });

    invalidateRazorpayCache(clinicId);

    await writeBillingAuditLog(this.prisma, BillingAuditEvent.RAZORPAY_CREDENTIALS_UPDATED, {
      clinicId,
      userId,
      metadata: {
        keyIdChanged: false,
        keySecretChanged: false,
        webhookSecretChanged: false,
        webhookTokenRotated: true,
      },
    });

    return this.toSettings(updated, await this.countLegacySacCodes(clinicId));
  }

  /**
   * Rewrites this clinic's correctable legacy SAC codes to
   * {@link VETERINARY_SAC} (follow-up A1, resolved 2026-08-14).
   *
   * ## Only ever called from one place
   *
   * `POST /billing/settings/sac-codes/update`, behind
   * `MANAGE_CLINIC_SETTINGS`. Nothing schedules it, no startup hook runs it and
   * no other service calls it. That is the resolution of A1: new clinics are
   * seeded correctly, and an already-seeded clinic's data changes only because
   * its Admin decided it should. An accountant may already have corrected these
   * codes by hand, and a silent migration would overwrite that with no record
   * anyone would notice.
   *
   * ## Scoped twice over
   *
   * `clinicId` is in the `where` clause *and* RLS is bound on this handle, so
   * neither a bug here nor a bug in the policy alone can reach another tenant's
   * rows. And the code filter is
   * `VETERINARY_SAC_LEGACY_CORRECTABLE`, not "everything that is not 998351":
   * a clinic that set `999319` deliberately keeps it, and the grooming rows
   * keep `998612` because Entry 46 does not reach a taxable supply.
   *
   * `updateMany` rather than a read-then-write loop: it is one statement, so
   * the set of rows it matches cannot shift underneath a partially applied
   * correction, and its `count` is the authoritative number rewritten.
   */
  async updateLegacySacCodes(
    clinicId: string,
    userId: string,
  ): Promise<SacCodeCorrectionResult> {
    // Establishes the clinic exists (and is this tenant's) before any write,
    // matching `rotateWebhookToken`.
    await this.loadRow(clinicId);

    const result = await this.prisma.serviceCatalog.updateMany({
      where: { clinicId, sacCode: { in: CORRECTABLE_LEGACY_SAC_CODES } },
      data: { sacCode: VETERINARY_SAC },
    });

    // No row moved, so nothing happened worth recording. A clinic whose Admin
    // taps the button twice should not accumulate audit rows describing
    // non-events — that dilutes the log that a real correction has to be found
    // in six years from now.
    if (result.count > 0) {
      await writeBillingAuditLog(this.prisma, BillingAuditEvent.SERVICE_SAC_CODES_UPDATED, {
        clinicId,
        userId,
        // A count and the target code. Not the row ids and not the previous
        // values: the correctable set is a fixed four-element constant, so the
        // "before" state is fully reconstructible from the count plus this
        // file, and enumerating rows here would set the precedent that catalog
        // contents may live in the audit log.
        metadata: { updated: result.count, sacCode: VETERINARY_SAC },
      });
    }

    return {
      updated: result.count,
      sacCode: VETERINARY_SAC,
      legacySacCodeCount: await this.countLegacySacCodes(clinicId),
    };
  }
}
