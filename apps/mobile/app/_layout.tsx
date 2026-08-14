import { Slot } from 'expo-router';
import { AuthProvider } from '../src/providers/AuthProvider';
import { QueryProvider } from '../src/providers/QueryProvider';
import { ThemeProvider } from '../src/providers/ThemeProvider';

/**
 * `ThemeProvider` (src/providers/ThemeProvider.tsx, Phase 7 D-17) wraps the
 * app in GestureHandlerRootView > SafeAreaProvider > PaperProvider using
 * `breeyoTheme` from @breeyo/ui, so every routed screen - including the
 * Phase 6 billing screens and Phase 7's WhatsApp screens - inherits the MD3
 * theme, safe-area insets, and a working gesture-handler root.
 */
export default function RootLayout() {
  return (
    <QueryProvider>
      <ThemeProvider>
        <AuthProvider>
          <Slot />
        </AuthProvider>
      </ThemeProvider>
    </QueryProvider>
  );
}
