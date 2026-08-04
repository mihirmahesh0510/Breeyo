import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import type { VisitType } from '@breeyo/types';
import { useGeneratePdf } from '../hooks/useGeneratePdf';

interface ShareOptionsSheetProps {
  visible: boolean;
  consultationId: string;
  visitType: VisitType;
  petId?: string;
  vaccinationId?: string;
  onClose: () => void;
}

interface ShareOption {
  key: string;
  label: string;
  description: string;
  icon: string;
}

const BASE_OPTIONS: ShareOption[] = [
  {
    key: 'ownerSummary',
    label: 'Owner Summary',
    description: 'Clean summary with diagnosis and medications',
    icon: 'doc',
  },
  {
    key: 'clinicalRecord',
    label: 'Clinical Record',
    description: 'Full SOAP clinical record with all details',
    icon: 'clip',
  },
  {
    key: 'prescriptionPad',
    label: 'Prescription Pad',
    description: 'Traditional Rx pad format for owner',
    icon: 'rx',
  },
];

const VACCINATION_OPTION: ShareOption = {
  key: 'vaccinationCertificate',
  label: 'Vaccination Certificate',
  description: 'Formal certificate for compliance',
  icon: 'cert',
};

export function ShareOptionsSheet({
  visible,
  consultationId,
  visitType,
  petId,
  vaccinationId,
  onClose,
}: ShareOptionsSheetProps) {
  const {
    generateOwnerSummary,
    generateClinicalRecord,
    generatePrescriptionPad,
    generateVaccinationCertificate,
    isGenerating,
    error,
  } = useGeneratePdf();

  const options: ShareOption[] = [
    ...BASE_OPTIONS,
    ...(visitType === 'vaccination' && petId && vaccinationId
      ? [VACCINATION_OPTION]
      : []),
  ];

  const handleOptionPress = async (key: string) => {
    try {
      switch (key) {
        case 'ownerSummary':
          await generateOwnerSummary(consultationId);
          break;
        case 'clinicalRecord':
          await generateClinicalRecord(consultationId);
          break;
        case 'prescriptionPad':
          await generatePrescriptionPad(consultationId);
          break;
        case 'vaccinationCertificate':
          if (petId && vaccinationId) {
            await generateVaccinationCertificate(petId, vaccinationId);
          }
          break;
      }
      onClose();
    } catch {
      // Error is tracked in useGeneratePdf hook state
    }
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
          <Text style={styles.title}>Share Document</Text>

          {isGenerating ? (
            <View style={styles.generatingContainer}>
              <ActivityIndicator size="large" color="#2E7D32" />
              <Text style={styles.generatingText}>Generating PDF...</Text>
            </View>
          ) : (
            <>
              {options.map((option) => (
                <TouchableOpacity
                  key={option.key}
                  style={styles.option}
                  onPress={() => handleOptionPress(option.key)}
                  activeOpacity={0.7}
                >
                  <View style={styles.optionIcon}>
                    <Text style={styles.optionIconText}>
                      {option.icon.toUpperCase().substring(0, 2)}
                    </Text>
                  </View>
                  <View style={styles.optionContent}>
                    <Text style={styles.optionLabel}>{option.label}</Text>
                    <Text style={styles.optionDescription}>
                      {option.description}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}

              {error ? (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}
            </>
          )}

          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
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
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E7E0EC',
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  optionIconText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2E7D32',
  },
  optionContent: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1C1B1F',
  },
  optionDescription: {
    fontSize: 12,
    color: '#79747E',
    marginTop: 1,
  },
  generatingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 12,
  },
  generatingText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#49454F',
  },
  errorContainer: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#FFDAD6',
    borderRadius: 8,
  },
  errorText: {
    fontSize: 13,
    color: '#B3261E',
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
