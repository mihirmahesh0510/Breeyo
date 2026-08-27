import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { Avatar, Card, colors } from '@breeyo/ui';
import { SPECIES_ICONS, type Species } from '@breeyo/types';
import type { Pet, Owner } from '@breeyo/types';

interface PetProfileCardProps {
  pet: Pet;
  owner: Owner;
  onOwnerPress?: (ownerId: string) => void;
  testID?: string;
}

/**
 * Compute a human-readable age string from birth year/month.
 * Returns null if birth data is unavailable.
 */
export function computeAge(birthYear: number | null, birthMonth: number | null): string | null {
  if (!birthYear) return null;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-indexed

  let years = currentYear - birthYear;
  let months = 0;

  if (birthMonth) {
    months = currentMonth - birthMonth;
    if (months < 0) {
      years -= 1;
      months += 12;
    }
  }

  if (years === 0 && months === 0) {
    return 'Less than 1 month';
  }

  const parts: string[] = [];
  if (years > 0) {
    parts.push(`${years} ${years === 1 ? 'year' : 'years'}`);
  }
  if (months > 0) {
    parts.push(`${months} ${months === 1 ? 'month' : 'months'}`);
  }
  return parts.join(', ');
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text variant="bodySmall" style={styles.infoLabel}>
        {label}
      </Text>
      <Text variant="bodyLarge">{value}</Text>
    </View>
  );
}

export function PetProfileCard({
  pet,
  owner,
  onOwnerPress,
  testID,
}: PetProfileCardProps) {
  const iconName = SPECIES_ICONS[pet.species as Species] ?? 'paw';
  const speciesEntry = pet.species;
  const age = computeAge(pet.birthYear, pet.birthMonth);

  return (
    <Card variant="elevated" testID={testID}>
      <Card.Body>
        <View style={styles.headerSection}>
          {pet.photoUrl ? (
            <Avatar
              type="image"
              source={{ uri: pet.photoUrl }}
              size="lg"
              label={pet.name}
            />
          ) : (
            <Avatar
              type="icon"
              source={iconName}
              size="lg"
              label={pet.name}
            />
          )}
          <View style={styles.nameSection}>
            <Text variant="headlineMedium" style={styles.petName}>
              {pet.name}
            </Text>
            <Text variant="bodyLarge" style={styles.speciesBreed}>
              {speciesEntry}
              {pet.breed ? ` - ${pet.breed}` : ''}
            </Text>
          </View>
        </View>

        <View style={styles.detailsGrid}>
          {age && <InfoRow label="Age" value={age} />}
          {pet.weight != null && (
            <InfoRow label="Weight" value={`${pet.weight} kg`} />
          )}
          {pet.color && <InfoRow label="Color" value={pet.color} />}
          {pet.microchipId && (
            <InfoRow label="Microchip" value={pet.microchipId} />
          )}
        </View>

        <View style={styles.ownerSection}>
          <Text variant="labelSmall" style={styles.ownerLabel}>
            OWNER
          </Text>
          <Pressable
            onPress={() => onOwnerPress?.(owner.id)}
            accessibilityRole="link"
            accessibilityLabel={`View owner ${owner.name}`}
            style={styles.ownerLink}
          >
            <Text variant="bodyLarge" style={styles.ownerName}>
              {owner.name}
            </Text>
            <Text variant="bodySmall" style={styles.ownerChevron}>
              {'>'}
            </Text>
          </Pressable>
        </View>
      </Card.Body>
    </Card>
  );
}

const styles = StyleSheet.create({
  headerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  nameSection: {
    flex: 1,
    marginLeft: 16,
  },
  petName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1C1B1F',
  },
  speciesBreed: {
    color: '#49454F',
    marginTop: 2,
  },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 16,
  },
  infoRow: {
    minWidth: '40%' as unknown as number,
  },
  infoLabel: {
    color: '#49454F',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  ownerSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#CAC4D0',
    paddingTop: 12,
  },
  ownerLabel: {
    color: '#49454F',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  ownerLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ownerName: {
    color: colors.primary,
    fontWeight: '600',
  },
  ownerChevron: {
    color: colors.primary,
    fontSize: 16,
  },
});
