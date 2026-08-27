import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '@breeyo/ui';
import type { DosageWarning } from '@breeyo/types';

interface DosageWarningBannerProps {
  warning: DosageWarning;
}

export function DosageWarningBanner({ warning }: DosageWarningBannerProps) {
  return (
    <View
      style={styles.container}
      accessibilityRole="alert"
      accessibilityLabel={`Dosage warning: ${warning.message}`}
    >
      <MaterialCommunityIcons
        name="alert-outline"
        size={20}
        color={colors.warning}
        style={styles.icon}
      />
      <View style={styles.textContainer}>
        <Text style={styles.message}>{warning.message}</Text>
        <Text style={styles.subText}>
          You can override this recommendation.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.tertiaryContainer,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  icon: {
    marginTop: 1,
  },
  textContainer: {
    flex: 1,
    gap: 2,
  },
  message: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.warning,
    lineHeight: 18,
  },
  subText: {
    fontSize: 12,
    color: colors.onTertiaryContainer,
    lineHeight: 16,
  },
});
