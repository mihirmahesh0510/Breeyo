import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider as PaperProvider } from 'react-native-paper';
import { breeyoTheme } from '@breeyo/ui';

/**
 * Phase 7 (D-17): root theming provider for the mobile app.
 *
 * `breeyoTheme` (packages/ui/src/theme/theme.ts) already spreads
 * `MD3LightTheme` and overrides `colors` with the Breeyo tokens (primary
 * #1E2A6E, secondary #5D4037, tertiary #E65100, background/surface #FFFBF5,
 * error #BA1A1A) plus the MD3 font scale, so this provider reuses it instead
 * of re-typing hex values at the router root.
 *
 * Nesting order matters: `GestureHandlerRootView` must be the outermost
 * wrapper (react-native-gesture-handler's own requirement for Android),
 * `SafeAreaProvider` next so every screen can read safe-area insets, and
 * `PaperProvider` innermost so Paper components render with the Breeyo
 * MD3 theme.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PaperProvider theme={breeyoTheme}>{children}</PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
