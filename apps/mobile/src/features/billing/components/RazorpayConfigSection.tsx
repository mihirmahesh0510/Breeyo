import React from 'react';
import { View, TextInput as RNTextInput, StyleSheet } from 'react-native';
import { Text, Switch, Button } from 'react-native-paper';
import {
  BILLING_SETTINGS_COPY,
  emptyCredentialToUndefined,
  webhookIndicator,
} from '../lib/settings-form';

const COLORS = {
  surface: '#FFFBF5',
  primary: '#2E7D32',
  tertiary: '#E65100',
  onSurface: '#1C1B1F',
  onSurfaceVariant: '#49454F',
  outline: '#CAC4D0',
  positiveBg: '#E8F5E9',
  warningBg: '#FFE0B2',
} as const;

export interface RazorpayConfigSectionProps {
  /** Public key id. Safe at rest and safe to display, unlike the two secrets. */
  keyId: string;
  onKeyIdChange: (value: string) => void;

  /**
   * Presence booleans straight from the server. There is deliberately no prop
   * carrying a secret *value*: the API returns none, in plaintext or ciphertext,
   * so this component has nothing it could echo back into an input (T-06-117).
   */
  hasRazorpayKeySecret: boolean;
  hasRazorpayWebhookSecret: boolean;

  /**
   * Called with `undefined` — never `''` — when the Admin clears the input.
   *
   * The distinction is the whole point of this contract. An empty field means
   * "leave the stored credential alone", so the screen above must be able to
   * omit the key from the request body entirely. Were this to report `''`, the
   * screen would serialise a blank, the server would treat the key as provided,
   * and the clinic's stored credential would be overwritten with nothing — every
   * future payment for that clinic broken by a save that touched the invoice
   * footer text (T-06-118).
   */
  onKeySecretChange: (value: string | undefined) => void;
  onWebhookSecretChange: (value: string | undefined) => void;

  testMode: boolean;
  onTestModeChange: (value: boolean) => void;

  webhookUrl: string | null;
  webhookConfigured: boolean;
  onCopyWebhookUrl: () => void;
  onRotateWebhookToken: () => void;
  isRotating: boolean;

  testID?: string;
}

/**
 * The D-29 Payment Gateway section: key id, the two write-only credential
 * inputs, the test-mode toggle, and the per-clinic webhook URL with its health
 * indicator.
 *
 * ## Why the credential inputs are uncontrolled
 *
 * They hold no `value` prop bound to any state the parent keeps. There is no
 * initial value to restore (the server returns none) and no reason to mirror
 * keystrokes upward beyond reporting the current text, so the text lives in the
 * native input and leaves via `onChangeText` normalised through
 * `emptyCredentialToUndefined`. A secret therefore never lands in React state,
 * which is one fewer place for it to be captured by a state snapshot, a redux
 * devtools trace or an error report.
 *
 * ## The webhook indicator is not decoration
 *
 * D-29 gives every clinic its own keys, so each of the 20 pilot clinics has to
 * paste its own distinct URL into its own Razorpay dashboard. A clinic that
 * skipped that step has BIL-06 silently broken: payments succeed at the gateway,
 * the webhook never arrives, and the invoice sits unpaid forever with no error
 * anywhere. The indicator is the only symptom that step was missed (T-06-121).
 */
