import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, TextInput, Button } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BottomSheet, colors } from '@breeyo/ui';
import type { WaNumberStatus } from '@breeyo/types';
import { useSetOwnerPreference } from '../hooks/useOwnerPreference';
import { WA_COLORS } from '../utils/whatsapp-format';

/**
 * WHA-05 / D-11: the staff-facing owner preference sheet.
 *
 * D-24 (locked after 07-16-PLAN.md was written): WhatsApp consent capture
 * has no UI trigger anywhere in Phase 7 -- there is no consent grant/withdraw
 * hook in `useOwnerPreference.ts` (see that file's own header comment) and no
 * `POST /whatsapp/owners/:ownerId/consent` route for one to call. This sheet
 * therefore implements exactly TWO staff actions, not three: (1) toggle an
 * owner's reminders opted-out state, and (2) mark the owner's number invalid
 * and correct it. There is no consent record/withdraw control here.
 *
 * Number correction: `PATCH /whatsapp/owners/:ownerId/preference`
 * (`OwnerPreferenceInput`, `packages/types/src/whatsapp.ts`) carries
 * `numberStatus` but has no field for the owner's actual mobile digits --
 * there is no `PATCH /owners/:ownerId` route anywhere in this codebase
 * (Owner.mobile is Patient/Registration module data; only
 * `PATCH /pets/:petId` exists, per `patient.routes.ts`). "Correct the
 * number" in this sheet therefore means: staff re-enters the number using
 * the same `/^[6-9]\d{9}$/` validation and `formatMobile`/`extractDigits`
 * shape `CheckInSheet.tsx:19-29` uses, confirming it now looks like a real
 * Indian mobile number, and Save clears the `INVALID` flag via this same
 * preference endpoint (`numberStatus: 'VALID'`) so WhatsApp retries are no
 * longer blocked. Persisting a changed number back onto the `Owner` record
 * itself is out of this endpoint's scope and is not attempted here.
 */
export interface OwnerPreferenceSheetProps {
  visible: boolean;
  onDismiss: () => void;
  owner: { id: string; name: string; mobile: string };
  remindersOptedOut: boolean;
  numberStatus: WaNumberStatus;
  onUpdated?: () => void;
}

type SheetMode = 'main' | 'confirmStop' | 'confirmMarkInvalid' | 'correctNumber';

const STOP_CONFIRM_COPY =
  'Stop reminders for this owner? Non-essential reminders will no longer be sent.';
const MARK_INVALID_CONFIRM_COPY =
  'Mark this number invalid? Staff must correct it before WhatsApp retries.';
const NUMBER_INVALID_WARNING =
  'This mobile number may not be on WhatsApp. Correct the number before retrying.';
const TRANSACTIONAL_CARVE_OUT_COPY =
  'Stopping reminders silences reminder-category templates only (Follow-up reminder, Vaccine due, Deworming due, Payment reminder). Transactional messages -- Invoice delivery and Booking confirmation -- still go out.';

/** Copies `CheckInSheet.tsx:19-29`'s exact mobile display/parse shape. */
function formatMobile(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 10);
  if (digits.length > 5) {
    return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  return digits;
}

function extractDigits(formatted: string): string {
  return formatted.replace(/\D/g, '');
}

