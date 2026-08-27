import React from 'react';
import { View, SectionList, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { EmptyState, colors } from '@breeyo/ui';
import type { PatientSearchResult, Species } from '@breeyo/types';
import { PatientListItem } from './PatientListItem';

interface PatientSearchResultsProps {
  results: PatientSearchResult[];
  searchTerm: string;
  isSearching: boolean;
  onSelectPet: (petId: string) => void;
  testID?: string;
}

interface OwnerSection {
  ownerId: string;
  ownerName: string;
  mobile: string;
  data: PatientSearchResult[];
}

/**
 * Format a mobile number for display. Adds a space after country code
 * and groups the remaining digits.
 * e.g., "9876543210" -> "98765 43210", "+919876543210" -> "+91 98765 43210"
 */
function formatMobile(mobile: string): string {
  const cleaned = mobile.replace(/\s+/g, '');
  if (cleaned.startsWith('+91') && cleaned.length === 13) {
    const local = cleaned.slice(3);
    return `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
  }
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 5)} ${cleaned.slice(5)}`;
  }
  return mobile;
}

/**
 * Group flat search results by owner for sectioned display.
 */
function groupByOwner(results: PatientSearchResult[]): OwnerSection[] {
  const ownerMap = new Map<string, OwnerSection>();

  for (const result of results) {
    const existing = ownerMap.get(result.ownerId);
    if (existing) {
      existing.data.push(result);
    } else {
      ownerMap.set(result.ownerId, {
        ownerId: result.ownerId,
        ownerName: result.ownerName,
        mobile: result.mobile,
        data: [result],
      });
    }
  }

  return Array.from(ownerMap.values());
}

/**
 * Highlight matching portions of text with primary color.
 */
function HighlightedText({
  text,
  highlight,
}: {
  text: string;
  highlight: string;
}) {
  if (!highlight || highlight.length < 2) {
    return <Text variant="titleMedium">{text}</Text>;
  }

  const escapedHighlight = highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedHighlight})`, 'gi');
  const parts = text.split(regex);

  return (
    <Text variant="titleMedium">
      {parts.map((part, index) =>
        regex.test(part) ? (
          <Text key={index} style={styles.highlightedText}>
            {part}
          </Text>
        ) : (
          <Text key={index}>{part}</Text>
        ),
      )}
    </Text>
  );
}

function SectionHeader({
  ownerName,
  mobile,
  searchTerm,
}: {
  ownerName: string;
  mobile: string;
  searchTerm: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <HighlightedText text={ownerName} highlight={searchTerm} />
      <Text variant="bodySmall" style={styles.sectionMobile}>
        {formatMobile(mobile)}
      </Text>
    </View>
  );
}

export function PatientSearchResults({
  results,
  searchTerm,
  isSearching,
  onSelectPet,
  testID,
}: PatientSearchResultsProps) {
  // Show minimum characters hint when search term is too short
  if (searchTerm.length > 0 && searchTerm.length < 2) {
    return (
      <EmptyState
        title="Keep typing..."
        description="Enter at least 2 characters to search."
        testID="search-min-chars"
      />
    );
  }

  // No results found for a valid search
  if (!isSearching && searchTerm.length >= 2 && results.length === 0) {
    return (
      <EmptyState
        title="No patients found"
        description={`No results for "${searchTerm}". Try a different name, mobile number, or pet name.`}
        testID="search-no-results"
      />
    );
  }

  const sections = groupByOwner(results);

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => `${item.ownerId}-${item.petId}`}
      renderItem={({ item }) => (
        <PatientListItem
          petId={item.petId}
          petName={item.petName}
          species={item.species as Species}
          ownerName={item.ownerName}
          onPress={onSelectPet}
          testID={`search-result-${item.petId}`}
        />
      )}
      renderSectionHeader={({ section }) => (
        <SectionHeader
          ownerName={section.ownerName}
          mobile={section.mobile}
          searchTerm={searchTerm}
        />
      )}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={styles.listContent}
      testID={testID}
    />
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: '#F5F0EB',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#CAC4D0',
  },
  sectionMobile: {
    color: '#49454F',
    marginTop: 2,
  },
  highlightedText: {
    color: colors.primary,
    fontWeight: '700',
  },
  listContent: {
    flexGrow: 1,
  },
});
