import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors as COLORS } from '@breeyo/ui';
import type { OwnerWithPets } from '@breeyo/types';

// --- Props ---

export interface ExistingOwnerCardProps {
  owner: OwnerWithPets;
  onAddPet: () => void;
  onViewProfile: () => void;
  testID?: string;
}

// --- Helpers ---

function formatMobile(mobile: string): string {
  // Format as "98765 43210" for Indian mobiles
  const clean = mobile.replace(/\D/g, '');
  const digits = clean.length > 10 ? clean.slice(-10) : clean;
  if (digits.length === 10) {
    return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  return mobile;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// --- Component ---

export function ExistingOwnerCard({
  owner,
  onAddPet,
  onViewProfile,
  testID,
}: ExistingOwnerCardProps) {
  const petCount = owner.pets?.length ?? 0;

  return (
    <View style={styles.card} testID={testID}>
      {/* Header badge */}
      <View style={styles.badge}>
        <MaterialCommunityIcons
          name="account-check"
          size={16}
          color={COLORS.onPrimaryContainer}
        />
        <Text variant="labelSmall" style={styles.badgeText}>
          Owner already registered
        </Text>
      </View>

      {/* Owner info row */}
      <View style={styles.infoRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{getInitials(owner.name)}</Text>
        </View>

        <View style={styles.infoContent}>
          <Text variant="titleMedium" style={styles.ownerName}>
            {owner.name}
          </Text>
          <Text variant="bodyMedium" style={styles.ownerMobile}>
            +91 {formatMobile(owner.mobile)}
          </Text>
          <Text variant="bodySmall" style={styles.petCount}>
            {petCount} {petCount === 1 ? 'pet' : 'pets'} registered
          </Text>
        </View>
      </View>

      {/* Pet chips (show existing pet names) */}
      {petCount > 0 && (
        <View style={styles.petChips}>
          {owner.pets.map((pet) => (
            <View key={pet.id} style={styles.petChip}>
              <Text variant="labelSmall" style={styles.petChipText}>
                {pet.name} ({pet.species.toLowerCase()})
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Action buttons */}
      <View style={styles.actions}>
        <View
          style={styles.addPetButton}
          accessibilityRole="button"
          accessibilityLabel="Add pet to this owner"
        >
          <Text
            variant="labelLarge"
            style={styles.addPetButtonText}
            onPress={onAddPet}
          >
            Add Pet
          </Text>
        </View>

        <Text
          variant="labelLarge"
          style={styles.viewProfileLink}
          onPress={onViewProfile}
          accessibilityRole="button"
          accessibilityLabel="View owner profile"
        >
          View Profile
        </Text>
      </View>
    </View>
  );
}

// --- Styles ---

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.primaryContainer,
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badgeText: {
    color: COLORS.onPrimaryContainer,
    fontWeight: '600',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: COLORS.onPrimary,
    fontWeight: '700',
    fontSize: 16,
  },
  infoContent: {
    flex: 1,
    gap: 2,
  },
  ownerName: {
    color: COLORS.onPrimaryContainer,
    fontWeight: '600',
  },
  ownerMobile: {
    color: COLORS.onPrimaryContainer,
  },
  petCount: {
    color: COLORS.onPrimaryContainer,
    opacity: 0.8,
  },
  petChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  petChip: {
    backgroundColor: COLORS.surfaceVariant,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
  },
  petChipText: {
    color: COLORS.onSurfaceVariant,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 4,
  },
  addPetButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  addPetButtonText: {
    color: COLORS.onPrimary,
    fontWeight: '600',
  },
  viewProfileLink: {
    color: COLORS.primary,
    fontWeight: '600',
  },
});
