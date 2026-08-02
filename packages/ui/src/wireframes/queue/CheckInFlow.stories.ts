import React from 'react';
import { View, Text } from 'react-native';

// --- Config ---

export const CHECK_IN_FLOW_CONFIG = {
  title: '2-Tap Check-In Flow',
  steps: ['Select Patient', 'Confirm Check-In'],
};

// --- Stub Component ---

function CheckInFlow({ state }: { state: string; testID?: string }) {
  return React.createElement(
    View,
    { style: { flex: 1, padding: 16 } },
    React.createElement(Text, null, `Check-In Flow - ${state}`),
  );
}

// --- Stories ---

export default {
  title: 'Wireframes/Queue/CheckInFlow',
  component: CheckInFlow,
};

export const Empty = () =>
  React.createElement(CheckInFlow, {
    state: 'empty',
    testID: 'checkin-empty',
  });

export const Loading = () =>
  React.createElement(CheckInFlow, {
    state: 'loading',
    testID: 'checkin-loading',
  });

export const Populated = () =>
  React.createElement(CheckInFlow, {
    state: 'populated',
    testID: 'checkin-populated',
  });

export const Error = () =>
  React.createElement(CheckInFlow, {
    state: 'error',
    testID: 'checkin-error',
  });
