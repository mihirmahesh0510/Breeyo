import React from 'react';
import { View, Text } from 'react-native';

// --- Stub Component ---

function CalendarScreen({ state }: { state: string; testID?: string }) {
  return React.createElement(
    View,
    { style: { flex: 1, padding: 16 } },
    React.createElement(Text, null, `Calendar Screen - ${state}`),
  );
}

// --- Stories ---

export default {
  title: 'Wireframes/Scheduling/CalendarScreen',
  component: CalendarScreen,
};

export const Empty = () =>
  React.createElement(CalendarScreen, {
    state: 'empty',
    testID: 'calendar-empty',
  });

export const Loading = () =>
  React.createElement(CalendarScreen, {
    state: 'loading',
    testID: 'calendar-loading',
  });

export const Populated = () =>
  React.createElement(CalendarScreen, {
    state: 'populated',
    testID: 'calendar-populated',
  });

export const Error = () =>
  React.createElement(CalendarScreen, {
    state: 'error',
    testID: 'calendar-error',
  });
