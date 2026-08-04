import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface OwnerInstructionsPreviewProps {
  instructions: string;
}

export function OwnerInstructionsPreview({
  instructions,
}: OwnerInstructionsPreviewProps) {
  if (!instructions) return null;

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <MaterialCommunityIcons
          name="text-box-check-outline"
          size={14}
          color="#79747E"
        />
        <Text style={styles.label}>Owner instructions</Text>
      </View>
      <Text style={styles.content}>{instructions}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#F5F0EB',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    gap: 4,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
    color: '#79747E',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  content: {
    fontSize: 14,
    color: '#1C1B1F',
    lineHeight: 20,
    fontStyle: 'italic',
  },
});
