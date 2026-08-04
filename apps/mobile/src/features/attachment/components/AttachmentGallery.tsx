import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { AttachmentCard } from './AttachmentCard';
import type { ConsultationAttachment } from '@breeyo/types';

type UploadStatus = 'uploading' | 'uploaded' | 'error';

interface AttachmentWithStatus {
  attachment: ConsultationAttachment;
  status: UploadStatus;
  progress?: number;
}

interface AttachmentGalleryProps {
  attachments: AttachmentWithStatus[];
  onRetry?: (attachmentId: string) => void;
  onRemove?: (attachmentId: string) => void;
}

export function AttachmentGallery({
  attachments,
  onRetry,
  onRemove,
}: AttachmentGalleryProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {attachments.map((item) => (
        <AttachmentCard
          key={item.attachment.id}
          attachment={item.attachment}
          uploadStatus={item.status}
          uploadProgress={item.progress}
          onRetry={() => onRetry?.(item.attachment.id)}
          onRemove={() => onRemove?.(item.attachment.id)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    gap: 8,
  },
});
