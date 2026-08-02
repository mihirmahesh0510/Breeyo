import React from 'react';
import { View, Text } from 'react-native';

// --- Stub Component ---

function InvoiceScreen({ state }: { state: string; testID?: string }) {
  return React.createElement(
    View,
    { style: { flex: 1, padding: 16 } },
    React.createElement(Text, null, `Invoice Screen - ${state}`),
  );
}

// --- Stories ---

export default {
  title: 'Wireframes/Billing/InvoiceScreen',
  component: InvoiceScreen,
};

export const Empty = () =>
  React.createElement(InvoiceScreen, {
    state: 'empty',
    testID: 'invoice-empty',
  });

export const Loading = () =>
  React.createElement(InvoiceScreen, {
    state: 'loading',
    testID: 'invoice-loading',
  });

export const Populated = () =>
  React.createElement(InvoiceScreen, {
    state: 'populated',
    testID: 'invoice-populated',
  });

export const Error = () =>
  React.createElement(InvoiceScreen, {
    state: 'error',
    testID: 'invoice-error',
  });
