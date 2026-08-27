import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Text, TextInput as PaperTextInput, Divider } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SPECIES_LIST, BREEDS, SPECIES_ICONS } from '@breeyo/types';
import type { Species } from '@breeyo/types';
import { colors as COLORS } from '@breeyo/ui';

// --- Props ---

export interface SpeciesBreedPickerProps {
  species: Species | null;
  breed: string;
  onSpeciesChange: (species: Species) => void;
  onBreedChange: (breed: string) => void;
  testID?: string;
}

// --- Component ---

export function SpeciesBreedPicker({
  species,
  breed,
  onSpeciesChange,
  onBreedChange,
  testID,
}: SpeciesBreedPickerProps) {
  const [speciesModalVisible, setSpeciesModalVisible] = useState(false);
  const [breedModalVisible, setBreedModalVisible] = useState(false);
  const [speciesSearch, setSpeciesSearch] = useState('');
  const [breedSearch, setBreedSearch] = useState('');

  // Filter species list based on search
  const filteredSpecies = useMemo(() => {
    if (!speciesSearch.trim()) return [...SPECIES_LIST];
    const query = speciesSearch.toLowerCase().trim();
    return SPECIES_LIST.filter((s) => s.label.toLowerCase().includes(query));
  }, [speciesSearch]);

  // Filter breed list based on selected species and search
  const filteredBreeds = useMemo(() => {
    if (!species) return [];
    const allBreeds = BREEDS[species].filter((b) => b !== ''); // remove empty entry
    if (!breedSearch.trim()) return allBreeds;
    const query = breedSearch.toLowerCase().trim();
    return allBreeds.filter((b) => b.toLowerCase().includes(query));
  }, [species, breedSearch]);

  const selectedSpeciesLabel = useMemo(() => {
    if (!species) return '';
    const found = SPECIES_LIST.find((s) => s.value === species);
    return found?.label ?? species;
  }, [species]);

  const handleSelectSpecies = useCallback(
    (selected: Species) => {
      onSpeciesChange(selected);
      onBreedChange(''); // reset breed when species changes
      setSpeciesModalVisible(false);
      setSpeciesSearch('');
    },
    [onSpeciesChange, onBreedChange],
  );

  const handleSelectBreed = useCallback(
    (selected: string) => {
      onBreedChange(selected);
      setBreedModalVisible(false);
      setBreedSearch('');
    },
    [onBreedChange],
  );

  const handleCustomBreed = useCallback(() => {
    if (breedSearch.trim()) {
      onBreedChange(breedSearch.trim());
      setBreedModalVisible(false);
      setBreedSearch('');
    }
  }, [breedSearch, onBreedChange]);

  // --- Render helpers ---

  const renderSpeciesItem = useCallback(
    ({ item }: { item: (typeof SPECIES_LIST)[number] }) => {
      const iconName = SPECIES_ICONS[item.value] as keyof typeof MaterialCommunityIcons.glyphMap;
      const isSelected = item.value === species;

      return (
        <Pressable
          style={[styles.listItem, isSelected && styles.listItemSelected]}
          onPress={() => handleSelectSpecies(item.value)}
          accessibilityRole="button"
          accessibilityLabel={`Select ${item.label}`}
          accessibilityState={{ selected: isSelected }}
          testID={`species-option-${item.value}`}
        >
          <MaterialCommunityIcons
            name={iconName}
            size={28}
            color={isSelected ? COLORS.primary : COLORS.onSurfaceVariant}
          />
          <Text
            variant="bodyLarge"
            style={[
              styles.listItemLabel,
              isSelected && { color: COLORS.primary, fontWeight: '600' },
            ]}
          >
            {item.label}
          </Text>
          {isSelected && (
            <MaterialCommunityIcons
              name="check"
              size={20}
              color={COLORS.primary}
            />
          )}
        </Pressable>
      );
    },
    [species, handleSelectSpecies],
  );

  const renderBreedItem = useCallback(
    ({ item }: { item: string }) => {
      const isSelected = item === breed;

      return (
        <Pressable
          style={[styles.listItem, isSelected && styles.listItemSelected]}
          onPress={() => handleSelectBreed(item)}
          accessibilityRole="button"
          accessibilityLabel={`Select ${item}`}
          accessibilityState={{ selected: isSelected }}
          testID={`breed-option-${item.replace(/\s/g, '-')}`}
        >
          <Text
            variant="bodyLarge"
            style={[
              styles.listItemLabel,
              { flex: 1 },
              isSelected && { color: COLORS.primary, fontWeight: '600' },
            ]}
          >
            {item}
          </Text>
          {isSelected && (
            <MaterialCommunityIcons
              name="check"
              size={20}
              color={COLORS.primary}
            />
          )}
        </Pressable>
      );
    },
    [breed, handleSelectBreed],
  );

  return (
    <View testID={testID}>
      {/* Species Picker Trigger */}
      <Pressable
        style={styles.pickerTrigger}
        onPress={() => setSpeciesModalVisible(true)}
        accessibilityRole="button"
        accessibilityLabel="Select species"
        testID="species-picker-trigger"
      >
        {species ? (
          <View style={styles.pickerValue}>
            <MaterialCommunityIcons
              name={SPECIES_ICONS[species] as keyof typeof MaterialCommunityIcons.glyphMap}
              size={24}
              color={COLORS.primary}
            />
            <Text variant="bodyLarge" style={styles.pickerValueText}>
              {selectedSpeciesLabel}
            </Text>
          </View>
        ) : (
          <Text variant="bodyLarge" style={styles.pickerPlaceholder}>
            Select species *
          </Text>
        )}
        <MaterialCommunityIcons
          name="chevron-down"
          size={24}
          color={COLORS.onSurfaceVariant}
        />
      </Pressable>

      {/* Breed Picker Trigger (only visible after species selected) */}
      {species && (
        <Pressable
          style={[styles.pickerTrigger, { marginTop: 12 }]}
          onPress={() => setBreedModalVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Select breed"
          testID="breed-picker-trigger"
        >
          {breed ? (
            <Text variant="bodyLarge" style={styles.pickerValueText}>
              {breed}
            </Text>
          ) : (
            <Text variant="bodyLarge" style={styles.pickerPlaceholder}>
              Select breed (optional)
            </Text>
          )}
          <MaterialCommunityIcons
            name="chevron-down"
            size={24}
            color={COLORS.onSurfaceVariant}
          />
        </Pressable>
      )}

      {/* Species Selection Modal */}
      <Modal
        visible={speciesModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setSpeciesModalVisible(false);
          setSpeciesSearch('');
        }}
        testID="species-modal"
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalContainer}
        >
          <View style={styles.modalHeader}>
            <Text variant="titleLarge" style={styles.modalTitle}>
              Select Species
            </Text>
            <Pressable
              onPress={() => {
                setSpeciesModalVisible(false);
                setSpeciesSearch('');
              }}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={8}
            >
              <MaterialCommunityIcons
                name="close"
                size={24}
                color={COLORS.onSurface}
              />
            </Pressable>
          </View>

          <PaperTextInput
            mode="outlined"
            placeholder="Search species..."
            value={speciesSearch}
            onChangeText={setSpeciesSearch}
            left={<PaperTextInput.Icon icon="magnify" />}
            style={styles.searchInput}
            testID="species-search-input"
          />

          <FlatList
            data={filteredSpecies}
            renderItem={renderSpeciesItem}
            keyExtractor={(item) => item.value}
            ItemSeparatorComponent={() => <Divider />}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            testID="species-list"
          />
        </KeyboardAvoidingView>
      </Modal>

      {/* Breed Selection Modal */}
      <Modal
        visible={breedModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setBreedModalVisible(false);
          setBreedSearch('');
        }}
        testID="breed-modal"
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalContainer}
        >
          <View style={styles.modalHeader}>
            <Text variant="titleLarge" style={styles.modalTitle}>
              Select Breed
            </Text>
            <Pressable
              onPress={() => {
                setBreedModalVisible(false);
                setBreedSearch('');
              }}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={8}
            >
              <MaterialCommunityIcons
                name="close"
                size={24}
                color={COLORS.onSurface}
              />
            </Pressable>
          </View>

          <PaperTextInput
            mode="outlined"
            placeholder="Search or enter custom breed..."
            value={breedSearch}
            onChangeText={setBreedSearch}
            left={<PaperTextInput.Icon icon="magnify" />}
            style={styles.searchInput}
            testID="breed-search-input"
          />

          {/* Custom breed entry button */}
          {breedSearch.trim() &&
            !filteredBreeds.some(
              (b) => b.toLowerCase() === breedSearch.trim().toLowerCase(),
            ) && (
              <Pressable
                style={styles.customBreedButton}
                onPress={handleCustomBreed}
                accessibilityRole="button"
                accessibilityLabel={`Use custom breed: ${breedSearch.trim()}`}
                testID="custom-breed-button"
              >
                <MaterialCommunityIcons
                  name="plus-circle-outline"
                  size={20}
                  color={COLORS.primary}
                />
                <Text variant="bodyMedium" style={styles.customBreedText}>
                  Use "{breedSearch.trim()}" as breed
                </Text>
              </Pressable>
            )}

          <FlatList
            data={filteredBreeds}
            renderItem={renderBreedItem}
            keyExtractor={(item) => item}
            ItemSeparatorComponent={() => <Divider />}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              !breedSearch.trim() ? (
                <View style={styles.emptyContainer}>
                  <Text variant="bodyMedium" style={styles.emptyText}>
                    No breeds available for this species.
                  </Text>
                </View>
              ) : null
            }
            testID="breed-list"
          />
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// --- Styles ---

const styles = StyleSheet.create({
  pickerTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: COLORS.outline,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: COLORS.surface,
  },
  pickerValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pickerValueText: {
    color: COLORS.onSurface,
  },
  pickerPlaceholder: {
    color: COLORS.onSurfaceVariant,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  modalTitle: {
    color: COLORS.onSurface,
  },
  searchInput: {
    marginHorizontal: 16,
    marginBottom: 8,
  },
  listContent: {
    paddingBottom: 32,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 16,
  },
  listItemSelected: {
    backgroundColor: COLORS.primaryContainer,
  },
  listItemLabel: {
    flex: 1,
    color: COLORS.onSurface,
  },
  customBreedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 8,
  },
  customBreedText: {
    color: COLORS.primary,
    fontWeight: '500',
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
  },
});
