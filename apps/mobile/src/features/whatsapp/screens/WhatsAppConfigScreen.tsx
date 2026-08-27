import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Text, Switch, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button, SkeletonLoader, EmptyState, colors } from '@breeyo/ui';
import { WA_ESCALATION } from '@breeyo/types';
import type { ClinicConfigInput, WaDeliveryMode } from '@breeyo/types';
import { ApiClientError } from '../../../lib/api';
import { useSimulatorConfig, useUpdateSimulatorConfig } from '../hooks/useSimulatorConfig';
import { SimulatorControlCard } from '../components/SimulatorControlCard';

/**
 * WHA-05 / D-14, D-16, D-20: the Admin-only simulator/provider config
 * screen. `app/(app)/whatsapp/config.tsx` gates the route with
 * `canAccessWhatsAppConfig` (client usability gate); the server
 * independently enforces `MANAGE_CLINIC_SETTINGS` (D-20), and a 403 here is
 * surfaced as a clear Admin-only message rather than the generic error copy.
 *
 * Implements all four UI-SPEC Screen States Contract states for Config:
 * skeleton config cards while loading, `Simulator not configured yet` with
 * a setup CTA, the populated form, and `Could not load WhatsApp settings.
 * Try again.` on error. `ClinicConfigService.getConfig` (API, D-16) always
 * read-or-creates a row, so the empty state is unreachable through today's
 * API -- it is still implemented defensively (a successful fetch that
 * somehow resolves with no data) so the contract holds even if that
 * guarantee ever changes.
 */
const AUTO_REPLY_DELAY_MIN = 3;
const AUTO_REPLY_DELAY_MAX = 60;
const AUTO_REPLY_DELAY_STEP = 1;
const SLOT_DURATION_MIN = 10;
const SLOT_DURATION_MAX = 120;
const SLOT_DURATION_STEP = 5;

const EMPTY_TITLE = 'Simulator not configured yet';
const EMPTY_BODY =
  'Set up the simulator to control delivery mode, auto-reply, and slot length for this clinic.';
const ERROR_COPY = 'Could not load WhatsApp settings. Try again.';
const ADMIN_ONLY_ERROR_COPY = 'Only an Admin can view or change WhatsApp simulator settings.';

/** Beta defaults (matches `WA_SIMULATOR_DEFAULTS`/`WhatsAppRepository.getOrCreateClinicConfig`),
 * used only by the defensive "Set Up Simulator" CTA above. */
const DEFAULT_CONFIG: ClinicConfigInput = {
  provider: 'simulator',
  deliveryMode: 'NORMAL',
  autoReplyEnabled: true,
  autoReplyDelaySeconds: 10,
  allowFreeformOutsideWindow: false,
  slotDurationMinutes: 30,
};

