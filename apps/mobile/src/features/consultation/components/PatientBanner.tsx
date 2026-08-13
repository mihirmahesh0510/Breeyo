import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface PatientBannerProps {
  pet: {
    name: string;
    species: string;
    age: string;
    weight: string;
  };
  owner: {
    name: string;
    mobile: string;
  };
  visitReason?: string;
  warnings?: string[];
}

const SPECIES_ICONS: Record<string, string> = {
  dog: '\uD83D\uDC36',
  cat: '\uD83D\uDC31',
  rabbit: '\uD83D\uDC30',
  bird: '\uD83D\uDC26',
};

export function PatientBanner({ pet, owner, visitReason, warnings }: PatientBannerProps) {
  const speciesIcon = SPECIES_ICONS[pet.species.toLowerCase()] || '\uD83D\uDC3E';

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{speciesIcon}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.petName}>{pet.name}</Text>
          <Text style={styles.caption}>
            {pet.species} | {pet.age} | {pet.weight}
          </Text>
          <Text style={styles.caption}>
            {owner.name} | {owner.mobile}
          </Text>
        </View>
      </View>

      <View style={styles.chipRow}>
        {visitReason ? (
          <View style={styles.visitReasonChip}>
            <Text style={styles.visitReasonText}>{visitReason}</Text>
          </View>
        ) : null}
        {warnings?.map((warning) => (
          <View key={warning} style={styles.warningChip}>
            <Text style={styles.warningText}>{warning}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#E8E0D8',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 56,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFBF5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 20,
  },
  info: {
    flex: 1,
  },
  petName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1C1B1F',
  },
  caption: {
    fontSize: 12,
    color: '#49454F',
    marginTop: 1,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    gap: 6,
  },
  visitReasonChip: {
    backgroundColor: '#C8E6C9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
  },
  visitReasonText: {
    fontSize: 12,
    color: '#1B5E20',
    fontWeight: '500',
  },
  warningChip: {
    backgroundColor: '#FFDAD6',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
  },
  warningText: {
    fontSize: 12,
    color: '#93000A',
    fontWeight: '500',
  },
});
