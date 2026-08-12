import React from 'react';
import { View, Image, Pressable, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getCategoryIcon, BARCODE_FORMATS } from '@breeyo/types';
import type { InventoryItem, BarcodeFormat } from '@breeyo/types';

export interface ItemDetailsTabProps {
  item: InventoryItem;
  isEditing: boolean;
  onRemoveBarcode: (barcodeId: string) => void;
  /** Supplier from the item's most recently received batch, if any (D-02). Not on InventoryItem itself. */
  latestSupplier?: string | null;
  testID?: string;
}

const COLORS = {
  onSurfaceVariant: '#49454F',
  error: '#BA1A1A',
  surfaceVariant: '#F5F0EB',
} as const;

function getBarcodeFormatLabel(format: BarcodeFormat): string {
  return BARCODE_FORMATS.find((f) => f.value === format)?.label ?? format;
}

export function ItemDetailsTab({
  item,
  isEditing,
  onRemoveBarcode,
  latestSupplier,
  testID,
}: ItemDetailsTabProps) {
  return (
    <View style={styles.container} testID={testID}>
      <View style={styles.section}>
        <Text variant="titleMedium" style={styles.sectionTitle}>
          Barcodes ({item.barcodes.length})
        </Text>
        {item.barcodes.length === 0 ? (
          <Text variant="bodySmall" style={styles.value}>
            No barcodes linked
          </Text>
        ) : (
          item.barcodes.map((barcode) => (
            <View key={barcode.id} style={styles.barcodeRow} testID={`item-barcode-${barcode.id}`}>
              <Text variant="bodyLarge" style={styles.barcodeText}>
                {barcode.code} ({getBarcodeFormatLabel(barcode.format)})
              </Text>
              {isEditing && (
                <Pressable
                  onPress={() => onRemoveBarcode(barcode.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove barcode ${barcode.code}`}
                  testID={`item-barcode-remove-${barcode.id}`}
                >
                  <MaterialCommunityIcons name="close-circle" size={20} color={COLORS.error} />
                </Pressable>
              )}
            </View>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text variant="bodyLarge" style={styles.value}>
          Unit: {item.unit}
        </Text>
      </View>

      <View style={styles.section}>
        <Text variant="bodyLarge" style={styles.value}>
          {latestSupplier ? `Distributor: ${latestSupplier}` : 'No distributor recorded'}
        </Text>
      </View>

      <View style={styles.section}>
        <Text variant="bodyLarge" style={styles.value}>
          {item.parLevel != null ? `Par Level: ${item.parLevel} ${item.unit}` : 'No par level set'}
        </Text>
      </View>

      <View style={styles.section}>
        <Text variant="titleMedium" style={styles.sectionTitle}>
          Notes
        </Text>
        <Text variant="bodyLarge" style={styles.value}>
          {item.notes || 'No notes'}
        </Text>
      </View>

      <View style={styles.section}>
        <Text variant="titleMedium" style={styles.sectionTitle}>
          Photo
        </Text>
        <View style={styles.photoWrap}>
          {item.photoUrl ? (
            <Image source={{ uri: item.photoUrl }} style={styles.photo} />
          ) : (
            <MaterialCommunityIcons
              name={getCategoryIcon(item.category) as any}
              size={32}
              color={COLORS.onSurfaceVariant}
            />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontWeight: '700',
    color: '#1C1B1F',
    marginBottom: 4,
  },
  value: {
    color: '#1C1B1F',
  },
  barcodeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  barcodeText: {
    color: '#1C1B1F',
  },
  photoWrap: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceVariant,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  photo: {
    width: 80,
    height: 80,
  },
});
