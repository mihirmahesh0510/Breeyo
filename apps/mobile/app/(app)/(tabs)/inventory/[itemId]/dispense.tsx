import React from 'react';
import { DispenseScreen } from '../../../../../src/features/inventory/screens/DispenseScreen';

/** `itemId` from the segment; optional `?consultationId=&petName=` per D-49
 *  (see navigateToInventoryDispense in src/navigation/inventory-navigation.ts). */
export default function InventoryDispenseRoute() {
  return <DispenseScreen />;
}
