import React, { useMemo, useState } from 'react';
import { View, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { BottomSheet, SearchBar, colors } from '@breeyo/ui';
import { formatPaiseINR } from '../lib/format';
import {
  BUILDER_COPY,
  catalogEntryAvailability,
  sortCatalogEntries,
  type ServiceCatalogEntry,
} from '../lib/builder-copy';
import { parseRupeesToPaise } from '../lib/builder-state';

export interface ServiceCatalogSheetProps {
  visible: boolean;
  onDismiss: () => void;
  services: readonly ServiceCatalogEntry[];
  /** Adds a line. The sheet stays open (D-02 interaction contract). */
  onSelect: (service: ServiceCatalogEntry) => void;
  /** Creates the service in the catalog and adds it to the invoice. */
  onAddCustom: (name: string, pricePaise: number) => void;
  searchTerm: string;
  onSearchTermChange: (term: string) => void;
  isSearching?: boolean;
  isCreatingCustom?: boolean;
  testID?: string;
}

const COLORS = {
  surfaceVariant: '#F5F0EB',
  outlineVariant: '#CAC4D0',
  onSurface: '#1C1B1F',
  onSurfaceVariant: '#49454F',
  primary: colors.primary,
  error: '#BA1A1A',
  disabled: '#9E9E9E',
} as const;

/**
 * The D-02 service catalog sheet.
 *
 * ## The sheet stays open after an add
 *
 * That is the D-02 interaction contract, and it is the whole point: a
 * consultation plus a vaccination plus a nail trim is three taps, not three
 * open-search-tap-dismiss cycles. Dismissal is explicit — tap outside or swipe
 * down. Each add fires a light haptic so the tap is confirmed without the sheet
 * having to move.
 *
 * ## D-45: out of stock is shown, disabled and explained
 *
 * An entry that cannot be added stays in the list, greyed, with the reason
 * beside it. Hiding it would send the front desk looking for an item they know
 * the clinic carries and, failing to find it, billing it as a custom line at a
 * price they invent. Leaving it selectable would fail at finalize with a 409,
 * after the owner has been quoted a total.
 *
 * ## Money
 *
 * Prices render through `formatPaiseINR`. The custom-service price field is one
 * of exactly two places in the builder where a rupee figure the user typed
 * becomes paise, and it delegates that to `parseRupeesToPaise` rather than
 * converting inline (T-06-105).
 */
export function ServiceCatalogSheet({
  visible,
  onDismiss,
  services,
  onSelect,
  onAddCustom,
  searchTerm,
  onSearchTermChange,
  isSearching = false,
  isCreatingCustom = false,
  testID,
}: ServiceCatalogSheetProps) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [priceError, setPriceError] = useState<string | null>(null);

  const sorted = useMemo(() => sortCatalogEntries(services), [services]);

  const submitCustom = () => {
    const parsed = parseRupeesToPaise(customPrice);
    if (!parsed.ok) {
      setPriceError(parsed.error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      return;
    }
    if (customName.trim() === '') {
      setPriceError(null);
      return;
    }

    setPriceError(null);
    onAddCustom(customName.trim(), parsed.paise);
    setCustomName('');
    setCustomPrice('');
    setCustomOpen(false);
  };

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      title={BUILDER_COPY.addService}
      testID={testID ?? 'service-catalog-sheet'}
    >
      <SearchBar
        value={searchTerm}
        onChangeText={onSearchTermChange}
        placeholder={BUILDER_COPY.serviceSearchPlaceholder}
        testID="service-catalog-search"
      />

      <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
        {sorted.length === 0 && !isSearching && (
          <Text variant="bodySmall" style={styles.emptyNote} testID="service-catalog-empty">
            {BUILDER_COPY.catalogEmpty}
          </Text>
        )}

        {sorted.map((service) => {
          const availability = catalogEntryAvailability(service);

          return (
            <Pressable
              key={service.id}
              style={styles.item}
              disabled={!availability.selectable}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                onSelect(service);
                // Deliberately no onDismiss(): D-02 keeps the sheet open.
              }}
              accessibilityRole="button"
              accessibilityState={{ disabled: !availability.selectable }}
              testID={`service-catalog-item-${service.id}`}
            >
              <View style={styles.itemText}>
                <Text
                  variant="titleMedium"
                  numberOfLines={1}
                  style={availability.selectable ? styles.itemName : styles.itemNameDisabled}
                >
                  {service.name}
                </Text>
                {availability.note && (
                  <Text
                    variant="bodySmall"
                    style={styles.itemNote}
                    testID={`service-catalog-note-${service.id}`}
                  >
                    {availability.note}
                  </Text>
                )}
              </View>
              <Text
                variant="bodyLarge"
                style={availability.selectable ? styles.itemPrice : styles.itemNameDisabled}
              >
                {formatPaiseINR(service.price)}
              </Text>
            </Pressable>
          );
        })}

        {!customOpen && (
          <Pressable
            style={styles.customCta}
            onPress={() => setCustomOpen(true)}
            accessibilityRole="button"
            testID="service-catalog-add-custom"
          >
            <MaterialCommunityIcons name="plus" size={20} color={COLORS.primary} />
            <Text variant="titleMedium" style={styles.customCtaLabel}>
              {BUILDER_COPY.addCustomService}
            </Text>
          </Pressable>
        )}

        {customOpen && (
          <View style={styles.customForm} testID="service-catalog-custom-form">
            <TextInput
              mode="outlined"
              dense
              label={BUILDER_COPY.customServiceNamePlaceholder}
              value={customName}
              onChangeText={setCustomName}
              accessibilityLabel={BUILDER_COPY.customServiceNamePlaceholder}
              testID="custom-service-name"
            />
            <TextInput
              mode="outlined"
              dense
              label={BUILDER_COPY.customServicePricePlaceholder}
              value={customPrice}
              onChangeText={(next) => {
                setCustomPrice(next);
                setPriceError(null);
              }}
              keyboardType="decimal-pad"
              error={!!priceError}
              accessibilityLabel={BUILDER_COPY.customServicePricePlaceholder}
              testID="custom-service-price"
            />
            {priceError && (
              <Text variant="bodySmall" style={styles.error} testID="custom-service-price-error">
                {priceError}
              </Text>
            )}
            <Pressable
              style={styles.customSubmit}
              onPress={submitCustom}
              disabled={isCreatingCustom || customName.trim() === ''}
              accessibilityRole="button"
              testID="custom-service-submit"
            >
              <Text variant="titleMedium" style={styles.customCtaLabel}>
                {BUILDER_COPY.addService}
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  list: {
    maxHeight: 420,
    marginTop: 8,
  },
  item: {
    // 44x44pt minimum touch target (Phase 2 standard); 56px matches the shared
    // ListItem height so the sheet reads as one list with the rest of the app.
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.outlineVariant,
  },
  itemText: {
    flex: 1,
    marginRight: 8,
  },
  itemName: {
    color: COLORS.onSurface,
  },
  itemNameDisabled: {
    color: COLORS.disabled,
  },
  itemNote: {
    color: COLORS.error,
  },
  itemPrice: {
    color: COLORS.onSurface,
  },
  emptyNote: {
    color: COLORS.onSurfaceVariant,
    padding: 16,
  },
  customCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 56,
    paddingHorizontal: 16,
  },
  customCtaLabel: {
    color: COLORS.primary,
  },
  customForm: {
    padding: 16,
    gap: 8,
    backgroundColor: COLORS.surfaceVariant,
  },
  customSubmit: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    color: COLORS.error,
  },
});
