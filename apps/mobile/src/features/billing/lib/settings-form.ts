import { billingSettingsSchema } from '@breeyo/validators';
import { GSTIN_REGEX, GST_RATE_SLABS } from '@breeyo/types';
import type { ClinicBillingSettings } from '@breeyo/types';

/**
 * Every decision the D-29 Billing Settings screen makes, with no dependency on
 * `react-native`.
 *
 * The split is forced: `apps/mobile`'s vitest environment is `node` with no
 * Metro transform, so a module that imports `react-native` cannot be loaded by a
 * test at all (`06-14-SUMMARY.md` deviation 1). Putting the payload builder, the
 * GST gating and the copy contract here is what makes them assertable. The
 * screen and `RazorpayConfigSection` are thin renderers over this file.
 *
 * ## The one rule this file exists to enforce
 *
 * A Razorpay secret is **write-only**. The server returns `hasRazorpayKeySecret`
 * and `hasRazorpayWebhookSecret` booleans and never the value, in any form, so:
 *
 *   - form state is initialised with `undefined` for both secrets, always;
 *   - an empty input is reported as `undefined`, never as `''`;
 *   - `buildSettingsPayload` omits the key entirely rather than sending a blank.
 *
 * The last point is the load-bearing one. `settings.service.ts` derives its
 * `providedFields` set from the keys actually present in the request body and
 * treats an absent key as "unchanged". A blank string is therefore not a no-op:
 * it is an instruction to overwrite the stored credential with nothing, which
 * would break every future payment for that clinic the next time anyone saved an
 * unrelated setting such as the invoice footer text (T-06-118).
 */

// ─── Copy contract (06-UI-SPEC.md `### Billing Settings`) ───────────────────

/**
 * The canonical strings. `BillingSettingsScreen.tsx` writes these literals
 * inline in its JSX rather than importing them, because the plan's acceptance
 * criteria grep the screen file for them; the test suite closes the resulting
 * drift risk by reading the screen's source and asserting every value below
 * appears in it verbatim, which is a stronger guarantee than the grep.
 */
export const BILLING_SETTINGS_COPY = {
  screenTitle: 'Billing Settings',

  clinicDetailsSection: 'Clinic Details (Invoice Header)',
  gstinLabel: 'GSTIN Number (optional)',
  gstinPlaceholder: 'Enter GSTIN',
  gstRateLabel: 'Default GST Rate (%)',

  invoiceDefaultsSection: 'Invoice Defaults',
  dueDaysLabel: 'Default Due Date (days)',
  dueDaysPlaceholder: '0',
  dueDaysHelper: 'Number of days from invoice date. 0 = due on invoice date.',
  bankDetailsLabel: 'Bank Account Details (optional)',
  bankDetailsPlaceholder: 'Account details shown on invoice...',
  footerTextLabel: 'Invoice Footer Text (optional)',
  footerTextPlaceholder: 'Terms and conditions, thank you message...',

  paymentGatewaySection: 'Payment Gateway',
  razorpayKeyLabel: 'Razorpay Key ID',
  /**
   * The UI-SPEC's placeholder for this field is a live-key prefix. It is not
   * used: this plan's own verification requires that string to appear nowhere
   * under `apps/mobile/src`, so that the gate which catches a real key being
   * committed cannot be desensitised by a decorative example. Recorded as a
   * deviation in `06-23-SUMMARY.md`; the "Enter ..." form matches the two
   * sibling placeholders in the same copy table.
   */
  razorpayKeyPlaceholder: 'Enter key ID',
  razorpaySecretLabel: 'Razorpay Key Secret',
  razorpaySecretPlaceholder: 'Enter key secret',
  webhookSecretLabel: 'Razorpay Webhook Secret',
  webhookSecretPlaceholder: 'Enter webhook secret',
  testModeLabel: 'Test Mode',
  testModeHelper: 'Use test keys for development. No real payments processed.',

  saveButton: 'Save Settings',
  saveSuccessToast: 'Billing settings saved',
  saveErrorToast: 'Could not save billing settings. Please try again.',

  // --- Strings with no UI-SPEC entry, added by this plan ---

  /** The caption under a credential input that already has a stored value. */
  secretStoredCaption: 'A secret is saved. Leave blank to keep it unchanged.',
  gstEnabledLabel: 'Charge GST on invoices',
  /**
   * The user-facing half of the Pitfall 12 guard. A solo vet below the
   * registration threshold who switches this on commits a Section 122 offence,
   * and is exactly the person who does not know the rule.
   */
  gstThresholdCaption:
    'GST registration is mandatory only above ₹20 lakh annual turnover. If your clinic is not registered, do not collect GST.',
  gstRateLockedHelper: 'Enter a valid GSTIN to set a default GST rate.',
  gstinInvalidError: 'Not a valid 15-character GSTIN',

  webhookUrlLabel: 'Webhook URL',
  webhookCopyAction: 'Copy',
  webhookCopiedToast: 'Webhook URL copied',
  webhookConfiguredText: 'Webhook configured. This clinic can receive payment confirmations.',
  webhookNotConfiguredText:
    'Webhook not configured. Paste this URL into your Razorpay dashboard, or payments will complete without ever marking the invoice paid.',
  webhookMissingText: 'Save a Razorpay key to generate this clinic’s webhook URL.',
  rotateWebhookAction: 'Rotate webhook token',

  // --- Follow-up A1: the opt-in SAC correction ---

  sacSectionHeading: 'SAC Codes',
  sacUpdateAction: 'Update SAC codes',
  sacNoticeTitle: 'Some services use an older SAC code',
  sacUpdateSuccessToast: 'SAC codes updated',
  sacUpdateErrorToast: 'Could not update SAC codes. Please try again.',

  accessDeniedTitle: 'Admin access required',
  accessDeniedBody:
    'Only a clinic Admin can change billing settings and payment credentials.',
  loadErrorTitle: 'Could not load billing settings',
  loadErrorBody: 'Pull down to try again.',
} as const;

