import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  Share,
  TextInput as RNTextInput,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Text, Switch, Button as PaperButton } from 'react-native-paper';
import { EmptyState, showToast } from '@breeyo/ui';
import { billingSettingsSchema } from '@breeyo/validators';
import { GSTIN_REGEX } from '@breeyo/types';
import {
  useBillingSettings,
  useBillingSettingsPermission,
  useRotateWebhookToken,
  useUpdateBillingSettings,
  useUpdateSacCodes,
} from '../hooks/useBillingSettings';
import { RazorpayConfigSection } from '../components/RazorpayConfigSection';
import {
  BILLING_SETTINGS_COPY,
  GST_RATE_OPTIONS,
  buildSettingsPayload,
  collectSchemaErrors,
  formValuesFromSettings,
  gstinFieldError,
  legacySacNotice,
  type BillingSettingsFormValues,
} from '../lib/settings-form';

const COLORS = {
  surface: '#FFFBF5',
  primary: '#2E7D32',
  tertiary: '#E65100',
  error: '#BA1A1A',
  onSurface: '#1C1B1F',
  onSurfaceVariant: '#49454F',
  outline: '#CAC4D0',
  disabledBg: '#F2EFEA',
} as const;

/**
 * The D-29 billing settings screen — BIL-05's configuration, BIL-06's webhook
 * enablement and BIL-07's per-clinic GST switch.
 *
 * This is the most sensitive client surface in the phase, for two unrelated
 * reasons.
 *
 * ## A live payment credential gets typed into a phone here
 *
 * The server returns presence booleans and never a secret, so the credential
 * inputs start empty every time and an empty input means "unchanged". The
 * submit payload is therefore built by *omitting keys*, not by sending blanks:
 * `settings.service.ts` builds its `providedFields` set from the keys present in
 * the body, so a blank string is an instruction to overwrite a working
 * credential with nothing. That is how a clinic's payments break during a save
 * that only meant to change the invoice footer (T-06-118).
 *
 * ## An unregistered clinic can be nudged into a tax offence here
 *
 * Most solo vets are below the ₹20 lakh registration threshold. Collecting GST
 * without a registration is a Section 122 offence carrying a penalty of up to
 * ₹25,000 or 100% of the tax. So GST defaults off, the rate field stays locked
 * until a GSTIN passes `GSTIN_REGEX`, the rate is chosen from the current slabs
 * rather than typed, the UI-SPEC's `18` placeholder is deliberately not used —
 * it nudges every clinic toward charging tax — and the toggle carries the
 * threshold rule in plain words (T-06-120).
 *
 * The permission gate is defence in depth: all three settings routes are already
 * gated on `MANAGE_CLINIC_SETTINGS` server-side. Checking here stops the app
 * presenting a form that can only end in a 403 *after* an Admin has typed a live
 * secret into it (T-06-119).
 */
