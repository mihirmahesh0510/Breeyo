import React from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView } from 'react-native';
import type { ReferralData } from '@breeyo/types';
import { SPECIALIST_TYPES } from '@breeyo/types';

interface ReferralSectionProps {
  data: ReferralData | null;
  onChange: (data: ReferralData | null) => void;
}

export function ReferralSection({ data, onChange }: ReferralSectionProps) {
  const referral = data || { specialistType: '', reason: '', urgency: 'routine' as const };

  const handleSpecialistChange = (type: string) => {
    onChange({ ...referral, specialistType: type });
  };

  const handleReasonChange = (reason: string) => {
    onChange({ ...referral, reason });
  };

  const handleUrgencyChange = (urgency: 'routine' | 'urgent') => {
    onChange({ ...referral, urgency });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Specialist Type</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.specialistScroll}>
        <View style={styles.specialistRow}>
          {SPECIALIST_TYPES.map((type) => {
            const isSelected = referral.specialistType === type;
            return (
              <Pressable
                key={type}
                style={[styles.specialistChip, isSelected && styles.specialistChipSelected]}
                onPress={() => handleSpecialistChange(type)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
              >
                <Text style={[styles.specialistText, isSelected && styles.specialistTextSelected]}>
                  {type}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <Text style={[styles.label, styles.labelSpaced]}>Reason for Referral</Text>
      <TextInput
        style={styles.textArea}
        value={referral.reason}
        onChangeText={handleReasonChange}
        placeholder="Reason for referral..."
        placeholderTextColor="#79747E"
        multiline
        textAlignVertical="top"
        accessibilityLabel="Reason for referral text input"
      />

      <Text style={[styles.label, styles.labelSpaced]}>Urgency</Text>
      <View style={styles.urgencyRow}>
        <Pressable
          style={[
            styles.urgencyButton,
            styles.urgencyLeft,
            referral.urgency === 'routine' && styles.urgencySelected,
          ]}
          onPress={() => handleUrgencyChange('routine')}
          accessibilityRole="button"
          accessibilityState={{ selected: referral.urgency === 'routine' }}
        >
          <Text
            style={[
              styles.urgencyText,
              referral.urgency === 'routine' && styles.urgencyTextSelected,
            ]}
          >
            Routine
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.urgencyButton,
            styles.urgencyRight,
            referral.urgency === 'urgent' && styles.urgencyUrgentSelected,
          ]}
          onPress={() => handleUrgencyChange('urgent')}
          accessibilityRole="button"
          accessibilityState={{ selected: referral.urgency === 'urgent' }}
        >
          <Text
            style={[
              styles.urgencyText,
              referral.urgency === 'urgent' && styles.urgencyUrgentText,
            ]}
          >
            Urgent
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: '#49454F',
    marginBottom: 6,
  },
  labelSpaced: {
    marginTop: 12,
  },
  specialistScroll: {
    marginBottom: 4,
  },
  specialistRow: {
    flexDirection: 'row',
    gap: 6,
  },
  specialistChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#F3EDF7',
    borderWidth: 1,
    borderColor: '#CAC4D0',
  },
  specialistChipSelected: {
    backgroundColor: '#C8E6C9',
    borderColor: '#2E7D32',
  },
  specialistText: {
    fontSize: 13,
    color: '#49454F',
  },
  specialistTextSelected: {
    color: '#1B5E20',
    fontWeight: '500',
  },
  textArea: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: '#CAC4D0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1C1B1F',
    backgroundColor: '#FFFBF5',
  },
  urgencyRow: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CAC4D0',
    overflow: 'hidden',
  },
  urgencyButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#FFFBF5',
  },
  urgencyLeft: {
    borderRightWidth: 1,
    borderRightColor: '#CAC4D0',
  },
  urgencyRight: {},
  urgencySelected: {
    backgroundColor: '#C8E6C9',
  },
  urgencyUrgentSelected: {
    backgroundColor: '#FFDAD6',
  },
  urgencyText: {
    fontSize: 13,
    color: '#49454F',
    fontWeight: '500',
  },
  urgencyTextSelected: {
    color: '#1B5E20',
  },
  urgencyUrgentText: {
    color: '#93000A',
  },
});
