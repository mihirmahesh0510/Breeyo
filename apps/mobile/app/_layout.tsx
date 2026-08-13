import { Slot } from 'expo-router';
import { Provider as PaperProvider } from 'react-native-paper';
import { breeyoTheme } from '@breeyo/ui';
import { AuthProvider } from '../src/providers/AuthProvider';
import { QueryProvider } from '../src/providers/QueryProvider';

/**
 * `breeyoTheme` (packages/ui/src/theme/theme.ts) already spreads `MD3LightTheme`
 * and overrides `colors` with the Breeyo tokens (primary #2E7D32, secondary
 * #5D4037, tertiary #E65100, background/surface #FFFBF5, surfaceVariant #F5F0EB,
 * error #BA1A1A, onSurfaceVariant #49454F, outlineVariant #CAC4D0) plus the MD3
 * font scale. Consuming it here keeps the app and @breeyo/ui on one theme object
 * instead of duplicating hex values at the router root.
 *
 * PaperProvider sits outside <Slot /> so every routed screen - including the
 * Phase 6 billing screens - inherits the MD3 theme.
 */
export default function RootLayout() {
  return (
    <QueryProvider>
      <PaperProvider theme={breeyoTheme}>
        <AuthProvider>
          <Slot />
        </AuthProvider>
      </PaperProvider>
    </QueryProvider>
  );
}
