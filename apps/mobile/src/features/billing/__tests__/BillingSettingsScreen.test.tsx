import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  BILLING_SETTINGS_COPY,
  GST_RATE_OPTIONS,
  MANAGE_CLINIC_SETTINGS_PERMISSION,
  buildSettingsPayload,
  canManageBillingSettings,
  emptyCredentialToUndefined,
  formValuesFromSettings,
  gstinFieldError,
  isGstRateFieldEnabled,
  validateSettingsForm,
  webhookIndicator,
} from '../lib/settings-form';
import type { BillingSettingsFormValues } from '../lib/settings-form';
import type { ClinicBillingSettings } from '@breeyo/types';

/**
 * `apps/mobile` cannot render a React Native component under test — the vitest
 * environment is `node` with no Metro transform and `react-test-renderer` is not
 * installed (recorded in `06-14-SUMMARY.md` deviation 1). Every decision this
 * screen makes therefore lives in `lib/settings-form.ts`, which imports nothing
 * from `react-native`, and is asserted directly here.
 */

const STORED: ClinicBillingSettings = {
  clinicId: '11111111-1111-1111-1111-111111111111',
  gstin: '27AAPFU0939F1ZV',
  gstEnabled: true,
  stateCode: '27',
  defaultGstRate: 18,
  defaultDueDays: 7,
  bankDetails: 'HDFC 000111222',
  invoiceFooterText: 'Thank you',
  razorpayKeyId: 'key-id-on-file',
  hasRazorpayKeySecret: true,
  hasRazorpayWebhookSecret: true,
  razorpayWebhookToken: 'tok_abcdef',
  razorpayTestMode: false,
  webhookUrl: 'https://api.example.com/api/v1/webhooks/razorpay/tok_abcdef',
  webhookConfigured: true,
};

function baseValues(): BillingSettingsFormValues {
  return {
    gstin: '',
    gstEnabled: false,
    defaultGstRate: null,
    defaultDueDays: '0',
    bankDetails: '',
    invoiceFooterText: '',
    razorpayKeyId: '',
    razorpayKeySecret: undefined,
    razorpayWebhookSecret: undefined,
    razorpayTestMode: true,
    hasStoredKeySecret: false,
    hasStoredWebhookSecret: false,
  };
}

describe('credential inputs are write-only (T-06-117)', () => {
  it('never carries a stored secret into form state, even when one exists', () => {
    const values = formValuesFromSettings(STORED);

    expect(values.razorpayKeySecret).toBeUndefined();
    expect(values.razorpayWebhookSecret).toBeUndefined();
    // The whole form state, serialised, must not contain a credential shape.
    expect(JSON.stringify(values)).not.toMatch(/^v1\.|rzp_(test|live)_/);
  });

  it('reports an empty or whitespace credential input as absent, never as an empty string', () => {
    expect(emptyCredentialToUndefined('')).toBeUndefined();
    expect(emptyCredentialToUndefined('   ')).toBeUndefined();
    expect(emptyCredentialToUndefined(undefined)).toBeUndefined();
    expect(emptyCredentialToUndefined('  a-real-secret  ')).toBe('a-real-secret');
  });

  it('carries the presence booleans through so the caption can be rendered', () => {
    const values = formValuesFromSettings(STORED);
    expect(values.hasStoredKeySecret).toBe(true);
    expect(values.hasStoredWebhookSecret).toBe(true);

    const fresh = formValuesFromSettings(undefined);
    expect(fresh.hasStoredKeySecret).toBe(false);
    expect(fresh.hasStoredWebhookSecret).toBe(false);
  });
});

describe('submit payload omits empty credential keys (T-06-118)', () => {
  it('has no razorpayKeySecret key at all when the input was left empty', () => {
    const payload = buildSettingsPayload(baseValues());

    expect('razorpayKeySecret' in payload).toBe(false);
    expect('razorpayWebhookSecret' in payload).toBe(false);
    // Object.keys is the same check the server runs to build `providedFields`.
    expect(Object.keys(payload)).not.toContain('razorpayKeySecret');
  });

  it('includes the credential key only when the Admin actually typed one', () => {
    const payload = buildSettingsPayload({
      ...baseValues(),
      razorpayKeySecret: 'a-typed-secret',
    });

    expect(payload.razorpayKeySecret).toBe('a-typed-secret');
    expect('razorpayWebhookSecret' in payload).toBe(false);
  });

  it('never serialises a blank credential even if one reaches the builder', () => {
    const payload = buildSettingsPayload({
      ...baseValues(),
      razorpayKeySecret: '   ',
    });

    expect('razorpayKeySecret' in payload).toBe(false);
  });

  it('never sends rotateWebhookToken as a side effect of an ordinary save', () => {
    expect('rotateWebhookToken' in buildSettingsPayload(baseValues())).toBe(false);
  });
});

