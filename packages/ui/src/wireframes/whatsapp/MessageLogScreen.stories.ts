import React from 'react';
import { View, Text } from 'react-native';

// --- Stub Component ---

function MessageLogScreen({ state }: { state: string; testID?: string }) {
  return React.createElement(
    View,
    { style: { flex: 1, padding: 16 } },
    React.createElement(Text, null, `Message Log Screen - ${state}`),
  );
}

// --- Stories ---

export default {
  title: 'Wireframes/WhatsApp/MessageLogScreen',
  component: MessageLogScreen,
};

export const Empty = () =>
  React.createElement(MessageLogScreen, {
    state: 'empty',
    testID: 'message-log-empty',
  });

export const Loading = () =>
  React.createElement(MessageLogScreen, {
    state: 'loading',
    testID: 'message-log-loading',
  });

export const Populated = () =>
  React.createElement(MessageLogScreen, {
    state: 'populated',
    testID: 'message-log-populated',
  });

export const Error = () =>
  React.createElement(MessageLogScreen, {
    state: 'error',
    testID: 'message-log-error',
  });
