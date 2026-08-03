import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useAuth } from '../../../src/providers/AuthProvider';
import { QueueScreen } from '../../../src/features/queue/screens/QueueScreen';

function SetupReminderCard({ onDismiss }: { onDismiss: () => void }) {
  const { wizardCompleted } = useAuth();
  const isIncomplete = wizardCompleted === false;

  if (!isIncomplete) return null;

  return null; // Setup reminder handled elsewhere after Phase 3
}

export default function QueueTab() {
  return <QueueScreen />;
}
