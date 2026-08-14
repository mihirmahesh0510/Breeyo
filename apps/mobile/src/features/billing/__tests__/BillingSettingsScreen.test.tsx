import { describe, it, expect } from 'vitest';
import {
  BILLING_SETTINGS_COPY,
  buildSettingsPayload,
  emptyCredentialToUndefined,
  formValuesFromSettings,
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
});
