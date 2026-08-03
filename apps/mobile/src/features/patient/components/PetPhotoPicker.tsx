import React, { useCallback, useState } from 'react';
import {
  View,
  Pressable,
  Image,
  StyleSheet,
  ActionSheetIOS,
  Platform,
  Alert,
} from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

// --- Props ---

export interface PetPhotoPickerProps {
  photoUri: string | null;
  onPhotoSelected: (uri: string) => void;
  onRemove: () => void;
  testID?: string;
}

// --- Constants ---

const PHOTO_SIZE = 120;

const COLORS = {
  primary: '#2E7D32',
  background: '#FFFBF5',
  surface: '#FFFBF5',
  onSurface: '#1C1B1F',
  onSurfaceVariant: '#49454F',
  outline: '#79747E',
  outlineVariant: '#CAC4D0',
  error: '#BA1A1A',
  surfaceVariant: '#F5F0EB',
} as const;

const IMAGE_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: true,
  aspect: [1, 1],
  quality: 0.8,
};

// --- Component ---

export function PetPhotoPicker({
  photoUri,
  onPhotoSelected,
  onRemove,
  testID,
}: PetPhotoPickerProps) {
  const [isLoading, setIsLoading] = useState(false);

  const launchCamera = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Camera Permission',
        'Camera access is needed to take a pet photo. Please enable it in Settings.',
      );
      return;
    }

    setIsLoading(true);
    try {
      const result = await ImagePicker.launchCameraAsync(IMAGE_OPTIONS);
      if (!result.canceled && result.assets[0]) {
        onPhotoSelected(result.assets[0].uri);
      }
    } finally {
      setIsLoading(false);
    }
  }, [onPhotoSelected]);

  const launchGallery = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Gallery Permission',
        'Photo library access is needed to select a pet photo. Please enable it in Settings.',
      );
      return;
    }

    setIsLoading(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync(IMAGE_OPTIONS);
      if (!result.canceled && result.assets[0]) {
        onPhotoSelected(result.assets[0].uri);
      }
    } finally {
      setIsLoading(false);
    }
  }, [onPhotoSelected]);

  const showActionSheet = useCallback(() => {
    const options = photoUri
      ? ['Take Photo', 'Choose from Gallery', 'Remove Photo', 'Cancel']
      : ['Take Photo', 'Choose from Gallery', 'Cancel'];

    const cancelIndex = options.length - 1;
    const destructiveIndex = photoUri ? 2 : undefined;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: cancelIndex,
          destructiveButtonIndex: destructiveIndex,
        },
        (buttonIndex) => {
          if (buttonIndex === 0) launchCamera();
          else if (buttonIndex === 1) launchGallery();
          else if (buttonIndex === 2 && photoUri) onRemove();
        },
      );
    } else {
      // Android fallback using Alert
      const buttons: Array<{
        text: string;
        onPress?: () => void;
        style?: 'cancel' | 'destructive';
      }> = [
        { text: 'Take Photo', onPress: launchCamera },
        { text: 'Choose from Gallery', onPress: launchGallery },
      ];
      if (photoUri) {
        buttons.push({
          text: 'Remove Photo',
          onPress: onRemove,
          style: 'destructive',
        });
      }
      buttons.push({ text: 'Cancel', style: 'cancel' });

      Alert.alert('Pet Photo', 'Choose an option', buttons);
    }
  }, [photoUri, launchCamera, launchGallery, onRemove]);

  return (
    <View style={styles.container} testID={testID}>
      <Pressable
        style={styles.photoButton}
        onPress={showActionSheet}
        disabled={isLoading}
        accessibilityRole="button"
        accessibilityLabel={
          photoUri ? 'Change pet photo' : 'Add pet photo'
        }
        testID="photo-picker-button"
      >
        {photoUri ? (
          <Image
            source={{ uri: photoUri }}
            style={styles.photo}
            accessibilityLabel="Pet photo preview"
            testID="photo-preview"
          />
        ) : (
          <View style={styles.placeholder}>
            <MaterialCommunityIcons
              name="camera-plus-outline"
              size={36}
              color={COLORS.onSurfaceVariant}
            />
            <Text variant="labelSmall" style={styles.placeholderText}>
              Add Photo
            </Text>
          </View>
        )}
      </Pressable>

      {/* Remove button shown below the photo when a photo is selected */}
      {photoUri && (
        <Pressable
          style={styles.removeButton}
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel="Remove pet photo"
          hitSlop={8}
          testID="photo-remove-button"
        >
          <MaterialCommunityIcons
            name="close-circle"
            size={20}
            color={COLORS.error}
          />
          <Text variant="labelSmall" style={styles.removeText}>
            Remove
          </Text>
        </Pressable>
      )}
    </View>
  );
}

// --- Styles ---

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 8,
  },
  photoButton: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: PHOTO_SIZE / 2,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: COLORS.outlineVariant,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceVariant,
  },
  photo: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: PHOTO_SIZE / 2,
  },
  placeholder: {
    alignItems: 'center',
    gap: 4,
  },
  placeholderText: {
    color: COLORS.onSurfaceVariant,
  },
  removeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  removeText: {
    color: COLORS.error,
  },
});
