import { useState, useCallback } from 'react';
import { Platform, ActionSheetIOS, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { apiClient } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';

/**
 * Max dimension / quality used when launching the picker. `expo-image-manipulator`
 * (the library the plan names for post-pick resizing to ~800x800/500KB) is not an
 * installed dependency anywhere in this monorepo (confirmed: absent from
 * apps/mobile/package.json and node_modules, and the one place that already
 * imports it -- features/attachment/hooks/useFileUpload.ts -- is itself a
 * pre-existing baseline TS error: "Cannot find module 'expo-image-manipulator'").
 * Adding a new native dependency is out of scope for this UI plan, so
 * compression is done the same way Phase 3's PetPhotoPicker already does it:
 * via the picker's own `quality`/`aspect` options at capture time, rather than
 * a separate post-hoc manipulateAsync() resize step.
 */
const IMAGE_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: true,
  aspect: [1, 1],
  quality: 0.6,
};

/** Anything picked above this is still sent as-is (no manipulator available to shrink further); see note above. */
export const COMPRESSION_HINT_THRESHOLD_BYTES = 1024 * 1024; // ~1MB

interface PhotoUploadUrlResponse {
  data: { uploadUrl: string; photoUrl: string; expiresIn: number };
}

/**
 * The actual request-presigned-url -> PUT-to-S3 orchestration, pulled out of
 * the hook body so it's testable as a plain async function (no React
 * rendering required -- see useItemPhotoUpload.test.ts for why that matters
 * in this repo). Throws on any failure; the hook wraps this with
 * isUploading/progress/error state.
 */
export async function uploadPickedPhotoToPresignedUrl(
  itemId: string,
  asset: { uri: string; mimeType?: string | null },
  accessToken: string | null | undefined,
  onProgress?: (progress: number) => void,
): Promise<string> {
  onProgress?.(0.1);

  const presigned = await apiClient<PhotoUploadUrlResponse>(
    `/api/v1/inventory/items/${itemId}/photo-upload-url`,
    { method: 'POST', token: accessToken || undefined },
  );
  const { uploadUrl, photoUrl } = presigned.data;

  onProgress?.(0.3);

  const mimeType = asset.mimeType ?? 'image/jpeg';
  const uploadResult = await FileSystem.uploadAsync(uploadUrl, asset.uri, {
    httpMethod: 'PUT',
    headers: { 'Content-Type': mimeType },
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
  });

  if (uploadResult.status < 200 || uploadResult.status >= 300) {
    throw new Error(`Photo upload failed with status ${uploadResult.status}`);
  }

  onProgress?.(1.0);
  return photoUrl;
}

interface UseItemPhotoUploadReturn {
  pickAndUpload: (itemId: string) => Promise<string | null>;
  isUploading: boolean;
  progress: number;
  error: string | null;
}

/**
 * D-64: real photo upload for an inventory item -- image picker (camera or
 * gallery) -> presigned URL -> PUT to S3 -> resolved photoUrl. Mirrors the
 * Phase 4 `useFileUpload.ts` presigned-URL pattern, scoped to a single item
 * photo instead of a consultation attachment list. Unlike Phase 3's
 * `PetPhotoPicker` (which only returns a local URI and defers the S3 PUT),
 * this hook uploads immediately so the caller gets back a real, persisted
 * URL.
 */
export function useItemPhotoUpload(): UseItemPhotoUploadReturn {
  const { accessToken } = useAuth();
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const launchPicker = useCallback((): Promise<ImagePicker.ImagePickerAsset | null> => {
    return new Promise((resolve) => {
      const pickFrom = async (source: 'camera' | 'gallery') => {
        const permission =
          source === 'camera'
            ? await ImagePicker.requestCameraPermissionsAsync()
            : await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (!permission.granted) {
          Alert.alert(
            source === 'camera' ? 'Camera Permission' : 'Gallery Permission',
            `${source === 'camera' ? 'Camera' : 'Photo library'} access is needed to add an item photo. Please enable it in Settings.`,
          );
          resolve(null);
          return;
        }

        const result =
          source === 'camera'
            ? await ImagePicker.launchCameraAsync(IMAGE_OPTIONS)
            : await ImagePicker.launchImageLibraryAsync(IMAGE_OPTIONS);

        if (result.canceled || !result.assets[0]) {
          resolve(null);
          return;
        }
        resolve(result.assets[0]);
      };

      const options = ['Take Photo', 'Choose from Gallery', 'Cancel'];
      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          { options, cancelButtonIndex: 2 },
          (buttonIndex) => {
            if (buttonIndex === 0) pickFrom('camera');
            else if (buttonIndex === 1) pickFrom('gallery');
            else resolve(null);
          },
        );
      } else {
        Alert.alert('Item Photo', 'Choose an option', [
          { text: 'Take Photo', onPress: () => pickFrom('camera') },
          { text: 'Choose from Gallery', onPress: () => pickFrom('gallery') },
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
        ]);
      }
    });
  }, []);

  const pickAndUpload = useCallback(
    async (itemId: string): Promise<string | null> => {
      setError(null);
      const asset = await launchPicker();
      if (!asset) return null;

      setIsUploading(true);
      setProgress(0);

      try {
        const photoUrl = await uploadPickedPhotoToPresignedUrl(itemId, asset, accessToken, setProgress);
        return photoUrl;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Could not upload photo. Try again.';
        setError(message);
        return null;
      } finally {
        setIsUploading(false);
      }
    },
    [accessToken, launchPicker],
  );

  return { pickAndUpload, isUploading, progress, error };
}
