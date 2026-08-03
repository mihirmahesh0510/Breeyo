import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { Avatar } from '@breeyo/ui';
import { SPECIES_ICONS, type Species } from '@breeyo/types';

interface PatientListItemProps {
  petId: string;
  petName: string;
  species: Species;
  ownerName: string;
  lastVisitDate?: string | Date | null;
  onPress: (petId: string) => void;
  testID?: string;
}

function formatLastVisit(date: string | Date | null | undefined): string | null {
  if (!date) return null;

  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return null;

  const day = String(d.getDate()).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[d.getMonth()];
  const year = d.getFullYear();

  return `Last visit: ${day} ${month} ${year}`;
}

export function PatientListItem({
  petId,
  petName,
  species,
  ownerName,
  lastVisitDate,
  onPress,
  testID,
}: PatientListItemProps) {
  const iconName = SPECIES_ICONS[species] ?? 'paw';
  const lastVisitText = formatLastVisit(lastVisitDate);

  return (
    <Pressable
      style={styles.container}
      onPress={() => onPress(petId)}
      accessibilityRole="button"
      accessibilityLabel={`${petName}, owned by ${ownerName}`}
      testID={testID}
    >
      <View style={styles.avatarContainer}>
        <Avatar type="icon" source={iconName} size="md" label={species} />
      </View>

      <View style={styles.centerContent}>
        <Text variant="titleMedium" numberOfLines={1}>
          {petName}
        </Text>
        <Text variant="bodyLarge" style={styles.ownerName} numberOfLines={1}>
          {ownerName}
        </Text>
      </View>

      {lastVisitText && (
        <View style={styles.rightContent}>
          <Text variant="bodySmall" style={styles.lastVisitText}>
            {lastVisitText}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 64,
    paddingHorizontal: 16,
    backgroundColor: '#FFFBF5',
  },
  avatarContainer: {
    marginRight: 12,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
  },
  ownerName: {
    color: '#49454F',
  },
  rightContent: {
    marginLeft: 8,
    alignItems: 'flex-end',
  },
  lastVisitText: {
    color: '#49454F',
  },
});

export type { PatientListItemProps };
