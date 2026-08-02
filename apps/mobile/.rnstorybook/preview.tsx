import React from 'react';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { breeyoTheme } from '@breeyo/ui';

import type { Preview } from '@storybook/react';

/**
 * Global decorator that wraps all stories with the Breeyo theme providers.
 * Ensures all components render with correct Material Design 3 tokens.
 */
const withProviders = (Story: React.ComponentType) => (
  <SafeAreaProvider>
    <PaperProvider theme={breeyoTheme}>
      <Story />
    </PaperProvider>
  </SafeAreaProvider>
);

const preview: Preview = {
  decorators: [withProviders],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
  },
};

export default preview;
