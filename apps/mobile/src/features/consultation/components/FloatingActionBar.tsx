import React, { useRef, useEffect } from 'react';
import { View, Text, Pressable, Animated, StyleSheet } from 'react-native';

interface FloatingActionBarProps {
  onMic: () => void;
  onRx: () => void;
  onCamera: () => void;
  onTimer: () => void;
  isRecording?: boolean;
}

interface ActionIconProps {
  icon: string;
  label: string;
  onPress: () => void;
  color?: string;
  pulsing?: boolean;
}

function ActionIcon({ icon, label, onPress, color = '#49454F', pulsing }: ActionIconProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (pulsing) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.5,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ]),
      );
      animation.start();
      return () => animation.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [pulsing, pulseAnim]);

  return (
    <Pressable
      style={styles.iconButton}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Animated.Text
        style={[styles.iconText, { color, opacity: pulsing ? pulseAnim : 1 }]}
      >
        {icon}
      </Animated.Text>
    </Pressable>
  );
}

export function FloatingActionBar({
  onMic,
  onRx,
  onCamera,
  onTimer,
  isRecording = false,
}: FloatingActionBarProps) {
  return (
    <View style={styles.container}>
      <View style={styles.bar}>
        <ActionIcon
          icon={'\uD83C\uDF99'}
          label="microphone"
          onPress={onMic}
          color={isRecording ? '#E65100' : '#49454F'}
          pulsing={isRecording}
        />
        <ActionIcon icon={'\uD83D\uDC8A'} label="pill" onPress={onRx} />
        <ActionIcon icon={'\uD83D\uDCF7'} label="camera-plus" onPress={onCamera} />
        <ActionIcon icon={'\u23F1'} label="clock-plus-outline" onPress={onTimer} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  bar: {
    flexDirection: 'row',
    backgroundColor: '#FFFBF5',
    borderRadius: 28,
    paddingHorizontal: 8,
    paddingVertical: 8,
    height: 56,
    alignItems: 'center',
    gap: 4,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: {
    fontSize: 24,
  },
});
