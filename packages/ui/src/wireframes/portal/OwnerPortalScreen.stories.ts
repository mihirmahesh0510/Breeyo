import React from 'react';
import { View, Text } from 'react-native';

// --- Stub Component ---

function OwnerPortalScreen({ state }: { state: string; testID?: string }) {
  return React.createElement(
    View,
    { style: { flex: 1, padding: 16 } },
    React.createElement(Text, null, `Owner Portal Screen - ${state}`),
  );
}

// --- Stories ---

export default {
  title: 'Wireframes/Portal/OwnerPortalScreen',
  component: OwnerPortalScreen,
};

export const Empty = () =>
  React.createElement(OwnerPortalScreen, {
    state: 'empty',
    testID: 'owner-portal-empty',
  });

export const Loading = () =>
  React.createElement(OwnerPortalScreen, {
    state: 'loading',
    testID: 'owner-portal-loading',
  });

export const Populated = () =>
  React.createElement(OwnerPortalScreen, {
    state: 'populated',
    testID: 'owner-portal-populated',
  });

export const Error = () =>
  React.createElement(OwnerPortalScreen, {
    state: 'error',
    testID: 'owner-portal-error',
  });
