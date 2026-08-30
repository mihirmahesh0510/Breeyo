import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Text, Switch, ActivityIndicator, TextInput as PaperTextInput, HelperText } from 'react-native-paper';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { createItemSchema, updateItemSchema } from '@breeyo/validators';
import { Button, FormField, BottomSheet, BreeyoTextInput, showToast, colors } from '@breeyo/ui';
import type { BarcodeFormat, BarcodeConflict } from '@breeyo/types';
import { getHsnSuggestions, type VetHsnCodeEntry } from '@breeyo/types';
import { useAuth } from '../../../providers/AuthProvider';
import { GstRatePicker } from '../components/GstRatePicker';
import {
  useInventoryItem,
  useInventoryCategories,
  useInventoryUnits,
  useCreateItem,
  useUpdateItem,
  useAddItemBarcode,
  useRemoveItemBarcode,
} from '../hooks/useInventoryApi';
import { ItemPhotoPicker } from '../components/ItemPhotoPicker';
import { isRequiredFieldsValid } from '../lib/item-form-validation';

interface FormBarcode {
  id: string;
  code: string;
  format: BarcodeFormat;
}

/** Best-effort format guess for a manually-typed barcode (D-20). The camera scanner (Plan 05) reports its own detected format. */
function guessBarcodeFormat(code: string): BarcodeFormat {
  if (/^\d+$/.test(code)) {
    if (code.length === 8) return 'ean8';
    if (code.length === 12) return 'upc_a';
    if (code.length === 13) return 'ean13';
  }
  return 'code128';
}

