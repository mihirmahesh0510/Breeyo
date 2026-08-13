import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { AttachmentGallery } from '../../attachment/components/AttachmentGallery';
import { AttachmentPicker } from '../../attachment/components/AttachmentPicker';
import type { ConsultationAttachment, AttachmentFileType } from '@breeyo/types';
import { MAX_FILES_PER_CONSULTATION } from '@breeyo/types';

type UploadStatus = 'uploading' | 'uploaded' | 'error';

interface AttachmentWithStatus {
  attachment: ConsultationAttachment;
  status: UploadStatus;
  progress?: number;
}

interface FilesSectionProps {
  attachments: AttachmentWithStatus[];
  onAddFile: (
    file: { uri: string; name: string; mimeType: string; size: number },
    fileType: AttachmentFileType,
    description?: string,
  ) => void;
  onRetry?: (attachmentId: string) => void;
  onRemove?: (attachmentId: string) => void;
}

export function FilesSection({
  attachments,
  onAddFile,
  onRetry,
  onRemove,
}: FilesSectionProps) {
  const [showPicker, setShowPicker] = useState(false);

  const hasAttachments = attachments.length > 0;
  const isAtLimit = attachments.length >= MAX_FILES_PER_CONSULTATION;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Files</Text>
        {isAtLimit ? (
          <Text style={styles.limitText}>Maximum 10 files reached</Text>
        ) : null}
      </View>

      {hasAttachments ? (
        <AttachmentGallery
          attachments={attachments}
          onRetry={onRetry}
          onRemove={onRemove}
        />
      ) : (
        <Text style={styles.emptyText}>No files attached.</Text>
      )}

      <TouchableOpacity
        style={[styles.addButton, isAtLimit && styles.addButtonDisabled]}
        onPress={() => setShowPicker(true)}
        disabled={isAtLimit}
      >
        <Text
          style={[styles.addButtonText, isAtLimit && styles.addButtonTextDisabled]}
        >
          + Add File
        </Text>
      </TouchableOpacity>

      <AttachmentPicker
        visible={showPicker}
        onClose={() => setShowPicker(false)}
        onFileSelected={(file, fileType, description) => {
          onAddFile(file, fileType, description);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1B1F',
  },
  limitText: {
    fontSize: 12,
    color: '#E65100',
    fontWeight: '500',
  },
  emptyText: {
    fontSize: 14,
    color: '#79747E',
    textAlign: 'center',
    paddingVertical: 20,
  },
  addButton: {
    alignSelf: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 12,
  },
  addButtonDisabled: {
    backgroundColor: '#E7E0EC',
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2E7D32',
  },
  addButtonTextDisabled: {
    color: '#79747E',
  },
});
