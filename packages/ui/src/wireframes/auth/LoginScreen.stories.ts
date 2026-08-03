import React from 'react';
import { View, Text } from 'react-native';

// --- Stub Component ---

function LoginScreen({ state }: { state: string; testID?: string }) {
  return React.createElement(
    View,
    { style: { flex: 1, padding: 16 } },
    React.createElement(Text, null, `Login Screen - ${state}`),
  );
}

// --- Stories ---

export default {
  title: 'Wireframes/Auth/LoginScreen',
  component: LoginScreen,
};

export const Empty = () =>
  React.createElement(LoginScreen, {
    state: 'empty',
    testID: 'login-empty',
  });

export const Loading = () =>
  React.createElement(LoginScreen, {
    state: 'loading',
    testID: 'login-loading',
  });

export const Populated = () =>
  React.createElement(LoginScreen, {
    state: 'populated',
    testID: 'login-populated',
  });

export const Error = () =>
  React.createElement(LoginScreen, {
    state: 'error',
    testID: 'login-error',
  });
