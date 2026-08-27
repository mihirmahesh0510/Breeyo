import React, { useState, useCallback } from 'react';
import { View, Pressable, Image, ActivityIndicator, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useItemPhotoUpload } from '../hooks/useItemPhotoUpload';
import { colors as COLORS } from '@breeyo/ui';

export interface ItemPhotoPickerProps {
  photoUrl: string | null;
  /** Undefined until the item is first saved in create mode (photo-upload-url is item-scoped). */
  itemId: string | undefined;
  onPhotoUploaded: (url: string) => void;
  onRemove: () => void;
  testID?: string;
}

const PHOTO_SIZE = 120;

export function ItemPhotoPicker({
  photoUrl,
  itemId,
  onPhotoUploaded,
  onRemove,
  testID,
}: ItemPhotoPickerProps) {
  const { pickAndUpload, isUploading, error } = useItemPhotoUpload();
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const handlePress = useCallback(async () => {
    if (!itemId) return;
    const url = await pickAndUpload(itemId);
    if (url) onPhotoUploaded(url);
  }, [itemId, pickAndUpload, onPhotoUploaded]);

  const disabled = !itemId;

  return (
    <View style={styles.container} testID={testID}>
      <Pressable
        style={[styles.photoButton, disabled ? styles.photoButtonDisabled : null]}
        onPress={handlePress}
        disabled={disabled || isUploading}
        accessibilityRole="button"
        accessibilityLabel={photoUrl ? 'Change item photo' : 'Add Photo'}
        testID="item-photo-picker-button"
      >
        {isUploading ? (
          <ActivityIndicator size="small" color={COLORS.primary} testID="item-photo-uploading" />
        ) : photoUrl ? (
          <Image source={{ uri: photoUrl }} style={styles.photo} testID="item-photo-preview" />
        ) : (
          <View style={styles.placeholder}>
            <MaterialCommunityIcons name="camera-plus-outline" size={32} color={COLORS.onSurfaceVariant} />
            <Text variant="labelSmall" style={styles.placeholderText}>
              Add Photo
            </Text>
          </View>
        )}
      </Pressable>

      {disabled && (
        <Text variant="bodySmall" style={styles.helperText}>
          Fill in the required fields first to add a photo
        </Text>
      )}

      {error && (
        <View style={styles.errorRow}>
          <Text variant="bodySmall" style={styles.errorText}>
            Could not upload photo. Try again.
          </Text>
          <Pressable onPress={handlePress} testID="item-photo-retry">
            <Text variant="bodySmall" style={styles.retryText}>
              Retry
            </Text>
          </Pressable>
        </View>
      )}

      {photoUrl && !confirmingRemove && (
        <Pressable
          style={styles.removeButton}
          onPress={() => setConfirmingRemove(true)}
          accessibilityRole="button"
          accessibilityLabel="Remove item photo"
          testID="item-photo-remove-button"
        >
          <MaterialCommunityIcons name="close-circle" size={20} color={COLORS.error} />
          <Text variant="labelSmall" style={styles.removeText}>
            Remove
          </Text>
        </Pressable>
      )}

      {confirmingRemove && (
        <View style={styles.confirmBox} testID="item-photo-remove-confirm">
          <Text variant="bodySmall" style={styles.confirmText}>
            Remove photo?
          </Text>
          <View style={styles.confirmActions}>
            <Pressable onPress={() => setConfirmingRemove(false)} testID="item-photo-remove-keep">
              <Text variant="bodySmall" style={styles.keepText}>
                Keep
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setConfirmingRemove(false);
                onRemove();
              }}
              testID="item-photo-remove-confirm-button"
            >
              <Text variant="bodySmall" style={styles.removeText}>
                Remove
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 8,
  },
  photoButton: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: COLORS.outlineVariant,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceVariant,
  },
  photoButtonDisabled: {
    opacity: 0.5,
  },
  photo: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
  },
  placeholder: {
    alignItems: 'center',
    gap: 4,
  },
  placeholderText: {
    color: COLORS.onSurfaceVariant,
  },
  helperText: {
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  errorText: {
    color: COLORS.error,
  },
  retryText: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  removeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  removeText: {
    color: COLORS.error,
    fontWeight: '600',
  },
  confirmBox: {
    alignItems: 'center',
    gap: 4,
  },
  confirmText: {
    color: '#1C1B1F',
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 16,
  },
  keepText: {
    color: COLORS.onSurfaceVariant,
  },
});
