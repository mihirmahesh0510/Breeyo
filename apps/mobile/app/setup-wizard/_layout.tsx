import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Stack, useRouter, usePathname } from 'expo-router';
import { WIZARD_STEPS, getStepIndex } from '../../src/lib/wizard-utils';

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <View style={styles.indicatorContainer}>
      {WIZARD_STEPS.map((_, index) => (
        <View
          key={index}
          style={[
            styles.dot,
            index <= currentStep ? styles.dotActive : styles.dotInactive,
          ]}
        />
      ))}
    </View>
  );
}

export default function SetupWizardLayout() {
  const router = useRouter();
  const pathname = usePathname();

  const stepIndex = getStepIndex(pathname);

  const handleSkip = () => {
    if (stepIndex === 0) {
      router.push('/setup-wizard/invite-staff');
    } else if (stepIndex === 1) {
      router.push('/setup-wizard/clinic-hours');
    } else {
      // Last step skip: mark wizard complete and go to app
      skipToApp();
    }
  };

  const skipToApp = async () => {
    try {
      // Import lazily to avoid circular deps -- we just call fetch directly
      const { apiClient } = await import('../../src/lib/api');
      const { getAccessToken } = await import('../../src/lib/auth-storage');
      const token = await getAccessToken();
      if (token) {
        await apiClient('/api/v1/clinics/current/wizard-complete', {
          method: 'POST',
          token,
        });
      }
    } catch {
      // Best-effort; navigate regardless
    }
    router.replace('/(app)');
  };

  return (
    <View style={styles.container}>
      <Stack
        screenOptions={{
          headerShown: true,
          headerTitle: () => <StepIndicator currentStep={stepIndex} />,
          headerBackVisible: stepIndex > 0,
          headerRight: () => (
            <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
              <Text style={styles.skipText}>Skip for now</Text>
            </TouchableOpacity>
          ),
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  indicatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotActive: {
    backgroundColor: '#2563EB',
  },
  dotInactive: {
    backgroundColor: '#D1D5DB',
  },
  skipButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  skipText: {
    color: '#6B7280',
    fontSize: 14,
  },
});
