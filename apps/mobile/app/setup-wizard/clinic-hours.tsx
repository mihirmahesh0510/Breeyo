import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { apiClient } from '../../src/lib/api';
import { getAccessToken } from '../../src/lib/auth-storage';
import {
  DAYS_OF_WEEK,
  getDefaultHours,
  formatHoursForApi,
  type DayOfWeek,
  type DayHours,
  type WeekHours,
} from '../../src/lib/wizard-utils';

export default function ClinicHoursStep() {
  const router = useRouter();
  const [hours, setHours] = useState<WeekHours>(getDefaultHours);
  const [isSaving, setIsSaving] = useState(false);

  const updateDay = (day: DayOfWeek, updates: Partial<DayHours>) => {
    setHours((prev) => ({
      ...prev,
      [day]: { ...prev[day], ...updates },
    }));
  };

  const handleFinishSetup = async () => {
    setIsSaving(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        Alert.alert('Error', 'Session expired. Please log in again.');
        return;
      }

      await apiClient('/api/v1/clinics/current/hours', {
        method: 'PUT',
        token,
        body: JSON.stringify({ hours: formatHoursForApi(hours) }),
      });

      await apiClient('/api/v1/clinics/current/wizard-complete', {
        method: 'POST',
        token,
      });

      router.replace('/(app)');
    } catch {
      Alert.alert('Error', 'Failed to save clinic hours. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Clinic Hours</Text>
      <Text style={styles.subtitle}>Set your working hours</Text>

      {DAYS_OF_WEEK.map((day) => (
        <View key={day} style={styles.dayRow}>
          <View style={styles.dayHeader}>
            <Text style={styles.dayLabel}>{day}</Text>
            <View style={styles.closedToggle}>
              <Text style={styles.closedLabel}>Closed</Text>
              <Switch
                value={hours[day].isClosed}
                onValueChange={(value) => updateDay(day, { isClosed: value })}
                testID={`closed-toggle-${day}`}
              />
            </View>
          </View>

          {!hours[day].isClosed && (
            <View style={styles.timeRow}>
              <View style={styles.timeField}>
                <Text style={styles.timeLabel}>Open</Text>
                <TextInput
                  style={styles.timeInput}
                  value={hours[day].openTime}
                  onChangeText={(value) => updateDay(day, { openTime: value })}
                  placeholder="09:00"
                  testID={`open-time-${day}`}
                />
              </View>
              <View style={styles.timeField}>
                <Text style={styles.timeLabel}>Close</Text>
                <TextInput
                  style={styles.timeInput}
                  value={hours[day].closeTime}
                  onChangeText={(value) => updateDay(day, { closeTime: value })}
                  placeholder="18:00"
                  testID={`close-time-${day}`}
                />
              </View>
            </View>
          )}
        </View>
      ))}

      <TouchableOpacity
        style={[styles.button, isSaving && styles.buttonDisabled]}
        onPress={handleFinishSetup}
        disabled={isSaving}
        testID="finish-setup-button"
      >
        <Text style={styles.buttonText}>
          {isSaving ? 'Saving...' : 'Finish Setup'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 24,
  },
  dayRow: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dayLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  closedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  closedLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  timeRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 8,
  },
  timeField: {
    flex: 1,
  },
  timeLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  timeInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    color: '#111827',
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
