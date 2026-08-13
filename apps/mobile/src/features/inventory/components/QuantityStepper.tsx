import React, { useCallback, useRef } from 'react';
import { View, TextInput as RNTextInput, Pressable, Animated, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import * as Haptics from 'expo-haptics';
import { clampQuantity } from '../lib/fifo-dispense-logic';

/** Per UI-SPEC "Dispense form quantity stepper": 48px touch targets, one-handed operation. */
const STEPPER_BUTTON_SIZE = 48;
const PRESS_ANIMATION_DURATION_MS = 100;
const PRESS_SCALE = 0.97;

export interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  unit: string;
  disabled?: boolean;
  testID?: string;
}

interface StepperButtonProps {
  symbol: '-' | '+';
  onPress: () => void;
  disabled: boolean;
  accessibilityLabel: string;
  testID?: string;
}

/**
 * -/+ button with a 100ms scale-to-0.97 press animation and a light haptic
 * tap, per the UI-SPEC's dispense-form stepper spec. 48x48 touch target
 * (D-... one-handed use while holding an animal/product).
 */
function StepperButton({ symbol, onPress, disabled, accessibilityLabel, testID }: StepperButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.timing(scale, {
      toValue: PRESS_SCALE,
      duration: PRESS_ANIMATION_DURATION_MS,
      useNativeDriver: true,
    }).start();
  }, [scale]);

  const handlePressOut = useCallback(() => {
    Animated.timing(scale, {
      toValue: 1,
      duration: PRESS_ANIMATION_DURATION_MS,
      useNativeDriver: true,
    }).start();
  }, [scale]);

  const handlePress = useCallback(() => {
    if (disabled) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  }, [disabled, onPress]);

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      testID={testID}
      style={[styles.button, disabled && styles.buttonDisabled]}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Text variant="headlineSmall" style={disabled ? styles.symbolDisabled : styles.symbol}>
          {symbol}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

/**
 * Quantity stepper for the dispense flow (D-22 quantity input feeding FIFO
 * deduction). Min is always 1 (cannot dispense zero); max is the available
 * stock passed in by the caller. Typing directly into the numeric field is
 * clamped the same way the +/- buttons are, via the shared `clampQuantity`
 * pure function (see lib/fifo-dispense-logic.ts, unit-tested there).
 */
export function QuantityStepper({ value, onChange, min, max, unit, disabled = false, testID }: QuantityStepperProps) {
  const atMin = value <= min;
  const atMax = value >= max;

  const handleDecrement = useCallback(() => {
    onChange(clampQuantity(value - 1, min, max));
  }, [value, min, max, onChange]);

  const handleIncrement = useCallback(() => {
    onChange(clampQuantity(value + 1, min, max));
  }, [value, min, max, onChange]);

  const handleTextChange = useCallback(
    (text: string) => {
      const digitsOnly = text.replace(/[^0-9]/g, '');
      if (digitsOnly === '') {
        onChange(min);
        return;
      }
      onChange(clampQuantity(Number(digitsOnly), min, max));
    },
    [min, max, onChange],
  );

  return (
    <View style={styles.row} testID={testID}>
      <StepperButton
        symbol="-"
        onPress={handleDecrement}
        disabled={disabled || atMin}
        accessibilityLabel="Decrease quantity"
        testID={testID ? `${testID}-decrement` : undefined}
      />

      <View style={styles.inputWrap}>
        <RNTextInput
          style={styles.input}
          value={String(value)}
          onChangeText={handleTextChange}
          keyboardType="number-pad"
          editable={!disabled}
          accessibilityLabel="Quantity to dispense"
          testID={testID ? `${testID}-input` : undefined}
        />
        <Text variant="bodyMedium" style={styles.unitLabel}>
          {unit}
        </Text>
      </View>

      <StepperButton
        symbol="+"
        onPress={handleIncrement}
        disabled={disabled || atMax}
        accessibilityLabel="Increase quantity"
        testID={testID ? `${testID}-increment` : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  button: {
    width: STEPPER_BUTTON_SIZE,
    height: STEPPER_BUTTON_SIZE,
    borderRadius: 8,
    backgroundColor: '#2E7D32',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#E7E0EC',
  },
  symbol: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  symbolDisabled: {
    color: '#9E9E9E',
    fontWeight: '700',
  },
  inputWrap: {
    flex: 1,
    alignItems: 'center',
  },
  input: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    color: '#1C1B1F',
    minWidth: 64,
    paddingVertical: 4,
  },
  unitLabel: {
    color: '#49454F',
    marginTop: 2,
  },
});
