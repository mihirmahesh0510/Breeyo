import React from 'react';
import { View, Text } from 'react-native';

// --- Stub Component ---

function PatientHistoryScreen({ state }: { state: string; testID?: string }) {
  return React.createElement(
    View,
    { style: { flex: 1, padding: 16 } },
    React.createElement(Text, null, `Patient History Screen - ${state}`),
  );
}

// --- Stories ---

export default {
  title: 'Wireframes/EMR/PatientHistoryScreen',
  component: PatientHistoryScreen,
};

export const Empty = () =>
  React.createElement(PatientHistoryScreen, {
    state: 'empty',
    testID: 'patient-history-empty',
  });

export const Loading = () =>
  React.createElement(PatientHistoryScreen, {
    state: 'loading',
    testID: 'patient-history-loading',
  });

export const Populated = () =>
  React.createElement(PatientHistoryScreen, {
    state: 'populated',
    testID: 'patient-history-populated',
  });

export const Error = () =>
  React.createElement(PatientHistoryScreen, {
    state: 'error',
    testID: 'patient-history-error',
  });