function buildErrorsFromZodIssues(issues: Array<{ path: (string | number)[]; message: string }>) {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? 'form');
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export function ItemFormScreen() {
  const params = useLocalSearchParams<{ itemId?: string; prefilledBarcode?: string }>();
  const itemId = params.itemId;
  const isEditMode = !!itemId;
  const router = useRouter();
  const { activeClinicId } = useAuth();

  const existingItemQuery = useInventoryItem(activeClinicId, itemId);
  const categoriesQuery = useInventoryCategories(activeClinicId);
  const unitsQuery = useInventoryUnits(activeClinicId);

  // In create mode, the item is silently created the moment the required
  // fields are valid (see the effect below) so item-scoped features --
  // photo upload and barcode linking, both of which need a real itemId --
  // become available before the user taps the final Save button. From then
  // on the rest of the form behaves like edit mode. See the plan's
  // "create-mode ordering" note (D-64).
  const [draftItemId, setDraftItemId] = useState<string | undefined>(undefined);
  const effectiveItemId = itemId ?? draftItemId;
  const draftAttempted = useRef(false);

  const createItem = useCreateItem(activeClinicId);
  const updateItem = useUpdateItem(activeClinicId, effectiveItemId);
  const addBarcode = useAddItemBarcode(activeClinicId, effectiveItemId);
  const removeBarcode = useRemoveItemBarcode(activeClinicId, effectiveItemId);

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [unit, setUnit] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [parLevel, setParLevel] = useState('');
  const [hsnSacCode, setHsnSacCode] = useState('');
  const [gstRate, setGstRate] = useState<number | null>(null);
  const [showHsnSuggestions, setShowHsnSuggestions] = useState(false);
  const [scheduleH, setScheduleH] = useState(false);
  const [notes, setNotes] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [barcodes, setBarcodes] = useState<FormBarcode[]>([]);
  const [manualBarcodeInput, setManualBarcodeInput] = useState(params.prefilledBarcode ?? '');
  const [barcodeConflict, setBarcodeConflict] = useState<{ code: string; conflict: BarcodeConflict } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [unitPickerOpen, setUnitPickerOpen] = useState(false);
  const [customCategoryText, setCustomCategoryText] = useState('');
  const [customUnitText, setCustomUnitText] = useState('');

  // Populate the form from the existing item when editing.
  useEffect(() => {
    const item = existingItemQuery.data;
    if (!item) return;
    setName(item.name);
    setCategory(item.category);
    setUnit(item.unit);
    setSellingPrice(String(item.sellingPrice));
    setParLevel(item.parLevel != null ? String(item.parLevel) : '');
    setHsnSacCode(item.hsnSacCode ?? '');
    setGstRate(item.gstRate ?? null);
    setScheduleH(item.scheduleH);
    setNotes(item.notes ?? '');
    setPhotoUrl(item.photoUrl);
    setBarcodes(item.barcodes.map((b) => ({ id: b.id, code: b.code, format: b.format })));
  }, [existingItemQuery.data]);

  const requiredFieldsValid = useCallback(
    (): boolean => isRequiredFieldsValid({ name, category, unit, sellingPrice }),
    [name, category, unit, sellingPrice],
  );

  // Silent draft creation (create mode only), per the plan's ordering note.
  useEffect(() => {
    if (isEditMode || effectiveItemId || draftAttempted.current) return;
    if (!requiredFieldsValid()) return;

    draftAttempted.current = true;
    createItem
      .mutateAsync({
        name: name.trim(),
        category,
        unit,
        sellingPrice: Number(sellingPrice),
        parLevel: parLevel.trim() ? Number(parLevel) : null,
        hsnSacCode: hsnSacCode.trim() || null,
        gstRate,
        scheduleH,
        notes: notes.trim() || null,
        photoUrl: null,
        barcodes: [],
      })
      .then((created) => setDraftItemId(created.id))
      .catch(() => {
        // Allow retrying the silent draft creation on the next required-field change.
        draftAttempted.current = false;
      });
    // Only re-evaluate readiness when the required fields themselves change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, effectiveItemId, requiredFieldsValid]);

  const buildPayload = useCallback(
    () => ({
      name: name.trim(),
      category,
      unit,
      sellingPrice: Number(sellingPrice),
      parLevel: parLevel.trim() ? Number(parLevel) : null,
      hsnSacCode: hsnSacCode.trim() || null,
      gstRate,
      scheduleH,
      notes: notes.trim() || null,
      photoUrl,
    }),
    [name, category, unit, sellingPrice, parLevel, hsnSacCode, gstRate, scheduleH, notes, photoUrl],
  );

  // INV-09: category-aware HSN/SAC suggestions (D-62 -- reference data only, no enforcement).
  // Shown once the user has typed at least 2 digits, capped at 5 suggestions.
  const hsnSuggestions: VetHsnCodeEntry[] = React.useMemo(() => {
    if (hsnSacCode.trim().length < 2) return [];
    const candidates = getHsnSuggestions(category).filter((entry) =>
      entry.code.startsWith(hsnSacCode.trim()),
    );
    return candidates.slice(0, 5);
  }, [hsnSacCode, category]);

  const handleSelectHsnSuggestion = useCallback((suggestion: VetHsnCodeEntry) => {
    setHsnSacCode(suggestion.code);
    setGstRate(suggestion.defaultGstRate);
    setShowHsnSuggestions(false);
  }, []);

  const handleAddBarcode = useCallback(async () => {
    const code = manualBarcodeInput.trim();
    if (!code) return;

    if (!effectiveItemId) {
      setErrors((prev) => ({
        ...prev,
        form: 'Fill in the required fields above before adding a barcode.',
      }));
      return;
    }

    const format = guessBarcodeFormat(code);
    const result = await addBarcode.mutateAsync({ code, format });

    if (result.success) {
      setBarcodes((prev) => [...prev, { id: result.barcode.id, code: result.barcode.code, format: result.barcode.format }]);
      setManualBarcodeInput('');
      setBarcodeConflict(null);
    } else {
      // D-63: barcode already linked to a different item -- 409 BARCODE_CONFLICT.
      // Surface the existing item with a "View Item" link instead of a generic error.
      setBarcodeConflict({ code, conflict: result.conflict });
    }
  }, [manualBarcodeInput, effectiveItemId, addBarcode]);

  const handleRemoveBarcode = useCallback(
    async (barcodeId: string) => {
      await removeBarcode.mutateAsync(barcodeId);
      setBarcodes((prev) => prev.filter((b) => b.id !== barcodeId));
    },
    [removeBarcode],
  );

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setErrors({});
    try {
      const payload = buildPayload();

      if (effectiveItemId) {
        const validation = updateItemSchema.safeParse(payload);
        if (!validation.success) {
          setErrors(buildErrorsFromZodIssues(validation.error.issues));
          return;
        }
        await updateItem.mutateAsync(validation.data);
      } else {
        const validation = createItemSchema.safeParse(payload);
        if (!validation.success) {
          setErrors(buildErrorsFromZodIssues(validation.error.issues));
          return;
        }
        const created = await createItem.mutateAsync(validation.data);
        setDraftItemId(created.id);
      }

      showToast('success', isEditMode ? 'Item updated' : `${payload.name} added to inventory`);
      router.back();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Could not save item');
    } finally {
      setIsSaving(false);
    }
  }, [buildPayload, effectiveItemId, isEditMode, updateItem, createItem, router]);

  const categories = categoriesQuery.data ?? [];
  const units = unitsQuery.data ?? [];
  const categoryLabel = categories.find((c) => c.value === category)?.label ?? category;
  const unitLabel = units.find((u) => u.value === unit)?.label ?? unit;

  if (isEditMode && existingItemQuery.isLoading) {
    return (
      <View style={styles.centered} testID="item-form-loading">
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: isEditMode ? 'Edit Item' : 'Add Inventory Item' }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content} testID="item-form-screen">
        <Text variant="headlineMedium" style={styles.title}>
          {isEditMode ? 'Edit Item' : 'Add Inventory Item'}
        </Text>

        <View style={styles.fieldGroup}>
          <FormField
            label="Item Name"
            value={name}
            onChangeText={setName}
            error={errors.name}
            required
            testID="item-form-name"
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text variant="bodySmall" style={styles.pickerLabel}>
            Category *
          </Text>
          <Pressable
            style={styles.pickerField}
            onPress={() => setCategoryPickerOpen(true)}
            testID="item-form-category-trigger"
          >
            <Text variant="bodyLarge" style={category ? styles.pickerValue : styles.pickerPlaceholder}>
              {category ? categoryLabel : 'Select category'}
            </Text>
            <MaterialCommunityIcons name="chevron-down" size={20} color="#49454F" />
          </Pressable>
          {errors.category && (
            <Text variant="bodySmall" style={styles.fieldError}>
              {errors.category}
            </Text>
          )}
        </View>

        <View style={styles.fieldGroup}>
          <Text variant="bodySmall" style={styles.pickerLabel}>
            Unit *
          </Text>
          <Pressable style={styles.pickerField} onPress={() => setUnitPickerOpen(true)} testID="item-form-unit-trigger">
            <Text variant="bodyLarge" style={unit ? styles.pickerValue : styles.pickerPlaceholder}>
              {unit ? unitLabel : 'Select unit'}
            </Text>
            <MaterialCommunityIcons name="chevron-down" size={20} color="#49454F" />
          </Pressable>
          {errors.unit && (
            <Text variant="bodySmall" style={styles.fieldError}>
              {errors.unit}
            </Text>
          )}
        </View>

        <View style={styles.fieldGroup}>
          <FormField
            label="Selling Price (Rs)"
            value={sellingPrice}
            onChangeText={setSellingPrice}
            error={errors.sellingPrice}
            required
            testID="item-form-selling-price"
          />
        </View>

        <View style={styles.fieldGroup}>
          <FormField
            label="Par Level (optional)"
            value={parLevel}
            onChangeText={setParLevel}
            error={errors.parLevel}
            helperText="Leave blank for no low-stock alerts"
            testID="item-form-par-level"
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text variant="bodySmall" style={styles.pickerLabel}>
            HSN/SAC Code (optional)
          </Text>
          {/*
            Uses react-native-paper's TextInput directly (not @breeyo/ui's
            BreeyoTextInput/FormField) because neither exposes keyboardType or
            maxLength -- same convention ManualBarcodeInput.tsx (Plan 05-05)
            already established for numeric-pad fields.
          */}
          <PaperTextInput
            label="HSN/SAC Code (optional)"
            placeholder="e.g., 30049099"
            value={hsnSacCode}
            onChangeText={(text) => {
              setHsnSacCode(text);
              setShowHsnSuggestions(true);
            }}
            keyboardType="number-pad"
            maxLength={8}
            mode="outlined"
            error={!!errors.hsnSacCode}
            accessibilityLabel="HSN/SAC Code"
            testID="item-form-hsn-code"
          />
          {errors.hsnSacCode ? (
            <HelperText type="error" visible>
              {errors.hsnSacCode}
            </HelperText>
          ) : (
            <HelperText type="info" visible>
              4-8 digit code for GST invoicing
            </HelperText>
          )}
          {showHsnSuggestions && hsnSuggestions.length > 0 && (
            <View style={styles.suggestionsBox} testID="item-form-hsn-suggestions">
              {hsnSuggestions.map((suggestion) => (
                <Pressable
                  key={suggestion.code}
                  style={styles.suggestionRow}
                  onPress={() => handleSelectHsnSuggestion(suggestion)}
                  testID={`item-form-hsn-suggestion-${suggestion.code}`}
                >
                  <Text variant="bodyMedium">
                    {suggestion.code} - {suggestion.description}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <View style={styles.fieldGroup}>
          <GstRatePicker value={gstRate} onChange={setGstRate} testID="item-form-gst-rate-picker" />
        </View>

        <View style={styles.toggleRow}>
          <View style={styles.toggleTextColumn}>
            <Text variant="bodyLarge">Schedule H / Controlled</Text>
            <Text variant="bodySmall" style={styles.helperText}>
              Mark items requiring special handling
            </Text>
          </View>
          <Switch value={scheduleH} onValueChange={setScheduleH} testID="item-form-schedule-h" />
        </View>

        <View style={styles.fieldGroup}>
          <FormField
            label="Notes (optional)"
            value={notes}
            onChangeText={setNotes}
            helperText="Storage instructions, handling warnings..."
            testID="item-form-notes"
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text variant="bodySmall" style={styles.pickerLabel}>
            Item Photo (optional)
          </Text>
          <ItemPhotoPicker
            photoUrl={photoUrl}
            itemId={effectiveItemId}
            onPhotoUploaded={setPhotoUrl}
            onRemove={() => setPhotoUrl(null)}
            testID="item-form-photo-picker"
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text variant="bodySmall" style={styles.pickerLabel}>
            Barcodes
          </Text>

          {barcodes.map((barcode) => (
            <View key={barcode.id} style={styles.barcodeRow} testID={`item-form-barcode-${barcode.id}`}>
              <Text variant="bodyLarge">
                {barcode.code} ({barcode.format})
              </Text>
              <Pressable
                onPress={() => handleRemoveBarcode(barcode.id)}
                accessibilityLabel={`Remove barcode ${barcode.code}`}
                testID={`item-form-barcode-remove-${barcode.id}`}
              >
                <MaterialCommunityIcons name="close-circle" size={20} color="#BA1A1A" />
              </Pressable>
            </View>
          ))}

          <View style={styles.barcodeInputRow}>
            <View style={styles.barcodeInputField}>
              <BreeyoTextInput
                label="Barcode Number"
                value={manualBarcodeInput}
                onChangeText={setManualBarcodeInput}
                testID="item-form-barcode-input"
              />
            </View>
            <Button
              variant="outlined"
              label="Scan or Enter Barcode"
              onPress={handleAddBarcode}
              disabled={addBarcode.isPending}
              testID="item-form-add-barcode-button"
            />
          </View>

          {/*
            D-63: a 409 BARCODE_CONFLICT response from POST .../barcodes means
            this code is already linked to a different item. useAddItemBarcode
            resolves that to { success: false, conflict } instead of throwing,
            so it's handled here rather than as a generic error toast.
          */}
          {barcodeConflict && (
            <View style={styles.conflictBox} testID="item-form-barcode-conflict">
              <Text variant="bodySmall" style={styles.conflictText}>
                This barcode is linked to &apos;{barcodeConflict.conflict.itemName}&apos;
              </Text>
              <Pressable
                onPress={() => router.push(`/(app)/(tabs)/inventory/${barcodeConflict.conflict.itemId}` as any)}
                testID="item-form-barcode-conflict-view"
              >
                <Text variant="bodySmall" style={styles.viewItemLink}>
                  View Item
                </Text>
              </Pressable>
            </View>
          )}
        </View>

        {errors.form && (
          <Text variant="bodySmall" style={styles.fieldError}>
            {errors.form}
          </Text>
        )}

        <View style={styles.actionsRow}>
          <Button variant="outlined" label="Cancel" onPress={() => router.back()} disabled={isSaving} testID="item-form-cancel" />
          <Button
            variant="filled"
            label={isEditMode ? 'Save Changes' : 'Save Item'}
            onPress={handleSave}
            loading={isSaving}
            disabled={isSaving || !requiredFieldsValid()}
            testID="item-form-save"
          />
        </View>
      </ScrollView>

      <BottomSheet
        visible={categoryPickerOpen}
        onDismiss={() => setCategoryPickerOpen(false)}
        title="Category"
        testID="item-form-category-sheet"
      >
        {categories.map((option) => (
          <Pressable
            key={option.value}
            style={styles.sheetOption}
            onPress={() => {
              setCategory(option.value);
              setCategoryPickerOpen(false);
            }}
            testID={`item-form-category-option-${option.value}`}
          >
            <Text variant="bodyLarge">{option.label}</Text>
          </Pressable>
        ))}
        <View style={styles.customEntryRow}>
          <View style={styles.barcodeInputField}>
            <BreeyoTextInput
              label="Add Custom Category"
              value={customCategoryText}
              onChangeText={setCustomCategoryText}
              testID="item-form-custom-category-input"
            />
          </View>
          <Button
            variant="text"
            label="Add"
            onPress={() => {
              if (customCategoryText.trim()) {
                setCategory(customCategoryText.trim());
                setCustomCategoryText('');
                setCategoryPickerOpen(false);
              }
            }}
            testID="item-form-add-custom-category"
          />
        </View>
      </BottomSheet>

      <BottomSheet
        visible={unitPickerOpen}
        onDismiss={() => setUnitPickerOpen(false)}
        title="Unit"
        testID="item-form-unit-sheet"
      >
        {units.map((option) => (
          <Pressable
            key={option.value}
            style={styles.sheetOption}
            onPress={() => {
              setUnit(option.value);
              setUnitPickerOpen(false);
            }}
            testID={`item-form-unit-option-${option.value}`}
          >
            <Text variant="bodyLarge">{option.label}</Text>
          </Pressable>
        ))}
        <View style={styles.customEntryRow}>
          <View style={styles.barcodeInputField}>
            <BreeyoTextInput
              label="Add Custom Unit"
              value={customUnitText}
              onChangeText={setCustomUnitText}
              testID="item-form-custom-unit-input"
            />
          </View>
          <Button
            variant="text"
            label="Add"
            onPress={() => {
              if (customUnitText.trim()) {
                setUnit(customUnitText.trim());
                setCustomUnitText('');
                setUnitPickerOpen(false);
              }
            }}
            testID="item-form-add-custom-unit"
          />
        </View>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFBF5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFBF5',
  },
  content: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  title: {
    fontWeight: '700',
    color: '#1C1B1F',
    marginBottom: 16,
  },
  fieldGroup: {
    marginBottom: 16,
  },
  pickerLabel: {
    color: '#49454F',
    marginBottom: 4,
  },
  pickerField: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#79747E',
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  pickerValue: {
    color: '#1C1B1F',
  },
  pickerPlaceholder: {
    color: '#79747E',
  },
  fieldError: {
    color: '#BA1A1A',
    marginTop: 4,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  toggleTextColumn: {
    flex: 1,
    marginRight: 8,
  },
  helperText: {
    color: '#49454F',
  },
  barcodeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  barcodeInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  barcodeInputField: {
    flex: 1,
  },
  suggestionsBox: {
    marginTop: 4,
    borderRadius: 8,
    backgroundColor: '#F5F0EB',
    overflow: 'hidden',
  },
  suggestionRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E7E0D8',
  },
  conflictBox: {
    marginTop: 8,
    padding: 8,
    borderRadius: 8,
    backgroundColor: colors.tertiaryContainer,
  },
  conflictText: {
    color: colors.onTertiaryContainer,
  },
  viewItemLink: {
    color: colors.primary,
    fontWeight: '600',
    marginTop: 4,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
    marginBottom: 32,
  },
  sheetOption: {
    paddingVertical: 12,
  },
  customEntryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
});
