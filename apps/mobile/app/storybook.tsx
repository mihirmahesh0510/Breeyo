import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';

/**
 * Expo Router route: /storybook
 *
 * Renders the Storybook UI in a full-screen view.
 * Only available in development builds (__DEV__).
 *
 * In production builds, this route redirects to the main app.
 */

let StorybookUI: React.ComponentType | null = null;

if (__DEV__) {
  try {
    // Dynamic require so production bundles tree-shake this out
    StorybookUI = require('../.rnstorybook').default;
  } catch {
    // Storybook dependencies not installed; show fallback
    StorybookUI = null;
  }
}

export default function StorybookRoute() {
  if (!StorybookUI) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Text } = require('react-native');
    return (
      <View style={styles.fallback}>
        <Text>Storybook is only available in development builds.</Text>
        <Text>Run: npx expo start --dev-client</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StorybookUI />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  fallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 8,
  },
});
