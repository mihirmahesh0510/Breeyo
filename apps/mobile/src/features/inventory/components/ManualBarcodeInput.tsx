import React, { useCallback, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { TextInput as PaperTextInput } from 'react-native-paper';
import { Button } from '@breeyo/ui';

// --- Constants ---

const COLORS = {
  surface: '#FFFBF5',
} as const;

// --- Component ---

export interface ManualBarcodeInputProps {
  onSubmit: (code: string) => void;
  /** Controlled visibility -- the screen owns the "Enter Barcode" toggle
   *  trigger and passes this through (D-20). */
  visible: boolean;
  isLooking?: boolean;
  testID?: string;
}

/**
 * D-20: numeric manual barcode entry, always available alongside the
 * camera for damaged barcodes, poor lighting, or camera-scan failures.
 * Uses `react-native-paper`'s `TextInput` directly (not `@breeyo/ui`'s
 * `BreeyoTextInput`) because the base component doesn't expose a
 * `keyboardType` prop and this field specifically needs the numeric pad to
 * auto-open -- same "reach for react-native-paper directly when @breeyo/ui
 * doesn't cover it" convention Plan 05-04 already established.
 */
export function ManualBarcodeInput({ onSubmit, visible, isLooking = false, testID }: ManualBarcodeInputProps) {
  const [code, setCode] = useState('');

  const handleSubmit = useCallback(() => {
    const trimmed = code.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setCode('');
  }, [code, onSubmit]);

  if (!visible) return null;

  return (
    <View style={styles.container} testID={testID}>
      <PaperTextInput
        label="Barcode Number"
        placeholder="Enter barcode number"
        value={code}
        onChangeText={setCode}
        keyboardType="number-pad"
        mode="outlined"
        style={styles.input}
        accessibilityLabel="Barcode Number"
        testID="manual-barcode-text-input"
      />
      <Button
        variant="filled"
        label="Look Up"
        onPress={handleSubmit}
        disabled={!code.trim()}
        loading={isLooking}
        testID="manual-barcode-lookup-button"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  input: {
    backgroundColor: COLORS.surface,
  },
});
