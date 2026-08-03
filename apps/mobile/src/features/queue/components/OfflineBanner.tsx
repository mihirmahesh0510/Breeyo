import React from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQueueUIStore } from '../store/queueUIStore';

export function OfflineBanner() {
  const isOffline = useQueueUIStore((s) => s.isOffline);

  if (!isOffline) return null;

  return (
    <View style={styles.banner} accessibilityRole="alert">
      <MaterialCommunityIcons name="wifi-off" size={16} color="#BF360C" />
      <Text variant="bodySmall" style={styles.text}>
        You are offline. Queue may be outdated.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(230, 81, 0, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginHorizontal: 16,
    borderRadius: 8,
  },
  text: {
    color: '#1C1B1F',
  },
});