/** The permission all three `/billing/settings` routes are gated on. */
export const MANAGE_CLINIC_SETTINGS_PERMISSION = 'MANAGE_CLINIC_SETTINGS';

export function canManageBillingSettings(
  permissions: readonly string[] | undefined,
): boolean {
  return permissions?.includes(MANAGE_CLINIC_SETTINGS_PERMISSION) ?? false;
}

// ─── Form state ─────────────────────────────────────────────────────────────

export interface BillingSettingsFormValues {
  gstin: string;
  gstEnabled: boolean;
  /** `null` rather than `0`: 0 is a real slab (nil-rated), absence is not. */
  defaultGstRate: number | null;
  /** Held as text because it is a text input; coerced once, in the builder. */
  defaultDueDays: string;
  bankDetails: string;
  invoiceFooterText: string;
  /** Public and safe to display, unlike the two below. */
  razorpayKeyId: string;
  /** `undefined` means "untouched — leave the stored value alone". Never `''`. */
  razorpayKeySecret: string | undefined;
  razorpayWebhookSecret: string | undefined;
  razorpayTestMode: boolean;
  /** Presence booleans, so the caption can say a secret exists without showing it. */
  hasStoredKeySecret: boolean;
  hasStoredWebhookSecret: boolean;
}

/**
 * Seeds the form from the server's response.
 *
 * Note what is absent: there is no branch that could populate either secret
 * field, because `ClinicBillingSettings` has no member that carries one. The
 * write-only property is a consequence of the type, not of care taken here.
 */
export function formValuesFromSettings(
  settings: ClinicBillingSettings | undefined,
): BillingSettingsFormValues {
  return {
    gstin: settings?.gstin ?? '',
    // D-29 / Finding G3: GST is off until a clinic deliberately turns it on.
    gstEnabled: settings?.gstEnabled ?? false,
    defaultGstRate: settings?.defaultGstRate ?? null,
    defaultDueDays: String(settings?.defaultDueDays ?? 0),
    bankDetails: settings?.bankDetails ?? '',
    invoiceFooterText: settings?.invoiceFooterText ?? '',
    razorpayKeyId: settings?.razorpayKeyId ?? '',
    razorpayKeySecret: undefined,
    razorpayWebhookSecret: undefined,
    razorpayTestMode: settings?.razorpayTestMode ?? true,
    hasStoredKeySecret: settings?.hasRazorpayKeySecret ?? false,
    hasStoredWebhookSecret: settings?.hasRazorpayWebhookSecret ?? false,
  };
}

