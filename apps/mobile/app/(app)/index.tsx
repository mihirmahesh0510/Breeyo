import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/providers/AuthProvider';

function SetupReminderCard({ onDismiss }: { onDismiss: () => void }) {
  const { wizardCompleted } = useAuth();
  const router = useRouter();

  // Determine which message to show
  const isIncomplete = wizardCompleted === false;
  const title = isIncomplete ? 'Complete your setup' : 'Set your clinic hours';
  const subtitle = isIncomplete
    ? 'Finish setting up your clinic to get started.'
    : 'Add your working hours so patients know when you are available.';

  return (
    <View style={styles.card} testID="setup-reminder-card">
      <View style={styles.cardContent}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardSubtitle}>{subtitle}</Text>
        <TouchableOpacity
          style={styles.cardButton}
          onPress={() => router.push('/setup-wizard/clinic-profile')}
          testID="setup-now-button"
        >
          <Text style={styles.cardButtonText}>Set up now</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        style={styles.dismissButton}
        onPress={onDismiss}
        testID="dismiss-reminder-button"
      >
        <Text style={styles.dismissText}>X</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function HomeScreen() {
  const { wizardCompleted } = useAuth();
  const [isDismissed, setIsDismissed] = useState(false);

  const showReminder = !isDismissed && (wizardCompleted === false || wizardCompleted === null);

  return (
    <View style={styles.container}>
      {showReminder && (
        <SetupReminderCard onDismiss={() => setIsDismissed(true)} />
      )}
      <View style={styles.mainContent}>
        <Text>Walk-in Queue</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  mainContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    margin: 16,
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E40AF',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#3B82F6',
    marginBottom: 12,
  },
  cardButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  cardButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  dismissButton: {
    padding: 4,
    marginLeft: 8,
  },
  dismissText: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '600',
  },
});
