import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Card,
  Chip,
  Snackbar,
  Text,
} from 'react-native-paper';
import { StatusBadge, showToast, spacing } from '@breeyo/ui';

/**
 * Phase 7 UI spike (D-17) — delete before merge.
 *
 * Throwaway route proving React Native Paper v5 + @breeyo/ui render
 * together under Expo SDK 52, and that the app-level ThemeProvider
 * (GestureHandlerRootView > SafeAreaProvider > PaperProvider) applies the
 * Breeyo MD3 theme to Paper components without a crash. See
 * .planning/phases/07-whatsapp-communication/07-03-SUMMARY.md for the
 * D-17 decision this screen exists to support.
 */
export default function UiSpikeScreen() {
  const [chipSelected, setChipSelected] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text variant="headlineLarge" style={styles.heading}>
        Phase 7 UI spike (D-17) — delete before merge
      </Text>

      <Text variant="bodyLarge" style={styles.section}>
        Paper Button
      </Text>
      <Button mode="contained" onPress={() => showToast('success', 'Paper Button pressed')}>
        Send Template
      </Button>

      <Text variant="bodyLarge" style={styles.section}>
        Paper Card
      </Text>
      <Card>
        <Card.Title title="Booking confirmed" subtitle="Confirm Booking action card" />
        <Card.Content>
          <Text variant="bodyLarge">
            Renders a Paper Card.Title and Card.Content, matching the
            ConversationActionCard shape used in the Thread screen.
          </Text>
        </Card.Content>
      </Card>

      <Text variant="bodyLarge" style={styles.section}>
        Paper Chip (selected vs. unselected)
      </Text>
      <View style={styles.row}>
        <Chip selected={false} style={styles.chip}>
          Needs action
        </Chip>
        <Chip
          selected={chipSelected}
          onPress={() => setChipSelected((value) => !value)}
          style={styles.chip}
        >
          {chipSelected ? 'Active filter' : 'Tap to select'}
        </Chip>
      </View>

      <Text variant="bodyLarge" style={styles.section}>
        Paper ActivityIndicator
      </Text>
      <ActivityIndicator animating size="small" />

      <Text variant="bodyLarge" style={styles.section}>
        Paper Snackbar
      </Text>
      <Button mode="outlined" onPress={() => setSnackbarVisible(true)}>
        Trigger Snackbar
      </Button>

      <Text variant="bodyLarge" style={styles.section}>
        @breeyo/ui StatusBadge + showToast
      </Text>
      <View style={styles.row}>
        <StatusBadge status="paid" testID="ui-spike-status-badge" />
        <StatusBadge status="overdue" label="Needs action" />
      </View>

      <Text variant="bodyLarge" style={styles.section}>
        44x44 minimum touch target
      </Text>
      <Pressable
        style={styles.touchTarget}
        accessibilityRole="button"
        accessibilityLabel="44 by 44 minimum touch target"
        onPress={() => showToast('info', 'Touch target pressed')}
      >
        <Text variant="labelSmall">Tap</Text>
      </Pressable>

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
      >
        Snackbar rendered via react-native-paper.
      </Snackbar>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  heading: {
    marginBottom: spacing.md,
  },
  section: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  chip: {
    marginRight: spacing.xs,
  },
  touchTarget: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F0EB',
    borderRadius: 8,
  },
});
