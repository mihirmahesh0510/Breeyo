import React from 'react';
import { ItemFormScreen } from '../../../../../src/features/inventory/screens/ItemFormScreen';

/** Edit mode -- `itemId` comes from this dynamic segment, read internally
 *  by ItemFormScreen via useLocalSearchParams (isEditMode = !!itemId). */
export default function InventoryItemEditRoute() {
  return <ItemFormScreen />;
}
