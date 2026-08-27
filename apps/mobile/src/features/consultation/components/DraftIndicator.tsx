import React, { useRef, useEffect } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';

type DraftStatus = 'saved' | 'dirty' | 'saving' | 'error' | 'offline';

interface DraftIndicatorProps {
  status: DraftStatus;
  lastSavedAt: Date | null;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function DraftIndicator({ status, lastSavedAt }: DraftIndicatorProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (status === 'dirty') {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.3,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ]),
      );
      animation.start();
      return () => animation.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [status, pulseAnim]);

  const renderContent = () => {
    switch (status) {
      case 'saved':
        return (
          <Text style={[styles.text, styles.savedText]}>
            Draft -- auto-saved {lastSavedAt ? formatTime(lastSavedAt) : ''}
          </Text>
        );
      case 'dirty':
        return (
          <View style={styles.row}>
            <Animated.View style={[styles.dot, styles.dirtyDot, { opacity: pulseAnim }]} />
            <Text style={[styles.text, styles.dirtyText]}>Unsaved changes</Text>
          </View>
        );
      case 'saving':
        return <Text style={[styles.text, styles.savingText]}>Saving...</Text>;
      case 'error':
        return (
          <Text style={[styles.text, styles.errorText]}>
            Could not save draft. Will retry.
          </Text>
        );
      case 'offline':
        // D-03, D-19: reassuring, not alarming -- this edit is safely on
        // the device and will sync automatically, never a failure state
        // the clinician needs to act on.
        return (
          <Text style={[styles.text, styles.offlineText]}>
            Saved offline -- will sync when back online
          </Text>
        );
    }
  };

  return <View style={styles.container}>{renderContent()}</View>;
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  dirtyDot: {
    backgroundColor: '#E65100',
  },
  text: {
    fontSize: 12,
  },
  savedText: {
    color: '#49454F',
  },
  dirtyText: {
    color: '#E65100',
  },
  savingText: {
    color: '#49454F',
  },
  errorText: {
    color: '#BA1A1A',
  },
  offlineText: {
    color: '#5D4037',
  },
});
