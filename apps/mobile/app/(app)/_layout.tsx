import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { ClinicSwitcher } from '../../src/components/ClinicSwitcher';
import { LogoutAction } from '../../src/components/LogoutAction';
import { useAuth } from '../../src/providers/AuthProvider';
import { shouldRedirectToLogin } from '../../src/lib/auth-route-guard';
import { SyncStatusBadge } from '../../src/features/offline-sync/components/SyncStatusBadge';
import { useSyncUiStore } from '../../src/features/offline-sync/store/syncUiStore';

/**
 * D-18 (F2, Phase 10 review-fix): the always-visible sync summary, reading
 * from `syncUiStore` -- kept current by `useSyncStatus()`, called once from
 * `ConnectivityReplayProvider` at the app root (app/_layout.tsx) rather than
 * here, so this header does not itself own the polling lifecycle.
 */
function HeaderRight() {
  const router = useRouter();
  const visibilityState = useSyncUiStore((state) => state.visibilityState);
  const counts = useSyncUiStore((state) => state.counts);
  const showRecoveryCue = useSyncUiStore((state) => state.showRecoveryCue);

  return (
    <View style={styles.headerRight}>
      <SyncStatusBadge
        visibilityState={visibilityState}
        counts={counts}
        showRecoveryCue={showRecoveryCue}
        onPress={() => router.push('/sync-failures')}
      />
      <ClinicSwitcher />
      <LogoutAction />
    </View>
  );
}

export default function AppLayout() {
  const { wizardCompleted, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (shouldRedirectToLogin({ isLoading, isAuthenticated })) {
      router.replace('/(auth)/login');
      return;
    }
    if (!isLoading && isAuthenticated && wizardCompleted === false) {
      router.replace('/setup-wizard/clinic-profile');
    }
  }, [isLoading, isAuthenticated, wizardCompleted, router]);

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerRight: () => <HeaderRight />,
      }}
    >
      <Stack.Screen
        name="(tabs)"
        options={{ headerShown: false, title: 'Breeyo' }}
      />
      <Stack.Screen
        name="patient/[petId]"
        options={{ title: 'Pet Profile' }}
      />
      <Stack.Screen
        name="patient/register"
        options={{ title: 'Register Patient' }}
      />
      <Stack.Screen
        name="owner/[ownerId]"
        options={{ title: 'Owner Detail' }}
      />
      <Stack.Screen
        name="billing/settings"
        options={{ title: 'Billing Settings' }}
      />
      <Stack.Screen
        name="sync-failures"
        options={{ title: 'Sync Issues' }}
      />
    </Stack>
  );
}

const styles = StyleSheet.create({
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