export function OwnerPreferenceSheet({
  visible,
  onDismiss,
  owner,
  remindersOptedOut,
  numberStatus,
  onUpdated,
}: OwnerPreferenceSheetProps) {
  const [mode, setMode] = useState<SheetMode>('main');
  const [mobileDisplay, setMobileDisplay] = useState('');

  const setPreference = useSetOwnerPreference(undefined);

  // Reset-on-close (CheckInSheet.tsx idiom): never leak a half-typed
  // correction or a stale sub-mode into the next owner this sheet opens for.
  useEffect(() => {
    if (!visible) {
      setMode('main');
      setMobileDisplay('');
    }
  }, [visible]);

  const closeToMain = useCallback(() => setMode('main'), []);

  const handleStopReminders = useCallback(() => {
    setPreference.mutate(
      { ownerId: owner.id, remindersOptedOut: true, source: 'STAFF', numberStatus },
      { onSuccess: () => { setMode('main'); onUpdated?.(); } },
    );
  }, [setPreference, owner.id, numberStatus, onUpdated]);

  // Resuming reminders reverses a reversible, non-destructive state -- no
  // UI-SPEC destructive confirmation exists for this direction.
  const handleResumeReminders = useCallback(() => {
    setPreference.mutate(
      { ownerId: owner.id, remindersOptedOut: false, source: 'STAFF', numberStatus },
      { onSuccess: () => onUpdated?.() },
    );
  }, [setPreference, owner.id, numberStatus, onUpdated]);

  const handleMarkInvalid = useCallback(() => {
    setPreference.mutate(
      { ownerId: owner.id, remindersOptedOut, source: 'STAFF', numberStatus: 'INVALID' },
      { onSuccess: () => { setMode('main'); onUpdated?.(); } },
    );
  }, [setPreference, owner.id, remindersOptedOut, onUpdated]);

  const openCorrectNumber = useCallback(() => {
    setMobileDisplay(formatMobile(owner.mobile));
    setMode('correctNumber');
  }, [owner.mobile]);

  const correctedDigits = extractDigits(mobileDisplay);
  const isCorrectedMobileValid = /^[6-9]\d{9}$/.test(correctedDigits);

  const handleSaveCorrection = useCallback(() => {
    if (!isCorrectedMobileValid) return;
    setPreference.mutate(
      { ownerId: owner.id, remindersOptedOut, source: 'STAFF', numberStatus: 'VALID' },
      { onSuccess: () => { setMode('main'); onUpdated?.(); } },
    );
  }, [setPreference, owner.id, remindersOptedOut, isCorrectedMobileValid, onUpdated]);

  const isBusy = setPreference.isPending;

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} title="Owner Preferences">
      <View style={styles.header}>
        <Text variant="titleMedium">{owner.name}</Text>
        <Text variant="bodySmall" style={styles.mobileText}>
          {formatMobile(owner.mobile)}
        </Text>
      </View>

      {mode === 'main' && (
        <View style={styles.body}>
          {/* Reminders section */}
          <View style={styles.section}>
            <Text variant="labelMedium" style={styles.sectionLabel}>
              Reminders
            </Text>
            {remindersOptedOut ? (
              <>
                <View style={styles.warningRow} accessibilityLabel="Reminders stopped for this owner">
                  <MaterialCommunityIcons name="bell-off" size={20} color={WA_COLORS.failed} />
                  <Text variant="bodyMedium" style={styles.destructiveText}>
                    Reminders stopped for this owner
                  </Text>
                </View>
                <Button
                  mode="outlined"
                  onPress={handleResumeReminders}
                  loading={isBusy}
                  disabled={isBusy}
                  accessibilityRole="button"
                  accessibilityLabel="Resume Reminders"
                  accessibilityState={{ disabled: isBusy, busy: isBusy }}
                  contentStyle={styles.buttonContent}
                  testID="owner-preference-resume-reminders"
                >
                  Resume Reminders
                </Button>
              </>
            ) : (
              <Button
                mode="contained"
                buttonColor={WA_COLORS.failed}
                onPress={() => setMode('confirmStop')}
                disabled={isBusy}
                accessibilityRole="button"
                accessibilityLabel="Stop Reminders"
                accessibilityState={{ disabled: isBusy }}
                contentStyle={styles.buttonContent}
                testID="owner-preference-stop-reminders"
              >
                Stop Reminders
              </Button>
            )}
            <Text variant="bodySmall" style={styles.helperText}>
              {TRANSACTIONAL_CARVE_OUT_COPY}
            </Text>
          </View>

          {/* Mobile number section */}
          <View style={styles.section}>
            <Text variant="labelMedium" style={styles.sectionLabel}>
              Mobile number
            </Text>
            {numberStatus === 'INVALID' ? (
              <>
                <View style={styles.warningRow} accessibilityLabel="Mobile number may be invalid">
                  <MaterialCommunityIcons name="alert-circle" size={20} color={WA_COLORS.failed} />
                  <Text variant="bodyMedium" style={styles.destructiveText}>
                    {NUMBER_INVALID_WARNING}
                  </Text>
                </View>
                <Button
                  mode="contained"
                  buttonColor={WA_COLORS.delivered}
                  onPress={openCorrectNumber}
                  disabled={isBusy}
                  accessibilityRole="button"
                  accessibilityLabel="Correct Number"
                  accessibilityState={{ disabled: isBusy }}
                  contentStyle={styles.buttonContent}
                  testID="owner-preference-correct-number"
                >
                  Correct Number
                </Button>
              </>
            ) : (
              <Button
                mode="outlined"
                onPress={() => setMode('confirmMarkInvalid')}
                disabled={isBusy}
                accessibilityRole="button"
                accessibilityLabel="Mark Number Invalid"
                accessibilityState={{ disabled: isBusy }}
                contentStyle={styles.buttonContent}
                testID="owner-preference-mark-invalid"
              >
                Mark Number Invalid
              </Button>
            )}
          </View>
        </View>
      )}

      {mode === 'confirmStop' && (
        <View style={styles.body}>
          <Text variant="bodyMedium" style={styles.confirmText}>
            {STOP_CONFIRM_COPY}
          </Text>
          <View style={styles.actionsRow}>
            <Button
              mode="outlined"
              onPress={closeToMain}
              disabled={isBusy}
              accessibilityRole="button"
              accessibilityLabel="Keep Reminders"
              contentStyle={styles.buttonContent}
              testID="owner-preference-keep-reminders"
            >
              Keep Reminders
            </Button>
            <Button
              mode="contained"
              buttonColor={WA_COLORS.failed}
              onPress={handleStopReminders}
              loading={isBusy}
              disabled={isBusy}
              accessibilityRole="button"
              accessibilityLabel="Stop Reminders"
              accessibilityState={{ disabled: isBusy, busy: isBusy }}
              contentStyle={styles.buttonContent}
              testID="owner-preference-confirm-stop-reminders"
            >
              Stop Reminders
            </Button>
          </View>
        </View>
      )}

      {mode === 'confirmMarkInvalid' && (
        <View style={styles.body}>
          <Text variant="bodyMedium" style={styles.confirmText}>
            {MARK_INVALID_CONFIRM_COPY}
          </Text>
          <View style={styles.actionsRow}>
            <Button
              mode="outlined"
              onPress={closeToMain}
              disabled={isBusy}
              accessibilityRole="button"
              accessibilityLabel="Keep Number"
              contentStyle={styles.buttonContent}
              testID="owner-preference-keep-number"
            >
              Keep Number
            </Button>
            <Button
              mode="contained"
              buttonColor={WA_COLORS.failed}
              onPress={handleMarkInvalid}
              loading={isBusy}
              disabled={isBusy}
              accessibilityRole="button"
              accessibilityLabel="Mark Invalid"
              accessibilityState={{ disabled: isBusy, busy: isBusy }}
              contentStyle={styles.buttonContent}
              testID="owner-preference-confirm-mark-invalid"
            >
              Mark Invalid
            </Button>
          </View>
        </View>
      )}

      {mode === 'correctNumber' && (
        <View style={styles.body}>
          <Text variant="bodyMedium" style={styles.helperText}>
            Enter the correct 10-digit mobile number. Saving clears the invalid flag so WhatsApp
            retries can proceed.
          </Text>
          <TextInput
            label="Mobile Number"
            value={mobileDisplay}
            onChangeText={(text) => setMobileDisplay(formatMobile(text))}
            keyboardType="phone-pad"
            maxLength={11}
            placeholder="Enter 10-digit mobile number"
            left={<TextInput.Icon icon="phone" />}
            error={mobileDisplay.length > 0 && !isCorrectedMobileValid}
            style={styles.mobileInput}
            testID="owner-preference-correction-input"
          />
          {mobileDisplay.length > 0 && !isCorrectedMobileValid && (
            <Text variant="bodySmall" style={styles.destructiveText}>
              Enter a valid 10-digit Indian mobile number starting with 6-9.
            </Text>
          )}
          <View style={styles.actionsRow}>
            <Button
              mode="outlined"
              onPress={closeToMain}
              disabled={isBusy}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              contentStyle={styles.buttonContent}
              testID="owner-preference-cancel-correction"
            >
              Cancel
            </Button>
            <Button
              mode="contained"
              buttonColor={WA_COLORS.delivered}
              onPress={handleSaveCorrection}
              loading={isBusy}
              disabled={isBusy || !isCorrectedMobileValid}
              accessibilityRole="button"
              accessibilityLabel="Save Number"
              accessibilityState={{ disabled: isBusy || !isCorrectedMobileValid, busy: isBusy }}
              contentStyle={styles.buttonContent}
              testID="owner-preference-save-correction"
            >
              Save Number
            </Button>
          </View>
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 16,
  },
  mobileText: {
    color: '#49454F',
    marginTop: 2,
  },
  body: {
    gap: 20,
  },
  section: {
    gap: 8,
  },
  sectionLabel: {
    color: colors.secondary,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  destructiveText: {
    color: WA_COLORS.failed,
    flex: 1,
  },
  helperText: {
    color: '#49454F',
  },
  confirmText: {
    color: '#1C1B1F',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  buttonContent: {
    minHeight: 44,
  },
  mobileInput: {
    backgroundColor: WA_COLORS.background,
  },
});