export function BillingSettingsScreen() {
  const settingsQuery = useBillingSettings();
  const { canManageSettings, isLoading: isPermissionLoading } =
    useBillingSettingsPermission();
  const updateSettings = useUpdateBillingSettings();
  const rotateToken = useRotateWebhookToken();
  const updateSacCodes = useUpdateSacCodes();

  const [values, setValues] = useState<BillingSettingsFormValues>(() =>
    formValuesFromSettings(undefined),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Seed once the server responds. The two credential fields are untouched by
  // this: `formValuesFromSettings` has no branch that could populate them.
  useEffect(() => {
    if (settingsQuery.data) {
      setValues(formValuesFromSettings(settingsQuery.data));
    }
  }, [settingsQuery.data]);

  const setField = useCallback(
    <K extends keyof BillingSettingsFormValues>(
      key: K,
      value: BillingSettingsFormValues[K],
    ) => {
      setValues((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  /**
   * The rate field is gated on the shared regex, not on "the field is non-empty"
   * — a half-typed GSTIN must not unlock a tax rate.
   */
  const isGstinValid = useMemo(
    () => GSTIN_REGEX.test(values.gstin.trim().toUpperCase()),
    [values.gstin],
  );

  const handleSubmit = useCallback(() => {
    const payload = buildSettingsPayload(values);

    // Parsed with the schema the API uses, so the GST-requires-GSTIN rule
    // produces the identical message the server would, before any request.
    const parsed = billingSettingsSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(collectSchemaErrors(parsed.error));
      return;
    }

    setErrors({});
    updateSettings.mutate(payload, {
      onSuccess: () => {
        // Any secret just typed is dropped from local state; the refetched
        // settings carry only the presence boolean.
        setValues((current) => ({
          ...current,
          razorpayKeySecret: undefined,
          razorpayWebhookSecret: undefined,
        }));
        showToast('success', 'Billing settings saved');
      },
      onError: () => showToast('error', BILLING_SETTINGS_COPY.saveErrorToast),
    });
  }, [values, updateSettings]);

  /**
   * Copy without a new dependency.
   *
   * `expo-clipboard` is not in this app's dependency set and adding a package is
   * outside what this plan may do autonomously, so the URL is `selectable` for a
   * native long-press copy and the button opens the share sheet, whose first
   * action on both platforms is Copy. Swapping in `Clipboard.setStringAsync` is
   * a one-line change if the dependency is ever added (recorded in the summary).
   */
  const handleCopyWebhookUrl = useCallback(() => {
    const url = settingsQuery.data?.webhookUrl;
    if (!url) return;
    void Share.share({ message: url });
  }, [settingsQuery.data]);

  const handleRotate = useCallback(() => {
    rotateToken.mutate(undefined, {
      onSuccess: () => showToast('success', BILLING_SETTINGS_COPY.webhookCopiedToast),
    });
  }, [rotateToken]);

  /**
   * The A1 correction. Its own handler, deliberately kept out of
   * {@link handleSubmit}: if the rewrite were reachable from Save, an Admin
   * editing their invoice footer would silently migrate their SAC codes, which
   * is the exact outcome the opt-in decision exists to prevent.
   */
  const handleUpdateSacCodes = useCallback(() => {
    updateSacCodes.mutate(undefined, {
      onSuccess: () =>
        showToast('success', BILLING_SETTINGS_COPY.sacUpdateSuccessToast),
      onError: () => showToast('error', BILLING_SETTINGS_COPY.sacUpdateErrorToast),
    });
  }, [updateSacCodes]);

  // --- Gates, before any field is rendered ---

  if (isPermissionLoading || settingsQuery.isLoading) {
    return (
      <View style={styles.centered} testID="billing-settings-loading">
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  if (!canManageSettings) {
    // MANAGE_CLINIC_SETTINGS is missing: show why, not an empty form that would
    // 403 only after a live secret had been typed into it.
    return (
      <View style={styles.centered} testID="billing-settings-access-denied">
        <EmptyState
          title={BILLING_SETTINGS_COPY.accessDeniedTitle}
          description={BILLING_SETTINGS_COPY.accessDeniedBody}
        />
      </View>
    );
  }

  if (settingsQuery.isError) {
    return (
      <View style={styles.centered} testID="billing-settings-error">
        <EmptyState
          title={BILLING_SETTINGS_COPY.loadErrorTitle}
          description={BILLING_SETTINGS_COPY.loadErrorBody}
          actionLabel="Retry"
          onAction={() => void settingsQuery.refetch()}
        />
      </View>
    );
  }

  const settings = settingsQuery.data;
  // `null` for every clinic seeded on or after 2026-08-14, which is why there
  // is no "up to date" variant: a clinic with nothing to correct never learns
  // this concept exists.
  const sacNotice = legacySacNotice(settings?.legacySacCodeCount ?? 0);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      testID="billing-settings-screen"
    >
      {/* ── Section 1 ─────────────────────────────────────────────────── */}
      <Text variant="titleMedium" style={styles.sectionHeading}>
        Clinic Details (Invoice Header)
      </Text>

      <View style={styles.fieldGroup}>
        <Text variant="labelLarge" style={styles.fieldLabel}>
          GSTIN Number (optional)
        </Text>
        <RNTextInput
          value={values.gstin}
          onChangeText={(text) => setField('gstin', text.toUpperCase())}
          placeholder="Enter GSTIN"
          placeholderTextColor={COLORS.onSurfaceVariant}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={15}
          style={[
            styles.textInput,
            gstinFieldError(values.gstin) ? styles.textInputError : null,
          ]}
          testID="gstin-input"
        />
        {(gstinFieldError(values.gstin) ?? errors.gstin) && (
          <Text variant="bodySmall" style={styles.errorText} testID="gstin-error">
            {gstinFieldError(values.gstin) ?? errors.gstin}
          </Text>
        )}
      </View>

      <View style={styles.toggleRow}>
        <View style={styles.toggleTextColumn}>
          <Text variant="bodyLarge" style={styles.fieldLabel}>
            {BILLING_SETTINGS_COPY.gstEnabledLabel}
          </Text>
          <Text variant="bodySmall" style={styles.caption} testID="gst-threshold-caption">
            GST registration is mandatory only above ₹20 lakh annual turnover. If your
            clinic is not registered, do not collect GST.
          </Text>
        </View>
        <Switch
          value={values.gstEnabled}
          onValueChange={(next) => setField('gstEnabled', next)}
          disabled={!isGstinValid && !values.gstEnabled}
          color={COLORS.primary}
          testID="gst-enabled-switch"
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text
          variant="labelLarge"
          style={[styles.fieldLabel, !isGstinValid && styles.disabledLabel]}
        >
          Default GST Rate (%)
        </Text>
        {/*
          A chip row rather than a numeric input: `defaultGstRate` must be one of
          the current slabs, and free numeric entry is what lets a retired 12 or
          28 reach a catalog row and freeze a wrong rate onto an invoice.
        */}
        <View style={styles.slabRow}>
          {GST_RATE_OPTIONS.map((slab) => {
            const selected = values.defaultGstRate === slab;
            return (
              <PaperButton
                key={slab}
                mode={selected ? 'contained' : 'outlined'}
                compact
                disabled={!isGstinValid}
                onPress={() => setField('defaultGstRate', selected ? null : slab)}
                buttonColor={selected ? COLORS.primary : undefined}
                textColor={selected ? '#FFFFFF' : COLORS.onSurface}
                testID={`gst-rate-option-${slab}`}
              >
                {`${slab}%`}
              </PaperButton>
            );
          })}
        </View>
        {!isGstinValid && (
          <Text variant="bodySmall" style={styles.caption} testID="gst-rate-locked-helper">
            {BILLING_SETTINGS_COPY.gstRateLockedHelper}
          </Text>
        )}
      </View>

      {/*
        ── Follow-up A1: the opt-in SAC correction ──────────────────────

        Rendered only when this clinic actually has legacy codes, and phrased so
        that leaving them alone reads as a legitimate choice rather than an
        unfinished task. The rewrite is a separate button with a separate
        endpoint; nothing about Save touches it.
      */}
      {sacNotice !== null && (
        <View style={styles.fieldGroup} testID="sac-notice">
          <Text variant="titleMedium" style={styles.sacNoticeHeading}>
            {BILLING_SETTINGS_COPY.sacSectionHeading}
          </Text>
          <Text variant="labelLarge" style={styles.fieldLabel}>
            {sacNotice.title}
          </Text>
          <Text variant="bodySmall" style={styles.caption} testID="sac-notice-body">
            {sacNotice.body}
          </Text>
          <PaperButton
            mode="outlined"
            onPress={handleUpdateSacCodes}
            loading={updateSacCodes.isPending}
            disabled={updateSacCodes.isPending}
            textColor={COLORS.primary}
            style={styles.sacButton}
            testID="sac-update-button"
          >
            {sacNotice.actionLabel}
          </PaperButton>
        </View>
      )}

      {/* ── Section 2 ─────────────────────────────────────────────────── */}
      <Text variant="titleMedium" style={styles.sectionHeading}>
        Invoice Defaults
      </Text>

      <View style={styles.fieldGroup}>
        <Text variant="labelLarge" style={styles.fieldLabel}>
          Default Due Date (days)
        </Text>
        <RNTextInput
          value={values.defaultDueDays}
          onChangeText={(text) => setField('defaultDueDays', text.replace(/[^0-9]/g, ''))}
          placeholder="0"
          placeholderTextColor={COLORS.onSurfaceVariant}
          keyboardType="number-pad"
          maxLength={3}
          style={styles.textInput}
          testID="due-days-input"
        />
        <Text variant="bodySmall" style={styles.caption}>
          Number of days from invoice date. 0 = due on invoice date.
        </Text>
        {errors.defaultDueDays && (
          <Text variant="bodySmall" style={styles.errorText}>
            {errors.defaultDueDays}
          </Text>
        )}
      </View>

      <View style={styles.fieldGroup}>
        <Text variant="labelLarge" style={styles.fieldLabel}>
          Bank Account Details (optional)
        </Text>
        <RNTextInput
          value={values.bankDetails}
          onChangeText={(text) => setField('bankDetails', text)}
          placeholder="Account details shown on invoice..."
          placeholderTextColor={COLORS.onSurfaceVariant}
          multiline
          style={[styles.textInput, styles.multiline]}
          testID="bank-details-input"
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text variant="labelLarge" style={styles.fieldLabel}>
          Invoice Footer Text (optional)
        </Text>
        <RNTextInput
          value={values.invoiceFooterText}
          onChangeText={(text) => setField('invoiceFooterText', text)}
          placeholder="Terms and conditions, thank you message..."
          placeholderTextColor={COLORS.onSurfaceVariant}
          multiline
          style={[styles.textInput, styles.multiline]}
          testID="invoice-footer-input"
        />
      </View>

      {/* ── Section 3 ─────────────────────────────────────────────────── */}
      <Text variant="titleMedium" style={styles.sectionHeading}>
        Payment Gateway
      </Text>

      <RazorpayConfigSection
        keyId={values.razorpayKeyId}
        onKeyIdChange={(text) => setField('razorpayKeyId', text)}
        hasRazorpayKeySecret={values.hasStoredKeySecret}
        hasRazorpayWebhookSecret={values.hasStoredWebhookSecret}
        onKeySecretChange={(next) => setField('razorpayKeySecret', next)}
        onWebhookSecretChange={(next) => setField('razorpayWebhookSecret', next)}
        testMode={values.razorpayTestMode}
        onTestModeChange={(next) => setField('razorpayTestMode', next)}
        webhookUrl={settings?.webhookUrl ?? null}
        webhookConfigured={settings?.webhookConfigured ?? false}
        onCopyWebhookUrl={handleCopyWebhookUrl}
        onRotateWebhookToken={handleRotate}
        isRotating={rotateToken.isPending}
        testID="razorpay-config-section"
      />

      {errors._form && (
        <Text variant="bodySmall" style={styles.errorText} testID="settings-form-error">
          {errors._form}
        </Text>
      )}

      <PaperButton
        mode="contained"
        onPress={handleSubmit}
        loading={updateSettings.isPending}
        disabled={updateSettings.isPending}
        buttonColor={COLORS.primary}
        textColor="#FFFFFF"
        style={styles.saveButton}
        testID="save-settings-button"
      >
        Save Settings
      </PaperButton>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  content: {
    paddingVertical: 16,
    paddingBottom: 48,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
  },
  sectionHeading: {
    color: COLORS.onSurface,
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 12,
  },
  fieldGroup: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  fieldLabel: {
    color: COLORS.onSurface,
    marginBottom: 4,
  },
  disabledLabel: {
    color: COLORS.onSurfaceVariant,
  },
  caption: {
    color: COLORS.onSurfaceVariant,
    marginTop: 4,
  },
  errorText: {
    color: COLORS.error,
    marginTop: 4,
    paddingHorizontal: 16,
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
  textInputError: {
    borderColor: COLORS.error,
  },
  multiline: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  slabRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 16,
    gap: 12,
  },
  toggleTextColumn: {
    flex: 1,
  },
  saveButton: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
  },
  sacNoticeHeading: {
    color: COLORS.onSurface,
    marginTop: 8,
    marginBottom: 8,
  },
  sacButton: {
    marginTop: 12,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
});
