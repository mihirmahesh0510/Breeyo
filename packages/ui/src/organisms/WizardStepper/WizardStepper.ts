import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button, ProgressBar } from 'react-native-paper';
import { useAppTheme } from '../../theme/types';

// --- Testable exports ---

export const WIZARD_DEFAULTS = {
  showSkip: true,
  showBack: true,
  progressColor: 'primary',
  buttonVariant: 'contained' as const,
};

// --- Component ---

export interface WizardStep {
  title: string;
  content: React.ReactNode;
}

export interface WizardStepperProps {
  steps: WizardStep[];
  onComplete: () => void;
  onSkip?: () => void;
  testID?: string;
}

export function WizardStepper({
  steps,
  onComplete,
  onSkip,
  testID,
}: WizardStepperProps) {
  const theme = useAppTheme();
  const [currentStep, setCurrentStep] = React.useState(0);
  const colors = theme.colors as Record<string, string>;
  // See BottomSheet.ts: useAppTheme() can resolve to Paper's bare theme on
  // some web render paths, where these Breeyo-specific tokens are undefined.
  const spacing = theme.spacing ?? { sm: 8, md: 16 };

  const totalSteps = steps.length;
  const isFirst = currentStep === 0;
  const isLast = currentStep === totalSteps - 1;
  const progress = totalSteps > 0 ? (currentStep + 1) / totalSteps : 0;
  const step = steps[currentStep];

  const handleNext = () => {
    if (isLast) {
      onComplete();
    } else {
      setCurrentStep((prev: number) => prev + 1);
    }
  };

  const handleBack = () => {
    if (!isFirst) {
      setCurrentStep((prev: number) => prev - 1);
    }
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      padding: spacing.md,
    },
    header: {
      marginBottom: spacing.md,
    },
    stepLabel: {
      marginBottom: spacing.sm,
    },
    content: {
      flex: 1,
      marginVertical: spacing.md,
    },
    actions: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      gap: spacing.sm,
    },
    leftActions: {
      flexDirection: 'row' as const,
      gap: spacing.sm,
    },
  });

  return React.createElement(
    View,
    { style: styles.container, testID },
    React.createElement(
      View,
      { style: styles.header },
      React.createElement(
        Text,
        { variant: 'labelMedium', style: styles.stepLabel },
        `Step ${currentStep + 1} of ${totalSteps}`,
      ),
      React.createElement(ProgressBar, {
        progress,
        color: colors[WIZARD_DEFAULTS.progressColor] || colors.primary,
      }),
    ),
    step
      ? React.createElement(
          View,
          { style: styles.content },
          React.createElement(
            Text,
            { variant: 'titleLarge' },
            step.title,
          ),
          step.content,
        )
      : null,
    React.createElement(
      View,
      { style: styles.actions },
      React.createElement(
        View,
        { style: styles.leftActions },
        !isFirst
          ? React.createElement(Button, {
              mode: 'outlined',
              onPress: handleBack,
              children: 'Back',
            })
          : null,
        onSkip && !isLast
          ? React.createElement(Button, {
              mode: 'text',
              onPress: onSkip,
              children: 'Skip',
            })
          : null,
      ),
      React.createElement(Button, {
        mode: WIZARD_DEFAULTS.buttonVariant,
        onPress: handleNext,
        children: isLast ? 'Done' : 'Next',
      }),
    ),
  );
}