export function RazorpayConfigSection({
  keyId,
  onKeyIdChange,
  hasRazorpayKeySecret,
  hasRazorpayWebhookSecret,
  onKeySecretChange,
  onWebhookSecretChange,
  testMode,
  onTestModeChange,
  webhookUrl,
  webhookConfigured,
  onCopyWebhookUrl,
  onRotateWebhookToken,
  isRotating,
  testID,
}: RazorpayConfigSectionProps) {
  const indicator = webhookIndicator(webhookConfigured, webhookUrl);

  return (
    // The `Payment Gateway` heading is rendered by `BillingSettingsScreen`
    // alongside its two sibling section headings, so all three read as parallel
    // in one place rather than one of them hiding inside a child component.
    <View style={styles.section} testID={testID}>
      {/* --- Public key id --- */}
      <View style={styles.fieldGroup}>
        <Text variant="labelLarge" style={styles.fieldLabel}>
          {BILLING_SETTINGS_COPY.razorpayKeyLabel}
        </Text>
        <RNTextInput
          value={keyId}
          onChangeText={onKeyIdChange}
          placeholder={BILLING_SETTINGS_COPY.razorpayKeyPlaceholder}
          placeholderTextColor={COLORS.onSurfaceVariant}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.textInput}
          testID="razorpay-key-id-input"
        />
      </View>

      {/* --- Write-only key secret --- */}
      <View style={styles.fieldGroup}>
        <Text variant="labelLarge" style={styles.fieldLabel}>
          {BILLING_SETTINGS_COPY.razorpaySecretLabel}
        </Text>
        <RNTextInput
          onChangeText={(text) => onKeySecretChange(emptyCredentialToUndefined(text))}
          placeholder={BILLING_SETTINGS_COPY.razorpaySecretPlaceholder}
          placeholderTextColor={COLORS.onSurfaceVariant}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          textContentType="password"
          style={styles.textInput}
          testID="razorpay-key-secret-input"
        />
        {hasRazorpayKeySecret && (
          <Text variant="bodySmall" style={styles.caption} testID="key-secret-stored-caption">
            {BILLING_SETTINGS_COPY.secretStoredCaption}
          </Text>
        )}
      </View>

      {/* --- Write-only webhook secret --- */}
      <View style={styles.fieldGroup}>
        <Text variant="labelLarge" style={styles.fieldLabel}>
          {BILLING_SETTINGS_COPY.webhookSecretLabel}
        </Text>
        <RNTextInput
          onChangeText={(text) => onWebhookSecretChange(emptyCredentialToUndefined(text))}
          placeholder={BILLING_SETTINGS_COPY.webhookSecretPlaceholder}
          placeholderTextColor={COLORS.onSurfaceVariant}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          textContentType="password"
          style={styles.textInput}
          testID="razorpay-webhook-secret-input"
        />
        {hasRazorpayWebhookSecret && (
          <Text
            variant="bodySmall"
            style={styles.caption}
            testID="webhook-secret-stored-caption"
          >
            {BILLING_SETTINGS_COPY.secretStoredCaption}
          </Text>
        )}
      </View>

      {/* --- Test mode --- */}
      <View style={styles.toggleRow}>
        <View style={styles.toggleTextColumn}>
          <Text variant="bodyLarge" style={styles.fieldLabel}>
            {BILLING_SETTINGS_COPY.testModeLabel}
          </Text>
          <Text variant="bodySmall" style={styles.caption}>
            Use test keys for development. No real payments processed.
          </Text>
        </View>
        <Switch
          value={testMode}
          onValueChange={onTestModeChange}
          color={COLORS.primary}
          testID="razorpay-test-mode-switch"
        />
      </View>

      {/* --- Per-clinic webhook URL and health indicator --- */}
      <View style={styles.fieldGroup}>
        <Text variant="labelLarge" style={styles.fieldLabel}>
          {BILLING_SETTINGS_COPY.webhookUrlLabel}
        </Text>

        <View style={styles.webhookRow}>
          <Text
            variant="bodySmall"
            selectable
            numberOfLines={2}
            style={styles.webhookUrl}
            testID="webhook-url-text"
          >
            {webhookUrl ?? '—'}
          </Text>
          {webhookUrl !== null && (
            <Button
              mode="text"
              compact
              onPress={onCopyWebhookUrl}
              textColor={COLORS.primary}
              testID="webhook-copy-button"
            >
              {BILLING_SETTINGS_COPY.webhookCopyAction}
            </Button>
          )}
        </View>

        <View
          style={[
            styles.indicator,
            indicator.tone === 'positive' ? styles.indicatorPositive : styles.indicatorWarning,
          ]}
          testID={
            indicator.tone === 'positive'
              ? 'webhook-configured-indicator'
              : 'webhook-not-configured-indicator'
          }
        >
          <Text variant="bodySmall" style={styles.indicatorText}>
            {indicator.text}
          </Text>
        </View>

        {webhookUrl !== null && (
          <Button
            mode="text"
            compact
            onPress={onRotateWebhookToken}
            disabled={isRotating}
            textColor={COLORS.tertiary}
            testID="webhook-rotate-button"
          >
            {BILLING_SETTINGS_COPY.rotateWebhookAction}
          </Button>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sectionHeading: {
    color: COLORS.onSurface,
    marginBottom: 12,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  fieldLabel: {
    color: COLORS.onSurface,
    marginBottom: 4,
  },
  caption: {
    color: COLORS.onSurfaceVariant,
    marginTop: 4,
  },
  textInput: {
    borderWidth: 1,
    borderColor: COLORS.outline,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: COLORS.onSurface,
    backgroundColor: COLORS.surface,
    minHeight: 48,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 12,
  },
  toggleTextColumn: {
    flex: 1,
  },
  webhookRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  webhookUrl: {
    flex: 1,
    color: COLORS.onSurfaceVariant,
  },
  indicator: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 8,
  },
  indicatorPositive: {
    backgroundColor: COLORS.positiveBg,
  },
  indicatorWarning: {
    backgroundColor: COLORS.warningBg,
  },
  indicatorText: {
    color: COLORS.onSurface,
  },
});
