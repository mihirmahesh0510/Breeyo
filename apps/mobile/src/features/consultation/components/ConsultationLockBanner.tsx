import React from 'react';
import { View, Text, Pressable, Alert, StyleSheet } from 'react-native';

interface ConsultationLockBannerProps {
  vetName: string;
  isStale?: boolean;
  onTakeOver: () => void;
}

export function ConsultationLockBanner({
  vetName,
  isStale = false,
  onTakeOver,
}: ConsultationLockBannerProps) {
  const handleTakeOver = () => {
    Alert.alert(
      'Take Over Consultation?',
      `This will override Dr. ${vetName}'s session. They may lose unsaved changes.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Take Over',
          style: 'destructive',
          onPress: onTakeOver,
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.contentRow}>
        <Text style={styles.lockIcon}>{'\uD83D\uDD12'}</Text>
        <Text style={styles.text}>
          Dr. {vetName} is currently consulting this patient.
        </Text>
      </View>
      {isStale && (
        <Pressable style={styles.takeOverButton} onPress={handleTakeOver}>
          <Text style={styles.takeOverText}>Take Over</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#FFE0B2',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  lockIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  text: {
    fontSize: 13,
    color: '#E65100',
    flex: 1,
  },
  takeOverButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#FFDAD6',
    borderRadius: 16,
    marginLeft: 8,
  },
  takeOverText: {
    fontSize: 12,
    color: '#93000A',
    fontWeight: '600',
  },
});
