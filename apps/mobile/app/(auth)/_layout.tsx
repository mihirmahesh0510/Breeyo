import React, { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from '../../src/providers/AuthProvider';
import { shouldRedirectAwayFromAuth } from '../../src/lib/auth-route-guard';

export default function AuthLayout() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (shouldRedirectAwayFromAuth({ isLoading, isAuthenticated })) {
      router.replace('/(app)');
    }
  }, [isLoading, isAuthenticated, router]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  );
}
