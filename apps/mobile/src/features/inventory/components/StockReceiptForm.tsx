import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { FormField } from '@breeyo/ui';
import {
  isExpiryRequiredForCategory,
  EXPIRY_REQUIRED_NOTE,
} from '../lib/stock-receipt-logic';
import type { StockReceiptFormData, StockReceiptFormErrors } from '../lib/stock-receipt-logic';

// Re-exported for convenience so existing imports of these from this component
// file keep working; the actual pure logic lives in lib/stock-receipt-logic.ts
// (see that file's header comment for why it's split out).
export { isExpiryRequiredForCategory, EXPIRY_REQUIRED_NOTE };
export type { StockReceiptFormData, StockReceiptFormErrors };

// --- Component ---

export interface StockReceiptFormProps {
  itemName: string;
  unit: string;
  category: string;
  data: StockReceiptFormData;
  onChange: (data: StockReceiptFormData) => void;
  errors: StockReceiptFormErrors;
  disabled?: boolean;
  testID?: string;
}

/**
 * Stock receipt form fields per UI-SPEC "Stock Receipt Form" (D-01, D-03, D-09, D-11).
 * Item name is shown as a read-only header (pre-filled from the parent screen); the
 * expiry date field surfaces the D-27 "required for medicine/vaccine/consumable" note
 * whenever `category` is in EXPIRY_REQUIRED_CATEGORIES.
 */
export function StockReceiptForm({
  itemName,
  unit,
  category,
  data,
  onChange,
  errors,
  disabled = false,
  testID,
}: StockReceiptFormProps) {
  const expiryRequired = isExpiryRequiredForCategory(category);

  const setField = (field: keyof StockReceiptFormData) => (value: string) => {
    onChange({ ...data, [field]: value });
  };

  return (
    <View testID={testID}>
      <Text
        variant="titleLarge"
        style={styles.itemName}
        testID={testID ? `${testID}-item-name` : undefined}
      >
        {itemName}
      </Text>

      <View style={styles.fieldGroup}>
        <FormField
          label="Quantity Received"
          value={data.quantity}
          onChangeText={setField('quantity')}
          error={errors.quantity}
          helperText={errors.quantity ? undefined : `Enter total ${unit} received`}
          required
          disabled={disabled}
          testID={testID ? `${testID}-quantity` : undefined}
        />
      </View>

      <View style={styles.fieldGroup}>
        <FormField
          label="Lot / Batch Number (optional)"
          value={data.lotNumber}
          onChangeText={setField('lotNumber')}
          error={errors.lotNumber}
          helperText={errors.lotNumber ? undefined : 'Enter lot number'}
          disabled={disabled}
          testID={testID ? `${testID}-lot-number` : undefined}
        />
      </View>

      <View style={styles.fieldGroup}>
        <FormField
          label="Expiry Date"
          value={data.expiryDate}
          onChangeText={setField('expiryDate')}
          error={errors.expiryDate}
          helperText={
            errors.expiryDate ? undefined : expiryRequired ? EXPIRY_REQUIRED_NOTE : 'YYYY-MM-DD (optional)'
          }
          required={expiryRequired}
          disabled={disabled}
          testID={testID ? `${testID}-expiry-date` : undefined}
        />
      </View>

      <View style={styles.fieldGroup}>
        <FormField
          label={`Purchase Price per ${unit} (Rs)`}
          value={data.purchasePrice}
          onChangeText={setField('purchasePrice')}
          error={errors.purchasePrice}
          helperText={errors.purchasePrice ? undefined : '0.00'}
          disabled={disabled}
          testID={testID ? `${testID}-purchase-price` : undefined}
        />
      </View>

      <View style={styles.fieldGroup}>
        <FormField
          label="Distributor (optional)"
          value={data.supplier}
          onChangeText={setField('supplier')}
          error={errors.supplier}
          helperText={errors.supplier ? undefined : 'Enter distributor name'}
          disabled={disabled}
          testID={testID ? `${testID}-supplier` : undefined}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  itemName: {
    color: '#1C1B1F',
    marginBottom: 16,
  },
  fieldGroup: {
    marginBottom: 16,
  },
});
