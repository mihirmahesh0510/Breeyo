export type AttachmentFileType = 'lab_report' | 'xray' | 'ultrasound' | 'ecg' | 'photo' | 'other';
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf', 'application/dicom'] as const;
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB (D-61)
export const MAX_FILES_PER_CONSULTATION = 10; // D-61
export const COMPRESS_THRESHOLD_BYTES = 5 * 1024 * 1024; // 5MB (D-61)

export interface ConsultationAttachment {
  id: string;
  consultationId: string;
  fileType: AttachmentFileType;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  s3Key: string;
  s3Url: string | null;
  thumbnailS3Key: string | null;
  description: string | null;
  uploadedBy: string;
  uploadedAt: Date;
}

export interface AttachmentUploadRequest {
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  fileType: AttachmentFileType;
  description?: string;
}

export interface PresignedUrlResponse {
  uploadUrl: string;
  s3Key: string;
  expiresIn: number;
}
