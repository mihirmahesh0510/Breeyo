import React from 'react';
import { View, Text } from 'react-native';

// --- Stub Component ---

function DashboardScreen({ state }: { state: string; testID?: string }) {
  return React.createElement(
    View,
    { style: { flex: 1, padding: 16 } },
    React.createElement(Text, null, `Dashboard Screen - ${state}`),
  );
}

// --- Stories ---

export default {
  title: 'Wireframes/Dashboard/DashboardScreen',
  component: DashboardScreen,
};

export const Empty = () =>
  React.createElement(DashboardScreen, {
    state: 'empty',
    testID: 'dashboard-empty',
  });

export const Loading = () =>
  React.createElement(DashboardScreen, {
    state: 'loading',
    testID: 'dashboard-loading',
  });

export const Populated = () =>
  React.createElement(DashboardScreen, {
    state: 'populated',
    testID: 'dashboard-populated',
  });

export const Error = () =>
  React.createElement(DashboardScreen, {
    state: 'error',
    testID: 'dashboard-error',
  });
