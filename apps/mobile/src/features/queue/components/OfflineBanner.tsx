import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQueueUIStore } from '../store/queueUIStore';

export function OfflineBanner() {
  const isOffline = useQueueUIStore((s) => s.isOffline);
  const slideAnim = useRef(new Animated.Value(-50)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isOffline) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -50,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isOffline, slideAnim, opacityAnim]);

  if (!isOffline) return null;

  return (
    <Animated.View
      style={[
        styles.banner,
        {
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
      accessibilityRole="alert"
    >
      <MaterialCommunityIcons name="wifi-off" size={16} color="#BF360C" />
      {/* Plan 10-02 (D-03, D-19): check-ins and status changes made now are
          real queue work, not blocked or lost -- calm status text, not a
          "something is broken/stale" warning. */}
      <Text variant="bodySmall" style={styles.text}>
        You're offline. Changes will sync when you're back online.
      </Text>
    </Animated.View>
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
