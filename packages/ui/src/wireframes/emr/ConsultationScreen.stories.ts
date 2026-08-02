import React from 'react';
import { View, Text } from 'react-native';

// --- Stub Component ---

function ConsultationScreen({ state }: { state: string; testID?: string }) {
  return React.createElement(
    View,
    { style: { flex: 1, padding: 16 } },
    React.createElement(Text, null, `Consultation Screen - ${state}`),
  );
}

// --- Stories ---

export default {
  title: 'Wireframes/EMR/ConsultationScreen',
  component: ConsultationScreen,
};

export const Empty = () =>
  React.createElement(ConsultationScreen, {
    state: 'empty',
    testID: 'consultation-empty',
  });

export const Loading = () =>
  React.createElement(ConsultationScreen, {
    state: 'loading',
    testID: 'consultation-loading',
  });

export const Populated = () =>
  React.createElement(ConsultationScreen, {
    state: 'populated',
    testID: 'consultation-populated',
  });

export const Error = () =>
  React.createElement(ConsultationScreen, {
    state: 'error',
    testID: 'consultation-error',
  });
