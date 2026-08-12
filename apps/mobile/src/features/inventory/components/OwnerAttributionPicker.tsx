import React, { useCallback, useState } from 'react';
import { View, FlatList, Pressable, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { Button, FormField, BreeyoChip, BreeyoIconButton } from '@breeyo/ui';
import { useOwnerSearch } from '../hooks/useOwnerSearch';

export interface OwnerAttributionPickerProps {
  selectedOwnerId: string | null;
  selectedOwnerName: string | null;
  onSelect: (ownerId: string, ownerName: string) => void;
  onClear: () => void;
  testID?: string;
}

const HELPER_CAPTION = "Links this sale to the owner's account for invoicing";

/**
 * D-60: optional owner attribution for counter sales (no consultationId).
 * `DispenseScreen` only renders this when the dispense has no consultation
 * to attach to -- a consultation-linked dispense already knows the pet/owner
 * from the EMR context (D-49), so this picker would be redundant there.
 *
 * Three states:
 *  - collapsed: "Attach to owner (optional)" text button
 *  - expanded: debounced owner search (useOwnerSearch, mirrors
 *    usePatientSearch's pattern -- see that hook's own doc comment)
 *  - selected: chip with the owner's name + a clear (x) icon button
 */
export function OwnerAttributionPicker({
  selectedOwnerId,
  selectedOwnerName,
  onSelect,
  onClear,
  testID,
}: OwnerAttributionPickerProps) {
  const [expanded, setExpanded] = useState(false);
  const { searchTerm, setSearchTerm, results, isSearching } = useOwnerSearch();

  const handleSelect = useCallback(
    (ownerId: string, ownerName: string) => {
      onSelect(ownerId, ownerName);
      setExpanded(false);
      setSearchTerm('');
    },
    [onSelect, setSearchTerm],
  );

  const handleCancel = useCallback(() => {
    setExpanded(false);
    setSearchTerm('');
  }, [setSearchTerm]);

  // --- Selected state ---
  if (selectedOwnerId && selectedOwnerName) {
    return (
      <View style={styles.container} testID={testID}>
        <View style={styles.selectedRow}>
          <BreeyoChip label={selectedOwnerName} selected testID={testID ? `${testID}-chip` : undefined} />
          <BreeyoIconButton
            icon="close"
            onPress={onClear}
            accessibilityLabel={`Remove ${selectedOwnerName} from this sale`}
            testID={testID ? `${testID}-clear` : undefined}
          />
        </View>
        <Text variant="bodySmall" style={styles.caption} testID={testID ? `${testID}-caption` : undefined}>
          {HELPER_CAPTION}
        </Text>
      </View>
    );
  }

  // --- Collapsed state ---
  if (!expanded) {
    return (
      <View style={styles.container} testID={testID}>
        <Button
          variant="text"
          label="Attach to owner (optional)"
          onPress={() => setExpanded(true)}
          testID={testID ? `${testID}-expand` : undefined}
        />
        <Text variant="bodySmall" style={styles.caption} testID={testID ? `${testID}-caption` : undefined}>
          {HELPER_CAPTION}
        </Text>
      </View>
    );
  }

  // --- Expanded (search) state ---
  return (
    <View style={styles.container} testID={testID}>
      <FormField
        label="Search owner by name or phone"
        value={searchTerm}
        onChangeText={setSearchTerm}
        helperText={searchTerm.length > 0 && searchTerm.length < 2 ? 'Enter at least 2 characters' : undefined}
        testID={testID ? `${testID}-search-input` : undefined}
      />

      {isSearching && (
        <Text variant="bodySmall" style={styles.caption}>
          Searching...
        </Text>
      )}

      {!isSearching && searchTerm.length >= 2 && results.length === 0 && (
        <Text variant="bodySmall" style={styles.caption} testID={testID ? `${testID}-no-results` : undefined}>
          No owners found for "{searchTerm}".
        </Text>
      )}

      <FlatList
        data={results}
        keyExtractor={(item) => item.ownerId}
        scrollEnabled={false}
        testID={testID ? `${testID}-results` : undefined}
        renderItem={({ item }) => (
          <Pressable
            style={styles.resultRow}
            onPress={() => handleSelect(item.ownerId, item.ownerName)}
            accessibilityRole="button"
            testID={testID ? `${testID}-result-${item.ownerId}` : undefined}
          >
            <Text variant="bodyLarge" style={styles.resultName}>
              {item.ownerName}
            </Text>
            <Text variant="bodySmall" style={styles.resultMobile}>
              {item.mobile}
            </Text>
          </Pressable>
        )}
      />

      <Button variant="text" label="Cancel" onPress={handleCancel} testID={testID ? `${testID}-cancel` : undefined} />

      <Text variant="bodySmall" style={styles.caption} testID={testID ? `${testID}-caption` : undefined}>
        {HELPER_CAPTION}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
  },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  caption: {
    color: '#49454F',
    marginTop: 4,
  },
  resultRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#CAC4D0',
  },
  resultName: {
    color: '#1C1B1F',
  },
  resultMobile: {
    color: '#49454F',
    marginTop: 2,
  },
});
