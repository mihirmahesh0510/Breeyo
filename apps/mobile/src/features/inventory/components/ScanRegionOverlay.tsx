import React, { useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from 'react-native-paper';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '@breeyo/ui';

// --- Constants ---

const SCAN_REGION_WIDTH_RATIO = 0.7; // 70% screen width per UI-SPEC
const SCAN_REGION_HEIGHT_RATIO = 0.25; // 25% screen height per UI-SPEC
const PULSE_DURATION_MS = 300; // UI-SPEC animation table: "Scan region pulse"
const PULSE_EASING = Easing.bezier(0.4, 0, 0.2, 1);

const COLORS = {
  overlay: 'rgba(0, 0, 0, 0.6)',
  regionBorder: '#FFFFFF',
  successBorder: colors.success,
  instructionText: '#FFFFFF',
} as const;

export interface ScanRegionOverlayProps {
  /**
   * Bump this value (e.g. `Date.now()`) whenever a scan resolves to a found
   * item, to play the 300ms green border pulse from the UI-SPEC animation
   * table. Optional -- the overlay is a fully valid pure visual element with
   * no pulsing at all when this is omitted, per the plan's "no props needed"
   * note; the pulse is an opt-in the parent screen wires up because *it*
   * knows when a scan succeeded (the overlay itself has no scan knowledge).
   */
  pulseTrigger?: number;
  testID?: string;
}

/**
 * D-17: full-screen semi-transparent scan overlay with a centered, clear
 * scan-region cutout and instruction text. Purely presentational -- renders
 * on top of the `<Camera>` view, never intercepts touches.
 */
export function ScanRegionOverlay({ pulseTrigger, testID }: ScanRegionOverlayProps) {
  const { width, height } = useWindowDimensions();
  const regionWidth = width * SCAN_REGION_WIDTH_RATIO;
  const regionHeight = height * SCAN_REGION_HEIGHT_RATIO;

  const pulseProgress = useSharedValue(0);

  useEffect(() => {
    if (pulseTrigger === undefined) return;
    pulseProgress.value = 0;
    pulseProgress.value = withSequence(
      withTiming(1, { duration: PULSE_DURATION_MS, easing: PULSE_EASING }),
      withTiming(0, { duration: PULSE_DURATION_MS, easing: PULSE_EASING }),
    );
  }, [pulseTrigger, pulseProgress]);

  const pulseStyle = useAnimatedStyle(() => ({
    borderColor:
      pulseProgress.value > 0.5 ? COLORS.successBorder : COLORS.regionBorder,
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" testID={testID}>
      <View style={styles.darkSection} />
      <View style={[styles.middleRow, { height: regionHeight }]}>
        <View style={styles.darkSection} />
        <Animated.View
          style={[styles.scanRegion, { width: regionWidth, height: regionHeight }, pulseStyle]}
          testID="scan-region-cutout"
        />
        <View style={styles.darkSection} />
      </View>
      <View style={[styles.darkSection, styles.bottomSection]}>
        <Text variant="bodyLarge" style={styles.instructionText}>
          Point camera at barcode
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  darkSection: {
    flex: 1,
    backgroundColor: COLORS.overlay,
  },
  middleRow: {
    flexDirection: 'row',
  },
  scanRegion: {
    borderWidth: 2,
    borderColor: COLORS.regionBorder,
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  bottomSection: {
    alignItems: 'center',
    paddingTop: 24,
  },
  instructionText: {
    color: COLORS.instructionText,
    fontWeight: '500',
  },
});
