import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, StyleSheet, BackHandler } from 'react-native';
import { Text, TextInput, Button, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BottomSheet } from '@breeyo/ui';
import { WA_TEMPLATE_STAFF_NAMES, WA_TEMPLATE_CATEGORIES } from '@breeyo/types';
import type { WaContextType, WaTemplateKey } from '@breeyo/types';
import { useSendTemplate } from '../hooks/useSendTemplate';
import { WA_COLORS } from '../utils/whatsapp-format';

/**
 * WHA-02 / D-10, D-13, D-18: the single context-send bottom sheet UI-SPEC
 * launches from invoice detail, pet profile, reminder cards, booking
 * records, and document views (07-16 wires each of those five surfaces to
 * this one component with different props rather than five bespoke sheets).
 */
export interface TemplateSendSheetProps {
  visible: boolean;
  onDismiss: () => void;
  templateKey: WaTemplateKey;
  owner: { id: string; name: string; mobile: string };
  pet?: { id: string; name: string };
  contextType: WaContextType;
  contextId?: string;
  prefilledVariables: Record<string, string>;
  /** D-13: missing consent is advisory only -- Send stays enabled. */
  consentWarning?: boolean;
  /** D-10/D-11: reminder-category templates are refused server-side for an
   * opted-out owner; transactional templates are always attempted. */
  optedOut?: boolean;
  /** UI-SPEC invalid-number warning -- destructive red, steers staff to
   * correct the number before retrying. */
  numberInvalid?: boolean;
  onSuccess?: (messageId: string) => void;
}

const STAFF_NOTE_MAX = 500;

const OPTED_OUT_COPY =
  'Owner has opted out of reminders. Transactional messages still need staff review.';
const NUMBER_INVALID_COPY =
  'This mobile number may not be on WhatsApp. Correct the number before retrying.';

function formatMobileDisplay(mobile: string): string {
  const digits = mobile.replace(/\D/g, '');
  const last10 = digits.slice(-10);
  if (last10.length === 10) {
    return `${last10.slice(0, 5)} ${last10.slice(5)}`;
  }
  return mobile;
}

