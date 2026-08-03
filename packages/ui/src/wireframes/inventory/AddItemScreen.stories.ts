import React from 'react';
import { View, Text } from 'react-native';

// --- Stub Component ---

function AddItemScreen({ state }: { state: string; testID?: string }) {
  return React.createElement(
    View,
    { style: { flex: 1, padding: 16 } },
    React.createElement(Text, null, `Add Item Screen - ${state}`),
  );
}

// --- Stories ---

export default {
  title: 'Wireframes/Inventory/AddItemScreen',
  component: AddItemScreen,
};

export const Empty = () =>
  React.createElement(AddItemScreen, {
    state: 'empty',
    testID: 'add-item-empty',
  });

export const Loading = () =>
  React.createElement(AddItemScreen, {
    state: 'loading',
    testID: 'add-item-loading',
  });

export const Populated = () =>
  React.createElement(AddItemScreen, {
    state: 'populated',
    testID: 'add-item-populated',
  });

export const Error = () =>
  React.createElement(AddItemScreen, {
    state: 'error',
    testID: 'add-item-error',
  });