export function WhatsAppConfigScreen() {
  const { data, isLoading, isError, error, refetch } = useSimulatorConfig();
  const updateConfig = useUpdateSimulatorConfig();

  // Local optimistic-friendly draft: the stepper/toggle controls update this
  // immediately so the UI never waits on a round trip, while the mutation
  // itself carries the source of truth via `useUpdateSimulatorConfig`'s own
  // optimistic/rollback shape.
  const [draft, setDraft] = useState<ClinicConfigInput | null>(null);

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const isAdminOnlyError = isError && error instanceof ApiClientError && error.status === 403;

  const handleDeliveryModeChange = (mode: WaDeliveryMode) => {
    if (!draft) return;
    setDraft({ ...draft, deliveryMode: mode });
    updateConfig.mutate({ deliveryMode: mode });
  };

  const handleAutoReplyToggle = (enabled: boolean) => {
    if (!draft) return;
    setDraft({ ...draft, autoReplyEnabled: enabled });
    updateConfig.mutate({ autoReplyEnabled: enabled });
  };

  // D-14: the bound is enforced here BEFORE the request is ever built, so a
  // rejected out-of-range value is structurally impossible to submit -- not
  // merely caught after a 400 comes back.
  const handleDelayChange = (delta: number) => {
    if (!draft) return;
    const next = Math.min(
      AUTO_REPLY_DELAY_MAX,
      Math.max(AUTO_REPLY_DELAY_MIN, draft.autoReplyDelaySeconds + delta),
    );
    if (next === draft.autoReplyDelaySeconds) return;
    setDraft({ ...draft, autoReplyDelaySeconds: next });
    updateConfig.mutate({ autoReplyDelaySeconds: next });
  };

  const handleSlotDurationChange = (delta: number) => {
    if (!draft) return;
    const next = Math.min(
      SLOT_DURATION_MAX,
      Math.max(SLOT_DURATION_MIN, draft.slotDurationMinutes + delta),
    );
    if (next === draft.slotDurationMinutes) return;
    setDraft({ ...draft, slotDurationMinutes: next });
    updateConfig.mutate({ slotDurationMinutes: next });
  };

  const handleSetup = () => {
    setDraft(DEFAULT_CONFIG);
    updateConfig.mutate(DEFAULT_CONFIG);
  };

  if (isLoading) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        testID="whatsapp-config-loading"
      >
        <SkeletonLoader type="card" count={4} />
      </ScrollView>
    );
  }

  if (isError) {
    return (
      <View style={styles.centered} testID="whatsapp-config-error">
        <Text variant="bodyLarge" style={styles.errorText}>
          {isAdminOnlyError ? ADMIN_ONLY_ERROR_COPY : ERROR_COPY}
        </Text>
        <Button
          variant="outlined"
          label="Try Again"
          onPress={() => refetch()}
          testID="whatsapp-config-retry"
        />
      </View>
    );
  }

  if (!draft) {
    return (
      <View style={styles.centered} testID="whatsapp-config-empty">
        <EmptyState
          title={EMPTY_TITLE}
          description={EMPTY_BODY}
          actionLabel="Set Up Simulator"
          onAction={handleSetup}
          testID="whatsapp-config-setup-cta"
        />
      </View>
    );
  }

  const delayAtMin = draft.autoReplyDelaySeconds <= AUTO_REPLY_DELAY_MIN;
  const delayAtMax = draft.autoReplyDelaySeconds >= AUTO_REPLY_DELAY_MAX;
  const slotAtMin = draft.slotDurationMinutes <= SLOT_DURATION_MIN;
  const slotAtMax = draft.slotDurationMinutes >= SLOT_DURATION_MAX;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      testID="whatsapp-config-screen"
    >
      {/* Provider -- UI-SPEC: "Simulator channel must be labeled Simulator
          in config/log surfaces, but normal staff thread views should still
          feel WhatsApp-like." */}
      <View style={styles.section}>
        <Text variant="titleMedium" style={styles.sectionTitle}>
          Provider
        </Text>
        <View style={styles.providerRow}>
          <MaterialCommunityIcons name="cog-outline" size={20} color={colors.secondary} />
          <Text variant="bodyLarge" style={styles.providerLabel}>
            {draft.provider === 'simulator' ? 'Simulator' : 'Cloud API'}
          </Text>
        </View>
        <Text variant="bodySmall" style={styles.helperText}>
          The channel is labelled Simulator here and in log surfaces; normal staff thread views
          still feel WhatsApp-like.
        </Text>
      </View>

      {/* Delivery behavior */}
      <View style={styles.section}>
        <Text variant="titleMedium" style={styles.sectionTitle}>
          Delivery behavior
        </Text>
        <SimulatorControlCard
          value={draft.deliveryMode}
          disabled={updateConfig.isPending}
          onChange={handleDeliveryModeChange}
        />
      </View>

      {/* Auto-reply -- D-14: toggle plus a 3-60s bounded delay, the bound
          shown to the user so a rejected value can never be submitted. */}
      <View style={styles.section}>
        <Text variant="titleMedium" style={styles.sectionTitle}>
          Auto-reply
        </Text>
        <View style={styles.toggleRow}>
          <Text variant="bodyLarge">Simulated owner auto-reply</Text>
          <Switch
            value={draft.autoReplyEnabled}
            onValueChange={handleAutoReplyToggle}
            disabled={updateConfig.isPending}
            accessibilityRole="switch"
            accessibilityLabel="Simulated owner auto-reply"
            accessibilityState={{ disabled: updateConfig.isPending, checked: draft.autoReplyEnabled }}
            color={colors.primary}
          />
        </View>
        <View style={styles.stepperRow}>
          <Text variant="bodyMedium">Auto-reply delay</Text>
          <View style={styles.stepper}>
            <IconButton
              icon="minus"
              size={20}
              onPress={() => handleDelayChange(-AUTO_REPLY_DELAY_STEP)}
              disabled={updateConfig.isPending || delayAtMin}
              accessibilityRole="button"
              accessibilityLabel="Decrease auto-reply delay"
              accessibilityState={{ disabled: updateConfig.isPending || delayAtMin }}
            />
            <Text variant="bodyLarge" style={styles.stepperValue} testID="auto-reply-delay-value">
              {draft.autoReplyDelaySeconds}s
            </Text>
            <IconButton
              icon="plus"
              size={20}
              onPress={() => handleDelayChange(AUTO_REPLY_DELAY_STEP)}
              disabled={updateConfig.isPending || delayAtMax}
              accessibilityRole="button"
              accessibilityLabel="Increase auto-reply delay"
              accessibilityState={{ disabled: updateConfig.isPending || delayAtMax }}
            />
          </View>
        </View>
        <Text variant="bodySmall" style={styles.helperText}>
          Must be between {AUTO_REPLY_DELAY_MIN} and {AUTO_REPLY_DELAY_MAX} seconds.
        </Text>
      </View>

      {/* Booking */}
      <View style={styles.section}>
        <Text variant="titleMedium" style={styles.sectionTitle}>
          Booking
        </Text>
        <View style={styles.stepperRow}>
          <Text variant="bodyMedium">Slot duration</Text>
          <View style={styles.stepper}>
            <IconButton
              icon="minus"
              size={20}
              onPress={() => handleSlotDurationChange(-SLOT_DURATION_STEP)}
              disabled={updateConfig.isPending || slotAtMin}
              accessibilityRole="button"
              accessibilityLabel="Decrease slot duration"
              accessibilityState={{ disabled: updateConfig.isPending || slotAtMin }}
            />
            <Text variant="bodyLarge" style={styles.stepperValue} testID="slot-duration-value">
              {draft.slotDurationMinutes} min
            </Text>
            <IconButton
              icon="plus"
              size={20}
              onPress={() => handleSlotDurationChange(SLOT_DURATION_STEP)}
              disabled={updateConfig.isPending || slotAtMax}
              accessibilityRole="button"
              accessibilityLabel="Increase slot duration"
              accessibilityState={{ disabled: updateConfig.isPending || slotAtMax }}
            />
          </View>
        </View>
        <Text variant="bodySmall" style={styles.helperText}>
          Must be between {SLOT_DURATION_MIN} and {SLOT_DURATION_MAX} minutes.
        </Text>
      </View>

      {/* Reminder defaults -- D-02/D-03: fixed, read-only in Beta. */}
      <View style={styles.section}>
        <Text variant="titleMedium" style={styles.sectionTitle}>
          Reminder defaults
        </Text>
        <Text variant="bodyLarge">
          {WA_ESCALATION.maxAttempts} attempts, {WA_ESCALATION.intervalDays} days apart
        </Text>
        <Text variant="bodySmall" style={styles.helperText}>
          Fixed for Beta -- not configurable.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFBF5',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 48,
    gap: 24,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 16,
    backgroundColor: '#FFFBF5',
  },
  errorText: {
    textAlign: 'center',
    color: '#BA1A1A',
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    color: '#1C1B1F',
    fontWeight: '700',
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  providerLabel: {
    color: '#1C1B1F',
    fontWeight: '600',
  },
  helperText: {
    color: '#49454F',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stepperValue: {
    minWidth: 56,
    textAlign: 'center',
  },
});