describe('webhook configured indicator (T-06-121)', () => {
  it('is a warning with an explanation when the clinic never configured it', () => {
    const indicator = webhookIndicator(false, null);

    expect(indicator.tone).toBe('warning');
    expect(indicator.text.length).toBeGreaterThan(0);
  });

  it('is positive when the server reports the webhook configured', () => {
    expect(webhookIndicator(true, STORED.webhookUrl).tone).toBe('positive');
  });
});

describe('copy is the UI-SPEC copy', () => {
  it('carries the test-mode helper verbatim', () => {
    expect(BILLING_SETTINGS_COPY.testModeHelper).toBe(
      'Use test keys for development. No real payments processed.',
    );
  });

  it('carries every 06-UI-SPEC Billing Settings string verbatim', () => {
    expect(BILLING_SETTINGS_COPY.clinicDetailsSection).toBe('Clinic Details (Invoice Header)');
    expect(BILLING_SETTINGS_COPY.gstinLabel).toBe('GSTIN Number (optional)');
    expect(BILLING_SETTINGS_COPY.gstinPlaceholder).toBe('Enter GSTIN');
    expect(BILLING_SETTINGS_COPY.gstRateLabel).toBe('Default GST Rate (%)');
    expect(BILLING_SETTINGS_COPY.invoiceDefaultsSection).toBe('Invoice Defaults');
    expect(BILLING_SETTINGS_COPY.dueDaysLabel).toBe('Default Due Date (days)');
    expect(BILLING_SETTINGS_COPY.dueDaysPlaceholder).toBe('0');
    expect(BILLING_SETTINGS_COPY.dueDaysHelper).toBe(
      'Number of days from invoice date. 0 = due on invoice date.',
    );
    expect(BILLING_SETTINGS_COPY.bankDetailsLabel).toBe('Bank Account Details (optional)');
    expect(BILLING_SETTINGS_COPY.bankDetailsPlaceholder).toBe(
      'Account details shown on invoice...',
    );
    expect(BILLING_SETTINGS_COPY.footerTextLabel).toBe('Invoice Footer Text (optional)');
    expect(BILLING_SETTINGS_COPY.footerTextPlaceholder).toBe(
      'Terms and conditions, thank you message...',
    );
    expect(BILLING_SETTINGS_COPY.paymentGatewaySection).toBe('Payment Gateway');
    expect(BILLING_SETTINGS_COPY.razorpayKeyLabel).toBe('Razorpay Key ID');
    expect(BILLING_SETTINGS_COPY.razorpaySecretLabel).toBe('Razorpay Key Secret');
    expect(BILLING_SETTINGS_COPY.razorpaySecretPlaceholder).toBe('Enter key secret');
    expect(BILLING_SETTINGS_COPY.testModeLabel).toBe('Test Mode');
    expect(BILLING_SETTINGS_COPY.saveButton).toBe('Save Settings');
    expect(BILLING_SETTINGS_COPY.saveSuccessToast).toBe('Billing settings saved');
  });
});

// ─── Task 2: the screen's own behaviours ────────────────────────────────────

const SCREEN_SOURCE = readFileSync(
  new URL('../screens/BillingSettingsScreen.tsx', import.meta.url),
  'utf8',
);
const DASHBOARD_SOURCE = readFileSync(
  new URL('../screens/BillingDashboardScreen.tsx', import.meta.url),
  'utf8',
);
const ROUTE_SOURCE = readFileSync(
  new URL('../../../../app/(app)/billing/settings.tsx', import.meta.url),
  'utf8',
);

