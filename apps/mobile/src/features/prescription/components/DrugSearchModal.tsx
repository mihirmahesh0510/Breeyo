import React, { useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '@breeyo/ui';
import { useDrugSearch } from '../../consultation/hooks/useDrugSearch';
import type { DrugSearchResult, DrugFormulation } from '@breeyo/types';

interface DrugSearchModalProps {
  visible: boolean;
  onDismiss: () => void;
  onSelectDrug: (drug: DrugSearchResult) => void;
  onManualEntry: () => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  antibiotic: '#E8F5E9',
  nsaid: '#FFF3E0',
  antiparasitic: '#F3E5F5',
  vaccine: '#E3F2FD',
  antifungal: '#FCE4EC',
  corticosteroid: '#FFF9C4',
  antiemetic: '#E0F7FA',
  cardiac: '#FFEBEE',
  supplement: '#F1F8E9',
  other: '#F5F5F5',
};

const CATEGORY_TEXT_COLORS: Record<string, string> = {
  antibiotic: colors.primary,
  nsaid: colors.tertiary,
  antiparasitic: '#7B1FA2',
  vaccine: '#1565C0',
  antifungal: '#C62828',
  corticosteroid: '#F9A825',
  antiemetic: '#00838F',
  cardiac: '#B71C1C',
  supplement: '#558B2F',
  other: '#616161',
};

function FormulationChip({ form }: { form: DrugFormulation }) {
  return (
    <View style={styles.formulationChip}>
      <Text style={styles.formulationChipText}>
        {form.form} {form.strength}
      </Text>
    </View>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const bgColor = CATEGORY_COLORS[category] || CATEGORY_COLORS.other;
  const textColor =
    CATEGORY_TEXT_COLORS[category] || CATEGORY_TEXT_COLORS.other;
  return (
    <View style={[styles.categoryBadge, { backgroundColor: bgColor }]}>
      <Text style={[styles.categoryBadgeText, { color: textColor }]}>
        {category}
      </Text>
    </View>
  );
}

function SkeletonRow() {
  return (
    <View style={styles.skeletonRow}>
      <View style={styles.skeletonTitle} />
      <View style={styles.skeletonSubtitle} />
      <View style={styles.skeletonChips}>
        <View style={styles.skeletonChip} />
        <View style={styles.skeletonChip} />
      </View>
    </View>
  );
}

export function DrugSearchModal({
  visible,
  onDismiss,
  onSelectDrug,
  onManualEntry,
}: DrugSearchModalProps) {
  const { searchDrugs, clearSearch, results, isLoading, query } =
    useDrugSearch();
  const inputRef = useRef<TextInput>(null);
  const [inputValue, setInputValue] = React.useState('');

  useEffect(() => {
    if (visible) {
      // Auto-focus with a small delay for modal animation
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setInputValue('');
      clearSearch();
    }
  }, [visible, clearSearch]);

  const handleTextChange = useCallback(
    (text: string) => {
      setInputValue(text);
      searchDrugs(text);
    },
    [searchDrugs],
  );

  const handleSelectDrug = useCallback(
    (drug: DrugSearchResult) => {
      onSelectDrug(drug);
    },
    [onSelectDrug],
  );

  const hasQuery = inputValue.trim().length > 0;
  const showNoResults = hasQuery && !isLoading && query.trim().length > 0 && results.length === 0;
  const showResults = results.length > 0;
  const showSearching = isLoading && hasQuery;

  const renderDrugItem = useCallback(
    ({ item }: { item: DrugSearchResult }) => (
      <Pressable
        style={styles.drugItem}
        onPress={() => handleSelectDrug(item)}
        accessibilityLabel={`Select ${item.name}`}
        accessibilityRole="button"
      >
        <View style={styles.drugItemHeader}>
          <Text style={styles.drugName} numberOfLines={1}>
            {item.name}
          </Text>
          <CategoryBadge category={item.category} />
        </View>
        <Text style={styles.genericName} numberOfLines={1}>
          {item.genericName}
        </Text>
        {item.formulations.length > 0 && (
          <View style={styles.formulationsRow}>
            {item.formulations.map((f) => (
              <FormulationChip key={f.id} form={f} />
            ))}
          </View>
        )}
      </Pressable>
    ),
    [handleSelectDrug],
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onDismiss}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={onDismiss}
            style={styles.closeButton}
            accessibilityLabel="Close drug search"
            accessibilityRole="button"
            hitSlop={8}
          >
            <MaterialCommunityIcons name="close" size={24} color="#1C1B1F" />
          </Pressable>
          <Text style={styles.headerTitle}>Search Drug</Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Search Input */}
        <View style={styles.searchContainer}>
          <MaterialCommunityIcons
            name="magnify"
            size={20}
            color="#79747E"
            style={styles.searchIcon}
          />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder="Search by drug or generic name..."
            placeholderTextColor="#79747E"
            value={inputValue}
            onChangeText={handleTextChange}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {inputValue.length > 0 && (
            <Pressable
              onPress={() => handleTextChange('')}
              hitSlop={8}
              accessibilityLabel="Clear search"
            >
              <MaterialCommunityIcons
                name="close-circle"
                size={20}
                color="#79747E"
              />
            </Pressable>
          )}
        </View>

        {/* Content Area */}
        <View style={styles.content}>
          {/* Default state - no query */}
          {!hasQuery && !isLoading && (
            <View style={styles.defaultState}>
              <MaterialCommunityIcons
                name="pill"
                size={48}
                color="#CAC4D0"
              />
              <Text style={styles.defaultText}>
                Type a drug name to search
              </Text>
            </View>
          )}

          {/* Searching skeleton */}
          {showSearching && (
            <View style={styles.skeletonContainer}>
              <View style={styles.searchingHeader}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.searchingText}>Searching...</Text>
              </View>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </View>
          )}

          {/* Results */}
          {showResults && (
            <FlatList
              data={results}
              keyExtractor={(item) => item.id}
              renderItem={renderDrugItem}
              contentContainerStyle={styles.resultsList}
              keyboardShouldPersistTaps="handled"
            />
          )}

          {/* No results */}
          {showNoResults && (
            <View style={styles.noResults}>
              <MaterialCommunityIcons
                name="magnify-close"
                size={48}
                color="#CAC4D0"
              />
              <Text style={styles.noResultsTitle}>Drug not found</Text>
              <Text style={styles.noResultsText}>
                You can enter details manually.
              </Text>
              <Pressable
                style={styles.manualEntryButton}
                onPress={onManualEntry}
                accessibilityLabel="Manual drug entry"
                accessibilityRole="button"
              >
                <MaterialCommunityIcons
                  name="pencil-plus"
                  size={18}
                  color={colors.primary}
                />
                <Text style={styles.manualEntryText}>Manual Entry</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFBF5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E7E0EC',
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '500',
    color: '#1C1B1F',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    height: 48,
    backgroundColor: '#F5F0EB',
    borderRadius: 24,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#1C1B1F',
    height: 48,
  },
  content: {
    flex: 1,
  },
  defaultState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  defaultText: {
    fontSize: 14,
    color: '#79747E',
  },
  skeletonContainer: {
    padding: 16,
  },
  searchingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  searchingText: {
    fontSize: 14,
    color: '#49454F',
  },
  skeletonRow: {
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F0EB',
  },
  skeletonTitle: {
    width: '60%',
    height: 16,
    backgroundColor: '#E7E0EC',
    borderRadius: 4,
  },
  skeletonSubtitle: {
    width: '40%',
    height: 12,
    backgroundColor: '#F5F0EB',
    borderRadius: 4,
  },
  skeletonChips: {
    flexDirection: 'row',
    gap: 8,
  },
  skeletonChip: {
    width: 64,
    height: 20,
    backgroundColor: '#F5F0EB',
    borderRadius: 10,
  },
  resultsList: {
    paddingHorizontal: 16,
  },
  drugItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F0EB',
    gap: 4,
  },
  drugItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  drugName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1C1B1F',
    flex: 1,
  },
  genericName: {
    fontSize: 13,
    color: '#49454F',
  },
  formulationsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  formulationChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: '#F5F0EB',
  },
  formulationChipText: {
    fontSize: 11,
    color: colors.secondary,
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  noResults: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 24,
  },
  noResultsTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1C1B1F',
  },
  noResultsText: {
    fontSize: 14,
    color: '#49454F',
    textAlign: 'center',
  },
  manualEntryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.primary,
    marginTop: 8,
  },
  manualEntryText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.primary,
  },
});