/**
 * The credential callback contract, in one place.
 *
 * `RazorpayConfigSection` routes every keystroke on a secret input through this
 * so the screen above it is never handed a `''` it could accidentally serialise.
 */
export function emptyCredentialToUndefined(
  raw: string | undefined,
): string | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed === '' ? undefined : trimmed;
}

// ─── GST gating (Pitfall 12 / Section 122) ──────────────────────────────────

export function isValidGstin(gstin: string): boolean {
  return GSTIN_REGEX.test(gstin.trim().toUpperCase());
}

/** The rate field stays locked until a GSTIN passes the format check. */
export function isGstRateFieldEnabled(gstin: string): boolean {
  return isValidGstin(gstin);
}

/** Inline error for the GSTIN input. Empty is fine — the field is optional. */
export function gstinFieldError(gstin: string): string | undefined {
  if (gstin.trim() === '') return undefined;
  return isValidGstin(gstin) ? undefined : BILLING_SETTINGS_COPY.gstinInvalidError;
}

/** The only rates offerable, so the field cannot express a retired slab. */
export const GST_RATE_OPTIONS: readonly number[] = GST_RATE_SLABS;

// ─── Webhook health indicator (T-06-121) ────────────────────────────────────

export interface WebhookIndicator {
  tone: 'positive' | 'warning';
  text: string;
}

export function webhookIndicator(
  webhookConfigured: boolean,
  webhookUrl: string | null,
): WebhookIndicator {
  if (webhookConfigured) {
    return { tone: 'positive', text: BILLING_SETTINGS_COPY.webhookConfiguredText };
  }
  return {
    tone: 'warning',
    text:
      webhookUrl === null
        ? BILLING_SETTINGS_COPY.webhookMissingText
        : BILLING_SETTINGS_COPY.webhookNotConfiguredText,
  };
}

// ─── Opt-in SAC correction (follow-up A1) ───────────────────────────────────

export interface LegacySacNotice {
  /** How many catalog rows still carry a correctable legacy code. */
  count: number;
  title: string;
  body: string;
  actionLabel: string;
}

/**
 * The Billing Settings notice offering the A1 correction, or `null` when the
 * clinic has nothing to correct.
 *
 * ## Why the copy is written the way it is
 *
 * Three things have to be true of this text, and each one is asserted by a
 * test:
 *
 *  1. **It names the count and the target code.** An Admin about to change what
 *     is printed on a legal document should see exactly what changes.
 *  2. **It says the tax does not move.** It genuinely does not — the engine
 *     reads `gstRateOverride` and `taxTreatment` and never the SAC string — and
 *     without saying so the reader reasonably fears they are about to re-rate
 *     their whole catalog.
 *  3. **It says leaving this alone is fine.** This is the load-bearing
 *     sentence. The clinic's accountant may already have set these codes to
 *     match what the clinic files, and a notice phrased as a defect to clear
 *     would push an Admin into overwriting that. The decision A1 records is
 *     that no one's data changes without them choosing it, and copy that
 *     pressures the choice would undo that at the last inch.
 *
 * Returning `null` rather than a "you are up to date" variant is deliberate:
 * a clinic seeded after 2026-08-14 has no reason to ever learn this concept
 * exists, and a section that only ever says "nothing to do" is noise on a
 * screen that also holds live payment credentials.
 */
