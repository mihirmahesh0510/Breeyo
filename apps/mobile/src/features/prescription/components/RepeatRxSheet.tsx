import React, { useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Modal,
  Pressable,
  StyleSheet,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { PrescriptionItem } from '@breeyo/types';
import { MedicationCard } from './MedicationCard';

interface PastVisitPrescription {
  visitDate: string;
  medications: PrescriptionItem[];
}

interface RepeatRxSheetProps {
  visible: boolean;
  onDismiss: () => void;
  pastPrescription: PastVisitPrescription | null;
  onRepeatAll: (medications: PrescriptionItem[], visitDate: string) => void;
}

function formatVisitDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
    });
  } catch {
    return dateStr;
  }
}

export function RepeatRxSheet({
  visible,
  onDismiss,
  pastPrescription,
  onRepeatAll,
}: RepeatRxSheetProps) {
  const handleRepeatAll = useCallback(() => {
    if (!pastPrescription) return;
    onRepeatAll(
      pastPrescription.medications,
      formatVisitDate(pastPrescription.visitDate),
    );
  }, [pastPrescription, onRepeatAll]);

  const medications = pastPrescription?.medications ?? [];
  const visitLabel = pastPrescription
    ? formatVisitDate(pastPrescription.visitDate)
    : '';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onDismiss} />
        <View style={styles.sheet}>
          {/* Handle */}
          <View style={styles.handleContainer}>
            <View style={styles.handle} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <MaterialCommunityIcons
                name="history"
                size={20}
                color="#2E7D32"
              />
              <Text style={styles.headerTitle}>Past Prescription</Text>
            </View>
            <Pressable
              onPress={onDismiss}
              hitSlop={8}
              accessibilityLabel="Close"
              accessibilityRole="button"
            >
              <MaterialCommunityIcons name="close" size={20} color="#49454F" />
            </Pressable>
          </View>

          {visitLabel ? (
            <Text style={styles.visitDate}>Visit: {visitLabel}</Text>
          ) : null}

          {/* Medication List */}
          <ScrollView
            style={styles.listContainer}
            contentContainerStyle={styles.listContent}
          >
            {medications.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>
                  No past prescriptions found.
                </Text>
              </View>
            ) : (
              medications.map((item, index) => (
                <MedicationCard
                  key={`${item.drugName}-${index}`}
                  item={item}
                  onEdit={() => {}}
                  onRemove={() => {}}
                  readOnly
                />
              ))
            )}
          </ScrollView>

          {/* Repeat All Button */}
          {medications.length > 0 && (
            <View style={styles.footer}>
              <Pressable
                style={styles.repeatAllButton}
                onPress={handleRepeatAll}
                accessibilityLabel="Repeat all prescriptions"
                accessibilityRole="button"
              >
                <MaterialCommunityIcons
                  name="content-copy"
                  size={18}
                  color="#FFFFFF"
                />
                <Text style={styles.repeatAllText}>Repeat All</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  sheet: {
    backgroundColor: '#FFFBF5',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '75%',
    paddingBottom: 32,
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  handle: {
    width: 32,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CAC4D0',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1C1B1F',
  },
  visitDate: {
    fontSize: 13,
    color: '#49454F',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  emptyState: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#79747E',
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E7E0EC',
  },
  repeatAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2E7D32',
  },
  repeatAllText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
  },
});