describe('GST guard rails (T-06-120 / Pitfall 12)', () => {
  it('defaults GST off for a clinic that has never configured it', () => {
    expect(formValuesFromSettings(undefined).gstEnabled).toBe(false);
    expect(formValuesFromSettings(undefined).defaultGstRate).toBeNull();
  });

  it('keeps the GST rate field disabled until a valid GSTIN is entered', () => {
    expect(isGstRateFieldEnabled('')).toBe(false);
    expect(isGstRateFieldEnabled('27AAPFU')).toBe(false);
    expect(isGstRateFieldEnabled('NOTAGSTINATALL')).toBe(false);
    expect(isGstRateFieldEnabled('27AAPFU0939F1ZV')).toBe(true);
  });

  it('shows an inline format error for a malformed GSTIN but not for an empty one', () => {
    expect(gstinFieldError('')).toBeUndefined();
    expect(gstinFieldError('27AAPFU0939F1ZV')).toBeUndefined();
    expect(gstinFieldError('12345')).toBe('Not a valid 15-character GSTIN');
  });

  it('rejects gstEnabled with an invalid GSTIN using the shared schema message', () => {
    const result = validateSettingsForm({
      ...baseValues(),
      gstEnabled: true,
      gstin: 'NOT-A-GSTIN',
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.errors.gstin).toBe('GST cannot be enabled without a valid GSTIN');
  });

  it('rejects gstEnabled with no GSTIN at all with the same message', () => {
    const result = validateSettingsForm({ ...baseValues(), gstEnabled: true });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.errors.gstin).toBe('GST cannot be enabled without a valid GSTIN');
  });

  it('accepts gstEnabled once a valid GSTIN is present', () => {
    const result = validateSettingsForm({
      ...baseValues(),
      gstEnabled: true,
      gstin: '27AAPFU0939F1ZV',
      defaultGstRate: 18,
    });

    expect(result.ok).toBe(true);
  });

  it('offers only current GST slabs, never the retired ones', () => {
    expect([...GST_RATE_OPTIONS]).toEqual([0, 5, 18, 40]);
    expect(GST_RATE_OPTIONS).not.toContain(12);
    expect(GST_RATE_OPTIONS).not.toContain(28);
  });

  it('does not pre-fill the rate field toward charging tax', () => {
    expect(SCREEN_SOURCE).not.toContain('placeholder="18"');
    // The threshold caption a vet who does not know the rule needs to see.
    expect(SCREEN_SOURCE).toMatch(/20 lakh|₹20/);
  });
});