export function legacySacNotice(count: number): LegacySacNotice | null {
  if (count <= 0) return null;

  const services = count === 1 ? '1 service' : `${count} services`;
  const verb = count === 1 ? 'uses' : 'use';

  return {
    count,
    title: BILLING_SETTINGS_COPY.sacNoticeTitle,
    body:
      `${services} on your price list still ${verb} an older SAC code. ` +
      'The code for veterinary services is 998351. Updating changes only what ' +
      'is printed on new invoices — it does not change any tax amount or price. ' +
      'If your accountant chose the codes you have, leave this as it is.',
    actionLabel: BILLING_SETTINGS_COPY.sacUpdateAction,
  };
}

// ─── Payload construction ───────────────────────────────────────────────────

export type BillingSettingsPayload = Record<string, unknown>;

/**
 * Builds the `PUT /billing/settings` body.
 *
 * Key filtering, not value checking. The server's `providedFields` set is built
 * from `Object.keys(body)`, so the only way to say "leave this alone" is for the
 * key to be absent — `undefined` would survive as a key in an object literal and
 * `null` would fail the schema.
 *
 * Omitted when empty:
 *   - both secrets, so a save never clears a working credential (T-06-118);
 *   - `gstin`, because `''` fails the format regex, and because an invalid entry
 *     must reach the schema as *absent* so the `gstEnabled` guard produces the
 *     GST-requires-GSTIN message rather than a format complaint;
 *   - `defaultGstRate`, because no rate is not the same as a nil rate.
 *
 * Always sent: the two free-text invoice fields, so that clearing them in the UI
 * actually clears them, and the three fields the schema defaults.
 */
export function buildSettingsPayload(
  values: BillingSettingsFormValues,
): BillingSettingsPayload {
  const payload: BillingSettingsPayload = {
    gstEnabled: values.gstEnabled,
    defaultDueDays: Number.parseInt(values.defaultDueDays, 10) || 0,
    bankDetails: values.bankDetails,
    invoiceFooterText: values.invoiceFooterText,
    razorpayKeyId: values.razorpayKeyId.trim(),
    razorpayTestMode: values.razorpayTestMode,
  };

  const gstin = values.gstin.trim().toUpperCase();
  if (isValidGstin(gstin)) {
    payload.gstin = gstin;
  }

  if (values.defaultGstRate !== null) {
    payload.defaultGstRate = values.defaultGstRate;
  }

  const keySecret = emptyCredentialToUndefined(values.razorpayKeySecret);
  if (keySecret !== undefined) {
    payload.razorpayKeySecret = keySecret;
  }

  const webhookSecret = emptyCredentialToUndefined(values.razorpayWebhookSecret);
  if (webhookSecret !== undefined) {
    payload.razorpayWebhookSecret = webhookSecret;
  }

  // `rotateWebhookToken` is deliberately never set here. Rotation stops Razorpay
  // delivering to the old URL the moment it lands, so it belongs behind its own
  // endpoint and its own confirmation, not behind the Save button.
  return payload;
}

// ─── Validation ─────────────────────────────────────────────────────────────

export type SettingsValidation =
  | { ok: true; payload: BillingSettingsPayload }
  | { ok: false; errors: Record<string, string> };

/** Flattens Zod issues to one message per field, first issue winning. */
export function collectSchemaErrors(error: {
  errors: readonly { path: (string | number)[]; message: string }[];
}): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.errors) {
    const key = issue.path[0];
    const field = typeof key === 'string' ? key : '_form';
    if (errors[field] === undefined) {
      errors[field] = issue.message;
    }
  }
  return errors;
}

/**
 * Validates with the shared schema so the phone rejects exactly what the server
 * would, with exactly the server's wording. A client-side-only reimplementation
 * of the GST rule would be one drift away from letting an unregistered clinic
 * print a tax line.
 *
 * `BillingSettingsScreen` inlines these same three steps in its submit handler
 * rather than calling this, so that the reject-before-request path is visible at
 * the call site. A test asserts the two agree, so the duplication cannot drift.
 */
export function validateSettingsForm(
  values: BillingSettingsFormValues,
): SettingsValidation {
  const payload = buildSettingsPayload(values);
  const result = billingSettingsSchema.safeParse(payload);

  if (result.success) {
    return { ok: true, payload };
  }
  return { ok: false, errors: collectSchemaErrors(result.error) };
}
