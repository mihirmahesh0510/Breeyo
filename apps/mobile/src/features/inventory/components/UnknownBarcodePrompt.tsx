import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button, Card, colors as COLORS } from '@breeyo/ui';

// --- Component ---

export interface UnknownBarcodePromptProps {
  barcode: string;
  isOffline: boolean;
  /** D-14: navigates to item creation with the barcode pre-filled. */
  onCreate: () => void;
  /** Dismisses the prompt; the camera keeps scanning. */
  onRetry: () => void;
  testID?: string;
}

/** D-14: "Item not found" prompt shown when a scanned/entered barcode
 *  doesn't resolve to any catalog item. */
export function UnknownBarcodePrompt({ barcode, isOffline, onCreate, onRetry, testID }: UnknownBarcodePromptProps) {
  return (
    <Card variant="elevated" testID={testID}>
      <Card.Body>
        <View style={styles.iconRow}>
          <MaterialCommunityIcons name="barcode-off" size={32} color={COLORS.onSurfaceVariant} />
        </View>
        <Text variant="titleMedium" style={styles.heading}>
          Item not found
        </Text>
        <Text variant="bodyLarge" style={styles.body}>
          No item matches this barcode.
        </Text>
        <Text variant="bodySmall" style={styles.barcode}>
          {barcode}
        </Text>
        {isOffline && (
          <Text variant="bodySmall" style={styles.offlineNote}>
            You may need to sync when online.
          </Text>
        )}
      </Card.Body>
      <Card.Actions>
        <Button variant="text" label="Try Again" onPress={onRetry} testID="unknown-barcode-retry" />
        <Button variant="filled" label="Create New Item" onPress={onCreate} testID="unknown-barcode-create" />
      </Card.Actions>
    </Card>
  );
}

const styles = StyleSheet.create({
  iconRow: {
    alignItems: 'center',
    marginBottom: 8,
  },
  heading: {
    textAlign: 'center',
    marginBottom: 4,
  },
  body: {
    textAlign: 'center',
    color: COLORS.onSurfaceVariant,
  },
  barcode: {
    textAlign: 'center',
    color: COLORS.onSurfaceVariant,
    marginTop: 8,
  },
  offlineNote: {
    textAlign: 'center',
    color: COLORS.tertiary,
    marginTop: 8,
  },
});
