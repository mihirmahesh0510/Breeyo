import React from 'react';
import { View, Text } from 'react-native';

// --- Stub Component ---

function SignupScreen({ state }: { state: string; testID?: string }) {
  return React.createElement(
    View,
    { style: { flex: 1, padding: 16 } },
    React.createElement(Text, null, `Signup Screen - ${state}`),
  );
}

// --- Stories ---

export default {
  title: 'Wireframes/Auth/SignupScreen',
  component: SignupScreen,
};

export const Empty = () =>
  React.createElement(SignupScreen, {
    state: 'empty',
    testID: 'signup-empty',
  });

export const Loading = () =>
  React.createElement(SignupScreen, {
    state: 'loading',
    testID: 'signup-loading',
  });

export const Populated = () =>
  React.createElement(SignupScreen, {
    state: 'populated',
    testID: 'signup-populated',
  });

export const Error = () =>
  React.createElement(SignupScreen, {
    state: 'error',
    testID: 'signup-error',
  });
