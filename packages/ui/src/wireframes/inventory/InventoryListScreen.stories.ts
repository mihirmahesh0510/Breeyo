import React from 'react';
import { View, Text } from 'react-native';

// --- Stub Component ---

function InventoryListScreen({ state }: { state: string; testID?: string }) {
  return React.createElement(
    View,
    { style: { flex: 1, padding: 16 } },
    React.createElement(Text, null, `Inventory List Screen - ${state}`),
  );
}

// --- Stories ---

export default {
  title: 'Wireframes/Inventory/InventoryListScreen',
  component: InventoryListScreen,
};

export const Empty = () =>
  React.createElement(InventoryListScreen, {
    state: 'empty',
    testID: 'inventory-list-empty',
  });

export const Loading = () =>
  React.createElement(InventoryListScreen, {
    state: 'loading',
    testID: 'inventory-list-loading',
  });

export const Populated = () =>
  React.createElement(InventoryListScreen, {
    state: 'populated',
    testID: 'inventory-list-populated',
  });

export const Error = () =>
  React.createElement(InventoryListScreen, {
    state: 'error',
    testID: 'inventory-list-error',
  });
