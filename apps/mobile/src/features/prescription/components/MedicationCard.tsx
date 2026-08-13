import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { PrescriptionItem } from '@breeyo/types';

interface MedicationCardProps {
  item: PrescriptionItem;
  onEdit: (item: PrescriptionItem) => void;
  onRemove: (item: PrescriptionItem) => void;
  readOnly?: boolean;
}

export function MedicationCard({
  item,
  onEdit,
  onRemove,
  readOnly = false,
}: MedicationCardProps) {
  const [confirmRemove, setConfirmRemove] = useState(false);

  const handleRemovePress = useCallback(() => {
    setConfirmRemove(true);
  }, []);

  const handleConfirmRemove = useCallback(() => {
    setConfirmRemove(false);
    onRemove(item);
  }, [item, onRemove]);

  const handleCancelRemove = useCallback(() => {
    setConfirmRemove(false);
  }, []);

  const dosageSummary = [
    item.dosage ? `${item.dosage}mg` : null,
    item.route,
    item.frequency,
    item.duration,
  ]
    .filter(Boolean)
    .join(' | ');

  return (
    <View style={styles.container}>
      {/* Confirm removal overlay */}
      {confirmRemove && (
        <View style={styles.confirmOverlay}>
          <Text style={styles.confirmText}>Remove {item.drugName}?</Text>
          <View style={styles.confirmActions}>
            <Pressable
              style={styles.confirmCancelBtn}
              onPress={handleCancelRemove}
              accessibilityLabel="Cancel removal"
              accessibilityRole="button"
            >
              <Text style={styles.confirmCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={styles.confirmRemoveBtn}
              onPress={handleConfirmRemove}
              accessibilityLabel={`Confirm remove ${item.drugName}`}
              accessibilityRole="button"
            >
              <Text style={styles.confirmRemoveText}>Remove</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Card content */}
      {!confirmRemove && (
        <>
          <View style={styles.contentRow}>
            {/* Drug info */}
            <View style={styles.info}>
              <View style={styles.nameRow}>
                <Text style={styles.drugName} numberOfLines={1}>
                  {item.drugName}
                </Text>
                {item.formulation ? (
                  <View style={styles.formulationBadge}>
                    <Text style={styles.formulationBadgeText}>
                      {item.formulation}
                    </Text>
                  </View>
                ) : null}
              </View>

              <Text style={styles.dosageSummary} numberOfLines={1}>
                {dosageSummary}
              </Text>

              <View style={styles.bottomRow}>
                <View
                  style={[
                    styles.statusBadge,
                    item.dispensed
                      ? styles.dispensedBadge
                      : styles.prescribedBadge,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusBadgeText,
                      item.dispensed
                        ? styles.dispensedText
                        : styles.prescribedText,
                    ]}
                  >
                    {item.dispensed ? 'Dispensed' : 'Prescribed'}
                  </Text>
                </View>
              </View>

              {item.ownerInstructions ? (
                <Text style={styles.ownerPreview} numberOfLines={2}>
                  {item.ownerInstructions}
                </Text>
              ) : null}
            </View>

            {/* Action icons */}
            {!readOnly && (
              <View style={styles.actions}>
                <Pressable
                  onPress={() => onEdit(item)}
                  hitSlop={8}
                  style={styles.actionButton}
                  accessibilityLabel={`Edit ${item.drugName}`}
                  accessibilityRole="button"
                >
                  <MaterialCommunityIcons
                    name="pencil-outline"
                    size={18}
                    color="#49454F"
                  />
                </Pressable>
                <Pressable
                  onPress={handleRemovePress}
                  hitSlop={8}
                  style={styles.actionButton}
                  accessibilityLabel={`Remove ${item.drugName}`}
                  accessibilityRole="button"
                >
                  <MaterialCommunityIcons
                    name="close-circle-outline"
                    size={18}
                    color="#BA1A1A"
                  />
                </Pressable>
              </View>
            )}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 72,
    backgroundColor: '#FFFBF5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 8,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  info: {
    flex: 1,
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  drugName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1C1B1F',
    flexShrink: 1,
  },
  formulationBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: '#F5F0EB',
  },
  formulationBadgeText: {
    fontSize: 11,
    color: '#5D4037',
    textTransform: 'capitalize',
  },
  dosageSummary: {
    fontSize: 13,
    color: '#49454F',
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  dispensedBadge: {
    backgroundColor: '#E8F5E9',
  },
  prescribedBadge: {
    backgroundColor: '#FFF3E0',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  dispensedText: {
    color: '#2E7D32',
  },
  prescribedText: {
    color: '#E65100',
  },
  ownerPreview: {
    fontSize: 12,
    color: '#79747E',
    fontStyle: 'italic',
    marginTop: 2,
  },
  actions: {
    flexDirection: 'column',
    gap: 8,
    paddingTop: 2,
  },
  actionButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmOverlay: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 12,
  },
  confirmText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1C1B1F',
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 12,
  },
  confirmCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#CAC4D0',
  },
  confirmCancelText: {
    fontSize: 13,
    color: '#49454F',
  },
  confirmRemoveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#FFEBEE',
  },
  confirmRemoveText: {
    fontSize: 13,
    color: '#BA1A1A',
    fontWeight: '500',
  },
});
