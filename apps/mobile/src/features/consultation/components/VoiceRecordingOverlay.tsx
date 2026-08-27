import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { colors } from '@breeyo/ui';

interface VoiceRecordingOverlayProps {
  isRecording: boolean;
  interimTranscript?: string;
  isTranscribing?: boolean;
}

export function VoiceRecordingOverlay({
  isRecording,
  interimTranscript,
  isTranscribing,
}: VoiceRecordingOverlayProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;
  const [durationSeconds, setDurationSeconds] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Pulsing animation for the recording dot (1000ms loop)
  useEffect(() => {
    if (isRecording) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.4,
            duration: 500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRecording, pulseAnim]);

  // Spinner animation for transcribing state
  useEffect(() => {
    if (isTranscribing) {
      const spin = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      );
      spin.start();
      return () => spin.stop();
    } else {
      spinAnim.setValue(0);
    }
  }, [isTranscribing, spinAnim]);

  // Duration counter
  useEffect(() => {
    if (isRecording) {
      setDurationSeconds(0);
      intervalRef.current = setInterval(() => {
        setDurationSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRecording]);

  if (!isRecording && !isTranscribing) {
    return null;
  }

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const spinInterpolation = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.container}>
      {isRecording ? (
        <View style={styles.recordingRow}>
          <Animated.View
            style={[styles.recordingDot, { opacity: pulseAnim }]}
          />
          <Text style={styles.recordingText}>Recording...</Text>
          <Text style={styles.durationText}>{formatDuration(durationSeconds)}</Text>
        </View>
      ) : isTranscribing ? (
        <View style={styles.recordingRow}>
          <Animated.View
            style={[
              styles.spinner,
              { transform: [{ rotate: spinInterpolation }] },
            ]}
          />
          <Text style={styles.transcribingText}>Transcribing...</Text>
        </View>
      ) : null}

      {interimTranscript ? (
        <Text style={styles.interimText} numberOfLines={2}>
          {interimTranscript}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 16,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: colors.tertiaryContainer,
  },
  recordingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.tertiary,
    marginRight: 8,
  },
  recordingText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.tertiary,
    flex: 1,
  },
  durationText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.onTertiaryContainer,
    fontVariant: ['tabular-nums'],
  },
  transcribingText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#49454F',
    marginLeft: 8,
  },
  spinner: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.tertiary,
    borderTopColor: 'transparent',
  },
  interimText: {
    fontSize: 12,
    color: '#79747E',
    fontStyle: 'italic',
    marginTop: 4,
  },
});
