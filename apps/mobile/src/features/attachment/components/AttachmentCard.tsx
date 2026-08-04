import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Modal,
  Alert,
  Pressable,
} from 'react-native';
import type { ConsultationAttachment } from '@breeyo/types';

type UploadStatus = 'uploading' | 'uploaded' | 'error';

interface AttachmentCardProps {
  attachment: ConsultationAttachment;
  uploadStatus?: UploadStatus;
  uploadProgress?: number;
  onRetry?: () => void;
  onRemove?: () => void;
}

const FILE_TYPE_LABELS: Record<string, string> = {
  lab_report: 'Lab Report',
  xray: 'X-ray',
  ultrasound: 'Ultrasound',
  ecg: 'ECG',
  photo: 'Photo',
  other: 'File',
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentCard({
  attachment,
  uploadStatus = 'uploaded',
  uploadProgress = 0,
  onRetry,
  onRemove,
}: AttachmentCardProps) {
  const [showFullScreen, setShowFullScreen] = useState(false);

  const isImage = attachment.mimeType.startsWith('image/');
  const typeLabel = FILE_TYPE_LABELS[attachment.fileType] || 'File';

  const handlePress = () => {
    if (uploadStatus === 'error') {
      onRetry?.();
      return;
    }
    if (uploadStatus === 'uploading') return;
    if (isImage) {
      setShowFullScreen(true);
    }
    // For PDFs and DICOM, the tap action is handled externally
  };

  const handleRemove = () => {
    Alert.alert(
      'Remove Attachment',
      `Remove "${attachment.fileName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: onRemove },
      ],
    );
  };

  return (
    <>
      <TouchableOpacity
        style={[
          styles.container,
          uploadStatus === 'error' && styles.containerError,
        ]}
        onPress={handlePress}
        activeOpacity={0.7}
      >
        {/* Thumbnail / Icon */}
        {isImage && attachment.s3Url ? (
          <Image
            source={{ uri: attachment.s3Url }}
            style={styles.thumbnail}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.iconContainer}>
            <Text style={styles.iconText}>
              {attachment.mimeType === 'application/pdf' ? 'PDF' : typeLabel.substring(0, 3).toUpperCase()}
            </Text>
          </View>
        )}

        {/* Upload Progress Overlay */}
        {uploadStatus === 'uploading' ? (
          <View style={styles.progressOverlay}>
            <View
              style={[styles.progressBar, { width: `${Math.round(uploadProgress * 100)}%` }]}
            />
            <Text style={styles.progressText}>
              {Math.round(uploadProgress * 100)}%
            </Text>
          </View>
        ) : null}

        {/* Error Overlay */}
        {uploadStatus === 'error' ? (
          <View style={styles.errorOverlay}>
            <Text style={styles.errorIcon}>!</Text>
          </View>
        ) : null}

        {/* Remove Button */}
        {uploadStatus === 'uploaded' && onRemove ? (
          <TouchableOpacity
            style={styles.removeButton}
            onPress={handleRemove}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.removeIcon}>x</Text>
          </TouchableOpacity>
        ) : null}

        {/* Info Row */}
        <View style={styles.infoRow}>
          <Text style={styles.typeLabel} numberOfLines={1}>
            {typeLabel}
          </Text>
          <Text style={styles.sizeLabel}>
            {formatFileSize(attachment.fileSizeBytes)}
          </Text>
        </View>

        {/* Error message */}
        {uploadStatus === 'error' ? (
          <Text style={styles.errorText}>Upload failed. Tap to retry.</Text>
        ) : null}
      </TouchableOpacity>

      {/* Full-Screen Image Viewer */}
      {isImage && attachment.s3Url ? (
        <Modal
          visible={showFullScreen}
          transparent
          animationType="fade"
          onRequestClose={() => setShowFullScreen(false)}
        >
          <Pressable
            style={styles.fullScreenOverlay}
            onPress={() => setShowFullScreen(false)}
          >
            <Image
              source={{ uri: attachment.s3Url }}
              style={styles.fullScreenImage}
              resizeMode="contain"
            />
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowFullScreen(false)}
            >
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 100,
    borderRadius: 8,
    backgroundColor: '#F5F0EB',
    overflow: 'hidden',
  },
  containerError: {
    borderWidth: 1,
    borderColor: '#B3261E',
  },
  thumbnail: {
    width: 100,
    height: 80,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  iconContainer: {
    width: 100,
    height: 80,
    backgroundColor: '#E7E0EC',
    justifyContent: 'center',
    alignItems: 'center',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  iconText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#49454F',
  },
  progressOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 80,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    height: 3,
    backgroundColor: '#2E7D32',
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  errorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 80,
    backgroundColor: 'rgba(179,38,30,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorIcon: {
    fontSize: 24,
    fontWeight: '700',
    color: '#B3261E',
  },
  removeButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeIcon: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  typeLabel: {
    fontSize: 11,
    color: '#49454F',
    fontWeight: '500',
    flex: 1,
  },
  sizeLabel: {
    fontSize: 10,
    color: '#79747E',
  },
  errorText: {
    fontSize: 10,
    color: '#B3261E',
    textAlign: 'center',
    paddingHorizontal: 4,
    paddingBottom: 4,
  },
  fullScreenOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenImage: {
    width: '100%',
    height: '80%',
  },
  closeButton: {
    position: 'absolute',
    top: 60,
    right: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  closeText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
  },
});