describe('the request body preserves a stored credential (T-06-118)', () => {
  it('serialises to a body with no razorpayKeySecret key when the field was empty', () => {
    const result = validateSettingsForm({
      ...baseValues(),
      bankDetails: 'an unrelated edit',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');

    // Exactly what `apiClient` puts on the wire, and exactly what the service
    // turns into its `providedFields` set.
    const body = JSON.parse(JSON.stringify(result.payload));

    expect(Object.keys(body)).not.toContain('razorpayKeySecret');
    expect(Object.keys(body)).not.toContain('razorpayWebhookSecret');
    expect(body.bankDetails).toBe('an unrelated edit');
  });
});

describe('no credential value can reach the screen (T-06-117)', () => {
  const FORBIDDEN = /^v1\.|rzp_(test|live)_/;

  it('has no credential-shaped literal anywhere in the screen or its section', () => {
    const section = readFileSync(
      new URL('../components/RazorpayConfigSection.tsx', import.meta.url),
      'utf8',
    );

    for (const source of [SCREEN_SOURCE, section]) {
      for (const line of source.split('\n')) {
        expect(line.trimStart()).not.toMatch(FORBIDDEN);
      }
      expect(source).not.toContain('razorpayKeySecretEnc');
    }
  });

  it('holds no credential value in the form state seeded from the server', () => {
    const values = formValuesFromSettings(STORED);
    for (const value of Object.values(values)) {
      if (typeof value === 'string') {
        expect(value).not.toMatch(FORBIDDEN);
      }
    }
  });
});

describe('the permission gate (T-06-119)', () => {
  it('denies a user without MANAGE_CLINIC_SETTINGS', () => {
    expect(canManageBillingSettings(['VIEW_INVOICES', 'RECORD_PAYMENT'])).toBe(false);
    expect(canManageBillingSettings([])).toBe(false);
    // Undefined is the still-loading case: deny, so a form is never shown early.
    expect(canManageBillingSettings(undefined)).toBe(false);
  });

  it('allows a user holding MANAGE_CLINIC_SETTINGS', () => {
    expect(canManageBillingSettings([MANAGE_CLINIC_SETTINGS_PERMISSION])).toBe(true);
  });

  it('renders an access-denied state instead of the form', () => {
    expect(SCREEN_SOURCE).toContain('MANAGE_CLINIC_SETTINGS');
    expect(SCREEN_SOURCE).toContain(BILLING_SETTINGS_COPY.accessDeniedTitle);
    // The denial must short-circuit before any field renders.
    const deniedAt = SCREEN_SOURCE.indexOf('accessDeniedTitle');
    const formAt = SCREEN_SOURCE.indexOf('RazorpayConfigSection');
    expect(deniedAt).toBeGreaterThan(-1);
    expect(deniedAt).toBeLessThan(formAt);
  });
});

describe('the screen renders the UI-SPEC copy and validates with the shared schema', () => {
  it('contains every canonical copy string verbatim', () => {
    const rendered = [
      BILLING_SETTINGS_COPY.clinicDetailsSection,
      BILLING_SETTINGS_COPY.gstinLabel,
      BILLING_SETTINGS_COPY.gstinPlaceholder,
      BILLING_SETTINGS_COPY.gstRateLabel,
      BILLING_SETTINGS_COPY.invoiceDefaultsSection,
      BILLING_SETTINGS_COPY.dueDaysLabel,
      BILLING_SETTINGS_COPY.dueDaysHelper,
      BILLING_SETTINGS_COPY.bankDetailsLabel,
      BILLING_SETTINGS_COPY.bankDetailsPlaceholder,
      BILLING_SETTINGS_COPY.footerTextLabel,
      BILLING_SETTINGS_COPY.footerTextPlaceholder,
      BILLING_SETTINGS_COPY.saveButton,
      BILLING_SETTINGS_COPY.saveSuccessToast,
    ];

    for (const copy of rendered) {
      expect(SCREEN_SOURCE).toContain(copy);
    }
  });

  it('validates with the shared schema and gates the rate field on the shared regex', () => {
    expect(SCREEN_SOURCE).toContain('billingSettingsSchema');
    expect(SCREEN_SOURCE).toContain('GSTIN_REGEX');
  });

  it('composes the Payment Gateway section rather than duplicating it', () => {
    expect(SCREEN_SOURCE).toContain('RazorpayConfigSection');
    expect(SCREEN_SOURCE).toContain('Payment Gateway');
  });
});

describe('reachability: the gear affordance on the Billing dashboard (D-28)', () => {
  it('navigates to the settings route from the dashboard header', () => {
    expect(DASHBOARD_SOURCE).toContain('billing/settings');
    expect(DASHBOARD_SOURCE).toMatch(/cog|gear|settings/i);
  });

  it('did not disturb the 06-14 dashboard surface it was added to', () => {
    // D-33's fifth card and D-46's FINALIZED relabel both still render.
    expect(DASHBOARD_SOURCE).toContain('BillingSummaryHeader');
    expect(DASHBOARD_SOURCE).toContain('billingExceptionBannerText');
    expect(DASHBOARD_SOURCE).toContain('useInvoiceSocket');
    expect(DASHBOARD_SOURCE).toContain('NewInvoiceSheet');
  });

  it('exposes the settings screen through a thin route file', () => {
    expect(ROUTE_SOURCE).toContain('BillingSettingsScreen');
  });
});

describe('the save action targets the endpoint that invalidates the server cache (T-06-54)', () => {
  it('PUTs the settings endpoint and rotates through its own endpoint', () => {
    const hook = readFileSync(
      new URL('../hooks/useBillingSettings.ts', import.meta.url),
      'utf8',
    );

    expect(hook).toContain("'/api/v1/billing/settings'");
    expect(hook).toContain("method: 'PUT'");
    expect(hook).toContain('/api/v1/billing/settings/webhook-token/rotate');
    // Rotation must invalidate the settings query, or the screen keeps showing
    // the pre-rotation URL and the Admin pastes a dead one (T-06-140).
    expect(hook.slice(hook.indexOf('useRotateWebhookToken'))).toContain('invalidateQueries');
  });
});
