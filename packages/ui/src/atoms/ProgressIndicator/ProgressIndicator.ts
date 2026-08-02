import React from 'react';
import { ProgressBar, ActivityIndicator } from 'react-native-paper';

// --- Component ---

export type ProgressIndicatorType = 'linear' | 'circular';

export interface ProgressIndicatorProps {
  type?: ProgressIndicatorType;
  progress?: number;
  indeterminate?: boolean;
  color?: string;
  testID?: string;
}

export function ProgressIndicator({
  type = 'linear',
  progress = 0,
  indeterminate = false,
  color,
  testID,
}: ProgressIndicatorProps) {
  if (type === 'circular') {
    return React.createElement(ActivityIndicator, {
      animating: true,
      color,
      testID,
      accessibilityLabel: 'Loading',
    });
  }

  return React.createElement(ProgressBar, {
    progress: indeterminate ? undefined : progress,
    indeterminate,
    color,
    testID,
    accessibilityLabel: indeterminate
      ? 'Loading'
      : `Progress: ${Math.round(progress * 100)}%`,
  });
}
