import React from 'react';
import { BarcodeScannerScreen } from '../../../../src/features/inventory/screens/BarcodeScannerScreen';

/** `?mode=single|continuous|stockTake` -- read internally via useLocalSearchParams. */
export default function InventoryScanRoute() {
  return <BarcodeScannerScreen />;
}