export function TemplateSendSheet({
  visible,
  onDismiss,
  templateKey,
  owner,
  pet,
  contextType,
  contextId,
  prefilledVariables,
  consentWarning,
  optedOut,
  numberInvalid,
  onSuccess,
}: TemplateSendSheetProps) {
  const [staffNote, setStaffNote] = useState('');
  const sendMutation = useSendTemplate(undefined);

  // Reset-on-close (CheckInSheet.tsx idiom): local staff-entered state must
  // never leak into the next recipient/template this sheet is opened for.
  useEffect(() => {
    if (!visible) {
      setStaffNote('');
      sendMutation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // UI-SPEC Accessibility Contract: "Android hardware back ... from bottom
  // sheet it dismisses the sheet first." Handled here, not by the caller
  // screen, so every one of the five launch surfaces gets this for free.
  useEffect(() => {
    if (!visible) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onDismiss();
      return true;
    });
    return () => subscription.remove();
  }, [visible, onDismiss]);

  const templateName = WA_TEMPLATE_STAFF_NAMES[templateKey];
  const templateCategory = WA_TEMPLATE_CATEGORIES[templateKey];

  // Screen States Contract: "Disabled send until recipient/template loaded."
  // owner/templateKey are required props, but a caller may still pass a
  // placeholder owner (empty id) while its own fetch is in flight -- that
  // case must render the loading/disabled state, not a broken send.
  const isRecipientLoaded = !!owner?.id && !!owner?.mobile;
  const isTemplateLoaded = !!templateKey && !!templateName;
  const isLoaded = isRecipientLoaded && isTemplateLoaded;

  // D-10/D-11: an opted-out owner blocks Send only for REMINDER-category
  // templates -- the server would refuse it with 403 either way, but
  // disabling here avoids a round trip for the common case. TRANSACTIONAL
  // templates (invoice_delivery, booking_confirmation) stay enabled because
  // D-10 always attempts them regardless of STOP status.
  const blockedByOptOut = !!optedOut && templateCategory === 'REMINDER';

  const isSendDisabled = !isLoaded || blockedByOptOut || sendMutation.isPending;

  const variableEntries = useMemo(
    () => Object.entries(prefilledVariables ?? {}),
    [prefilledVariables],
  );

  const handleStaffNoteChange = useCallback((text: string) => {
    setStaffNote(text.slice(0, STAFF_NOTE_MAX));
  }, []);

  const handleSend = useCallback(async () => {
    if (isSendDisabled) return;

    try {
      const result = await sendMutation.mutateAsync({
        ownerId: owner.id,
        waPhone: owner.mobile,
        templateKey,
        variables: prefilledVariables,
        contextType,
        contextId,
        petId: pet?.id,
        staffNote: staffNote.trim() ? staffNote.trim() : undefined,
      });
      onSuccess?.(result.data.messageId);
      onDismiss();
    } catch {
      // Failure copy + haptics are handled inside useSendTemplate's onError;
      // the sheet also renders an inline error below (Screen States Contract).
    }
  }, [
    isSendDisabled,
    sendMutation,
    owner.id,
    owner.mobile,
    templateKey,
    prefilledVariables,
    contextType,
    contextId,
    pet?.id,
    staffNote,
    onSuccess,
    onDismiss,
  ]);

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} title="Send Template">
      {!isLoaded ? (
        <View style={styles.loadingContainer} accessibilityLabel="Loading recipient and template">
          <ActivityIndicator size="small" />
          <Text variant="bodySmall" style={styles.loadingText}>
            Loading recipient and template...
          </Text>
        </View>
      ) : (
        <>
          {/* Recipient */}
          <View style={styles.section}>
            <Text variant="labelMedium" style={styles.sectionLabel}>
              Sending to
            </Text>
            <Text variant="titleMedium">{owner.name}</Text>
            <Text variant="bodySmall" style={styles.mobileText}>
              {formatMobileDisplay(owner.mobile)}
            </Text>
            {pet && (
              <Text variant="bodySmall" style={styles.petText}>
                For {pet.name}
              </Text>
            )}
          </View>

          {/* Template name -- staff-facing name from WA_TEMPLATE_STAFF_NAMES,
              never the raw registry key. */}
          <View style={styles.section}>
            <Text variant="labelMedium" style={styles.sectionLabel}>
              Template
            </Text>
            <Text variant="titleMedium">{templateName}</Text>
          </View>

          {/* Variables preview */}
          {variableEntries.length > 0 && (
            <View style={styles.section}>
              <Text variant="labelMedium" style={styles.sectionLabel}>
                Message details
              </Text>
              {variableEntries.map(([key, value]) => (
                <View key={key} style={styles.variableRow}>
                  <Text variant="bodySmall" style={styles.variableKey}>
                    {key.replace(/_/g, ' ')}
                  </Text>
                  <Text variant="bodySmall" style={styles.variableValue}>
                    {value}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/*
            D-18: invoice_delivery is link-only in Beta (payment link +
            invoice number/amount as template variables) -- there is no PDF
            or other media reference to attach, so an attachment preview
            never renders here rather than implying one exists. If a real
            media reference is ever plumbed in, it belongs in this same
            gated slot (mirrors MessageBubble.tsx's `hasMedia` gate).
          */}

          {/* Staff note -- strictly additive; there is no field that edits
              or replaces the fixed, server-rendered template body. */}
          <View style={styles.section}>
            <TextInput
              label="Staff note (optional)"
              value={staffNote}
              onChangeText={handleStaffNoteChange}
              multiline
              maxLength={STAFF_NOTE_MAX}
              placeholder="Add a note for the record (does not change the template message)"
              style={styles.noteInput}
              testID="template-send-staff-note"
            />
            <Text variant="bodySmall" style={styles.noteCounter}>
              {staffNote.length}/{STAFF_NOTE_MAX}
            </Text>
          </View>

          {/* Consent / preference warnings -- three distinct behaviors. */}
          {consentWarning && (
            <View style={styles.warningRow} accessibilityLabel="Consent not on record">
              <MaterialCommunityIcons name="information" size={20} color={WA_COLORS.sent} />
              <Text variant="bodySmall" style={styles.consentWarningText}>
                No WhatsApp consent on record for this owner yet. You can still send -- this is
                for audit visibility only.
              </Text>
            </View>
          )}

          {optedOut && (
            <View style={styles.warningRow} accessibilityLabel="Owner opted out of reminders">
              <MaterialCommunityIcons name="bell-off" size={20} color={WA_COLORS.failed} />
              <Text variant="bodySmall" style={styles.destructiveWarningText}>
                {OPTED_OUT_COPY}
              </Text>
            </View>
          )}

          {numberInvalid && (
            <View style={styles.warningRow} accessibilityLabel="Mobile number may be invalid">
              <MaterialCommunityIcons name="alert-circle" size={20} color={WA_COLORS.failed} />
              <Text variant="bodySmall" style={styles.destructiveWarningText}>
                {NUMBER_INVALID_COPY}
              </Text>
            </View>
          )}

          {/* Screen States Contract: inline field/action error next to the
              failed dependency rather than a full-screen error. */}
          {sendMutation.isError && (
            <Text variant="bodySmall" style={styles.destructiveWarningText}>
              Could not send. Check the details above and try again.
            </Text>
          )}

          <Button
            mode="contained"
            onPress={handleSend}
            disabled={isSendDisabled}
            loading={sendMutation.isPending}
            style={styles.sendButton}
            contentStyle={styles.sendButtonContent}
            accessibilityRole="button"
            accessibilityLabel="Send Template"
            accessibilityState={{ disabled: isSendDisabled, busy: sendMutation.isPending }}
            testID="template-send-button"
          >
            Send Template
          </Button>
        </>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 24,
    justifyContent: 'center',
  },
  loadingText: {
    color: '#49454F',
  },
  section: {
    marginBottom: 16,
  },
  sectionLabel: {
    color: '#5D4037',
    marginBottom: 4,
  },
  mobileText: {
    color: '#49454F',
  },
  petText: {
    color: '#49454F',
    marginTop: 2,
  },
  variableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    gap: 12,
  },
  variableKey: {
    color: '#79747E',
    textTransform: 'capitalize',
    flexShrink: 1,
  },
  variableValue: {
    color: '#1C1B1F',
    fontWeight: '500',
    flexShrink: 1,
    textAlign: 'right',
  },
  noteInput: {
    backgroundColor: WA_COLORS.background,
  },
  noteCounter: {
    color: '#79747E',
    textAlign: 'right',
    marginTop: 2,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 12,
  },
  consentWarningText: {
    color: '#5D4037',
    flex: 1,
  },
  destructiveWarningText: {
    color: WA_COLORS.failed,
    flex: 1,
  },
  sendButton: {
    marginTop: 8,
  },
  sendButtonContent: {
    minHeight: 44,
  },
});
