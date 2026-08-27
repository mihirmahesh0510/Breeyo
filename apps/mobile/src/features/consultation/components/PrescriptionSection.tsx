import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  StyleSheet,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '@breeyo/ui';
import type {
  PrescriptionItem,
  DrugSearchResult,
} from '@breeyo/types';
import { DrugSearchModal } from '../../prescription/components/DrugSearchModal';
import { MedicationForm } from '../../prescription/components/MedicationForm';
import { MedicationCard } from '../../prescription/components/MedicationCard';

interface PrescriptionSectionProps {
  medications: PrescriptionItem[];
  onMedicationsChange: (items: PrescriptionItem[]) => void;
  generalNotes: string;
  onGeneralNotesChange: (notes: string) => void;
  petWeightKg?: number;
  petSpecies?: string;
}

type FormMode =
  | { type: 'closed' }
  | { type: 'search' }
  | { type: 'add'; drug: DrugSearchResult | null }
  | { type: 'edit'; item: PrescriptionItem; drug: DrugSearchResult | null };

export function PrescriptionSection({
  medications,
  onMedicationsChange,
  generalNotes,
  onGeneralNotesChange,
  petWeightKg,
  petSpecies,
}: PrescriptionSectionProps) {
  const [expanded, setExpanded] = useState(true);
  const [formMode, setFormMode] = useState<FormMode>({ type: 'closed' });

  const handleToggleExpand = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  const handleOpenSearch = useCallback(() => {
    setFormMode({ type: 'search' });
  }, []);

  const handleSelectDrug = useCallback((drug: DrugSearchResult) => {
    setFormMode({ type: 'add', drug });
  }, []);

  const handleManualEntry = useCallback(() => {
    setFormMode({ type: 'add', drug: null });
  }, []);

  const handleEditItem = useCallback((item: PrescriptionItem) => {
    setFormMode({ type: 'edit', item, drug: null });
  }, []);

  const handleRemoveItem = useCallback(
    (item: PrescriptionItem) => {
      const updated = medications.filter(
        (m) => m.drugName !== item.drugName || m.sortOrder !== item.sortOrder,
      );
      // Reindex sort orders
      const reindexed = updated.map((m, i) => ({ ...m, sortOrder: i }));
      onMedicationsChange(reindexed);
    },
    [medications, onMedicationsChange],
  );

  const handleSaveItem = useCallback(
    (item: PrescriptionItem) => {
      if (formMode.type === 'edit') {
        // Replace existing item
        const updated = medications.map((m) =>
          m.sortOrder === formMode.item.sortOrder ? item : m,
        );
        onMedicationsChange(updated);
      } else {
        // Add new item
        const newItem = { ...item, sortOrder: medications.length };
        onMedicationsChange([...medications, newItem]);
      }
      setFormMode({ type: 'closed' });
    },
    [formMode, medications, onMedicationsChange],
  );

  const handleCancelForm = useCallback(() => {
    setFormMode({ type: 'closed' });
  }, []);

  const count = medications.length;

  return (
    <View style={styles.container}>
      {/* Accordion Header */}
      <Pressable
        style={styles.header}
        onPress={handleToggleExpand}
        accessibilityLabel={`Prescriptions (${count}), ${expanded ? 'collapse' : 'expand'}`}
        accessibilityRole="button"
      >
        <MaterialCommunityIcons
          name="pill"
          size={20}
          color={colors.primary}
        />
        <Text style={styles.headerTitle}>Prescriptions ({count})</Text>
        <MaterialCommunityIcons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color="#49454F"
        />
      </Pressable>

      {/* Expanded Content */}
      {expanded && (
        <View style={styles.content}>
          {/* Medication Cards */}
          {count === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No medications added yet.</Text>
            </View>
          ) : (
            medications.map((item) => (
              <MedicationCard
                key={`${item.drugName}-${item.sortOrder}`}
                item={item}
                onEdit={handleEditItem}
                onRemove={handleRemoveItem}
              />
            ))
          )}

          {/* Add Medication Button */}
          <Pressable
            style={styles.addButton}
            onPress={handleOpenSearch}
            accessibilityLabel="Add medication"
            accessibilityRole="button"
          >
            <MaterialCommunityIcons
              name="plus-circle-outline"
              size={18}
              color={colors.primary}
            />
            <Text style={styles.addButtonText}>Add Medication</Text>
          </Pressable>

          {/* General Rx Notes */}
          <View style={styles.notesContainer}>
            <Text style={styles.notesLabel}>General Rx Notes</Text>
            <TextInput
              style={styles.notesInput}
              value={generalNotes}
              onChangeText={onGeneralNotesChange}
              placeholder="General prescription notes..."
              placeholderTextColor="#79747E"
              multiline
              numberOfLines={2}
              textAlignVertical="top"
            />
          </View>
        </View>
      )}

      {/* Drug Search Modal */}
      <DrugSearchModal
        visible={formMode.type === 'search'}
        onDismiss={handleCancelForm}
        onSelectDrug={handleSelectDrug}
        onManualEntry={handleManualEntry}
      />

      {/* Medication Form Modal */}
      <Modal
        visible={formMode.type === 'add' || formMode.type === 'edit'}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={handleCancelForm}
      >
        <View style={styles.formModalContainer}>
          {/* Modal Header */}
          <View style={styles.formModalHeader}>
            <Pressable
              onPress={handleCancelForm}
              style={styles.formCloseButton}
              accessibilityLabel="Close"
              accessibilityRole="button"
              hitSlop={8}
            >
              <MaterialCommunityIcons name="close" size={24} color="#1C1B1F" />
            </Pressable>
            <Text style={styles.formModalTitle}>
              {formMode.type === 'edit' ? 'Edit Medication' : 'Add Medication'}
            </Text>
            <View style={styles.formHeaderSpacer} />
          </View>

          {/* Form */}
          <MedicationForm
            drug={
              formMode.type === 'add'
                ? formMode.drug
                : formMode.type === 'edit'
                  ? formMode.drug
                  : null
            }
            existingItem={
              formMode.type === 'edit' ? formMode.item : null
            }
            petWeightKg={petWeightKg}
            petSpecies={petSpecies}
            onSave={handleSaveItem}
            onCancel={handleCancelForm}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFBF5',
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
    backgroundColor: '#F5F0EB',
  },
  headerTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#1C1B1F',
  },
  content: {
    padding: 12,
  },
  emptyState: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#79747E',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginTop: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.primary,
    borderStyle: 'dashed',
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.primary,
  },
  notesContainer: {
    marginTop: 16,
  },
  notesLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#49454F',
    marginBottom: 6,
  },
  notesInput: {
    height: 56,
    borderWidth: 1,
    borderColor: '#CAC4D0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    fontSize: 14,
    color: '#1C1B1F',
    backgroundColor: '#FFFBF5',
  },
  formModalContainer: {
    flex: 1,
    backgroundColor: '#FFFBF5',
  },
  formModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E7E0EC',
  },
  formCloseButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formModalTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '500',
    color: '#1C1B1F',
    textAlign: 'center',
  },
  formHeaderSpacer: {
    width: 40,
  },
});
