import React from 'react';
import { ItemFormScreen } from '../../../../src/features/inventory/screens/ItemFormScreen';

/** Create mode -- no `itemId` param, so ItemFormScreen's `isEditMode` is false. */
export default function InventoryAddRoute() {
  return <ItemFormScreen />;
}
