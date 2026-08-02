import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { ClinicSwitcher } from '../../src/components/ClinicSwitcher';
import { LogoutAction } from '../../src/components/LogoutAction';
import { useAuth } from '../../src/providers/AuthProvider';

function HeaderRight() {
  return (
    <View style={styles.headerRight}>
      <ClinicSwitcher />
      <LogoutAction />
    </View>
  );
}

export default function AppLayout() {
  const { wizardCompleted, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
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
    />
  );
}

const styles = StyleSheet.create({
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
