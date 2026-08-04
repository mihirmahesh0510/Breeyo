import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Pressable,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { AttachmentMetaForm } from './AttachmentMetaForm';

interface SelectedFile {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
}

interface AttachmentPickerProps {
  visible: boolean;
  onClose: () => void;
  onFileSelected: (
    file: SelectedFile,
    fileType: import('@breeyo/types').AttachmentFileType,
    description?: string,
  ) => void;
}

export function AttachmentPicker({
  visible,
  onClose,
  onFileSelected,
}: AttachmentPickerProps) {
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [showMetaForm, setShowMetaForm] = useState(false);

  const handleTakePhoto = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Permission Required',
          'Camera permission is needed to take photos.',
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 0.8,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setSelectedFile({
          uri: asset.uri,
          name: asset.fileName || `photo_${Date.now()}.jpg`,
          mimeType: asset.mimeType || 'image/jpeg',
          size: asset.fileSize || 0,
        });
        setShowMetaForm(true);
      }
    } catch (err) {
      console.warn('[AttachmentPicker] Camera error:', err);
      Alert.alert('Error', 'Failed to open camera. Please try again.');
    }
  };

  const handleChooseFromGallery = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Permission Required',
          'Photo library permission is needed to select photos.',
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setSelectedFile({
          uri: asset.uri,
          name: asset.fileName || `image_${Date.now()}.jpg`,
          mimeType: asset.mimeType || 'image/jpeg',
          size: asset.fileSize || 0,
        });
        setShowMetaForm(true);
      }
    } catch (err) {
      console.warn('[AttachmentPicker] Gallery error:', err);
      Alert.alert('Error', 'Failed to open gallery. Please try again.');
    }
  };

  const handleUploadFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'application/dicom'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setSelectedFile({
          uri: asset.uri,
          name: asset.name,
          mimeType: asset.mimeType || 'application/pdf',
          size: asset.size || 0,
        });
        setShowMetaForm(true);
      }
    } catch (err) {
      console.warn('[AttachmentPicker] DocumentPicker error:', err);
      Alert.alert('Error', 'Failed to select file. Please try again.');
    }
  };

  const handleMetaFormSubmit = (
    fileType: import('@breeyo/types').AttachmentFileType,
    description?: string,
  ) => {
    if (selectedFile) {
      onFileSelected(selectedFile, fileType, description);
    }
    handleClose();
  };

  const handleClose = () => {
    setSelectedFile(null);
    setShowMetaForm(false);
    onClose();
  };

  if (showMetaForm && selectedFile) {
    return (
      <AttachmentMetaForm
        visible={true}
        fileName={selectedFile.name}
        onSubmit={handleMetaFormSubmit}
        onClose={handleClose}
      />
    );
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <Pressable style={styles.overlay} onPress={handleClose}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Add Attachment</Text>

          <TouchableOpacity style={styles.option} onPress={handleTakePhoto}>
            <Text style={styles.optionIcon}>camera</Text>
            <Text style={styles.optionLabel}>Take Photo</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.option} onPress={handleChooseFromGallery}>
            <Text style={styles.optionIcon}>image</Text>
            <Text style={styles.optionLabel}>Choose from Gallery</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.option} onPress={handleUploadFile}>
            <Text style={styles.optionIcon}>file</Text>
            <Text style={styles.optionLabel}>Upload File</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelButton} onPress={handleClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFBF5',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingBottom: 32,
    paddingTop: 8,
  },
  handle: {
    width: 32,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CAC4D0',
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1B1F',
    marginBottom: 16,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E7E0EC',
  },
  optionIcon: {
    fontSize: 14,
    color: '#49454F',
    width: 60,
  },
  optionLabel: {
    fontSize: 16,
    color: '#1C1B1F',
  },
  cancelButton: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 14,
  },
  cancelText: {
    fontSize: 16,
    color: '#79747E',
    fontWeight: '500',
  },
});
