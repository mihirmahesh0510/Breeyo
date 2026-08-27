import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import type { AttachmentFileType } from '@breeyo/types';
import { colors } from '@breeyo/ui';

const FILE_TYPE_OPTIONS: { value: AttachmentFileType; label: string }[] = [
  { value: 'lab_report', label: 'Lab Report' },
  { value: 'xray', label: 'X-ray' },
  { value: 'ultrasound', label: 'Ultrasound' },
  { value: 'ecg', label: 'ECG' },
  { value: 'photo', label: 'Photo' },
  { value: 'other', label: 'Other' },
];

interface AttachmentMetaFormProps {
  visible: boolean;
  fileName: string;
  onSubmit: (fileType: AttachmentFileType, description?: string) => void;
  onClose: () => void;
}

export function AttachmentMetaForm({
  visible,
  fileName,
  onSubmit,
  onClose,
}: AttachmentMetaFormProps) {
  const [selectedFileType, setSelectedFileType] = useState<AttachmentFileType>('photo');
  const [description, setDescription] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const selectedLabel =
    FILE_TYPE_OPTIONS.find((o) => o.value === selectedFileType)?.label || 'Photo';

  const handleSubmit = () => {
    onSubmit(selectedFileType, description.trim() || undefined);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.sheet} onStartShouldSetResponder={() => true}>
          <View style={styles.handle} />
          <Text style={styles.title}>File Details</Text>

          <Text style={styles.fileName} numberOfLines={1}>
            {fileName}
          </Text>

          {/* File Type Dropdown */}
          <Text style={styles.label}>File Type</Text>
          <TouchableOpacity
            style={styles.dropdown}
            onPress={() => setShowDropdown(!showDropdown)}
          >
            <Text style={styles.dropdownText}>{selectedLabel}</Text>
            <Text style={styles.dropdownArrow}>{showDropdown ? '\u25B2' : '\u25BC'}</Text>
          </TouchableOpacity>

          {showDropdown ? (
            <View style={styles.dropdownList}>
              {FILE_TYPE_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.dropdownItem,
                    selectedFileType === option.value && styles.dropdownItemSelected,
                  ]}
                  onPress={() => {
                    setSelectedFileType(option.value);
                    setShowDropdown(false);
                  }}
                >
                  <Text
                    style={[
                      styles.dropdownItemText,
                      selectedFileType === option.value && styles.dropdownItemTextSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          {/* Description Input */}
          <Text style={styles.label}>Description (optional)</Text>
          <TextInput
            style={styles.textInput}
            placeholder="Brief description of this file..."
            placeholderTextColor="#79747E"
            value={description}
            onChangeText={setDescription}
            maxLength={200}
            multiline
            numberOfLines={2}
          />

          {/* Action Buttons */}
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.attachButton} onPress={handleSubmit}>
              <Text style={styles.attachText}>Attach</Text>
            </TouchableOpacity>
          </View>
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
    marginBottom: 8,
  },
  fileName: {
    fontSize: 13,
    color: '#79747E',
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#49454F',
    marginBottom: 6,
    marginTop: 12,
  },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F5F0EB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CAC4D0',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  dropdownText: {
    fontSize: 15,
    color: '#1C1B1F',
  },
  dropdownArrow: {
    fontSize: 10,
    color: '#79747E',
  },
  dropdownList: {
    backgroundColor: '#FFFBF5',
    borderWidth: 1,
    borderColor: '#CAC4D0',
    borderRadius: 8,
    marginTop: 4,
    overflow: 'hidden',
  },
  dropdownItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E7E0EC',
  },
  dropdownItemSelected: {
    backgroundColor: '#E8F5E9',
  },
  dropdownItemText: {
    fontSize: 15,
    color: '#1C1B1F',
  },
  dropdownItemTextSelected: {
    color: colors.primary,
    fontWeight: '500',
  },
  textInput: {
    backgroundColor: '#F5F0EB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CAC4D0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1C1B1F',
    minHeight: 60,
    textAlignVertical: 'top',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
    gap: 12,
  },
  cancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#79747E',
  },
  attachButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
  },
  attachText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
  },
});
