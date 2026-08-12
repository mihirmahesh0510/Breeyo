import { useState, useCallback, useRef } from 'react';
import * as FileSystem from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { apiClient } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';
import type {
  AttachmentFileType,
  AttachmentUploadRequest,
  PresignedUrlResponse,
  ConsultationAttachment,
} from '@breeyo/types';
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  COMPRESS_THRESHOLD_BYTES,
} from '@breeyo/types';

interface FileToUpload {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
}

interface UploadResult {
  data: ConsultationAttachment;
}

interface UseFileUploadReturn {
  uploadFile: (
    consultationId: string,
    file: FileToUpload,
    fileType: AttachmentFileType,
    description?: string,
  ) => Promise<ConsultationAttachment>;
  isUploading: boolean;
  progress: number;
  error: string | null;
}

/**
 * Hook for uploading file attachments to consultations.
 * Handles validation, compression, presigned URL flow, and S3 upload.
 */
export function useFileUpload(): UseFileUploadReturn {
  const { accessToken } = useAuth();
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);

  const uploadFile = useCallback(
    async (
      consultationId: string,
      file: FileToUpload,
      fileType: AttachmentFileType,
      description?: string,
    ): Promise<ConsultationAttachment> => {
      setIsUploading(true);
      setProgress(0);
      setError(null);
      abortRef.current = false;

      try {
        // 1. Validate file size
        if (file.size > MAX_FILE_SIZE_BYTES) {
          throw new Error(
            `File size exceeds maximum of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`,
          );
        }

        // 2. Validate MIME type
        if (!ALLOWED_MIME_TYPES.includes(file.mimeType as typeof ALLOWED_MIME_TYPES[number])) {
          throw new Error(
            `File type "${file.mimeType}" is not supported. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
          );
        }

        setProgress(0.1);

        // 3. Compress image if needed (> 5MB)
        let fileUri = file.uri;
        let fileMimeType = file.mimeType;
        let fileSize = file.size;

        if (
          file.mimeType.startsWith('image/') &&
          file.size > COMPRESS_THRESHOLD_BYTES
        ) {
          const compressed = await manipulateAsync(
            file.uri,
            [{ resize: { width: 1920 } }],
            { compress: 0.7, format: SaveFormat.JPEG },
          );
          fileUri = compressed.uri;
          fileMimeType = 'image/jpeg';

          // Get compressed file info
          const info = await FileSystem.getInfoAsync(compressed.uri);
          if (info.exists && 'size' in info) {
            fileSize = info.size;
          }
        }

        setProgress(0.2);

        // 4. Request presigned URL from API
        const uploadRequest: AttachmentUploadRequest = {
          fileName: file.name,
          mimeType: fileMimeType,
          fileSizeBytes: fileSize,
          fileType,
          description,
        };

        const presignedResponse = await apiClient<{ data: PresignedUrlResponse }>(
          `/api/v1/consultations/${consultationId}/attachments`,
          {
            method: 'POST',
            token: accessToken || undefined,
            body: JSON.stringify(uploadRequest),
          },
        );

        const { attachmentId, uploadUrl } = presignedResponse.data;

        setProgress(0.3);

        // 5. Upload file to presigned S3 URL
        const uploadResult = await FileSystem.uploadAsync(uploadUrl, fileUri, {
          httpMethod: 'PUT',
          headers: {
            'Content-Type': fileMimeType,
          },
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        });

        if (uploadResult.status < 200 || uploadResult.status >= 300) {
          throw new Error(`S3 upload failed with status ${uploadResult.status}`);
        }

        setProgress(0.8);

        // 6. Confirm upload with API
        const confirmResponse = await apiClient<UploadResult>(
          `/api/v1/consultations/${consultationId}/attachments/${attachmentId}/confirm`,
          {
            method: 'POST',
            token: accessToken || undefined,
          },
        );

        setProgress(1.0);
        return confirmResponse.data;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Upload failed. Please try again.';
        setError(message);
        throw err;
      } finally {
        setIsUploading(false);
      }
    },
    [accessToken],
  );

  return {
    uploadFile,
    isUploading,
    progress,
    error,
  };
}
