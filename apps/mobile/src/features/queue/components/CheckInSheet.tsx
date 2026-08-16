import React, { useState, useCallback, useEffect } from 'react';
import { View, FlatList, StyleSheet, Alert, Pressable } from 'react-native';
import { Text, TextInput, Button, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { BottomSheet } from '@breeyo/ui';
import { SPECIES_ICONS } from '@breeyo/types';
import type { OwnerWithPets, Pet } from '@breeyo/types';
import { useLookupOwner } from '../../patient/hooks/usePatientRegister';
import { useCheckIn } from '../hooks/useCheckIn';
import { VisitReasonPicker } from './VisitReasonPicker';

interface CheckInSheetProps {
  visible: boolean;
  onDismiss: () => void;
  onCheckInSuccess?: (petName: string, position: number) => void;
}

function formatMobile(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 10);
  if (digits.length > 5) {
    return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  return digits;
}

function extractDigits(formatted: string): string {
  return formatted.replace(/\D/g, '');
}

export function CheckInSheet({
  visible,
  onDismiss,
  onCheckInSuccess,
}: CheckInSheetProps) {
  const router = useRouter();
  const [mobileDisplay, setMobileDisplay] = useState('');
  const [selectedPet, setSelectedPet] = useState<Pet | null>(null);
  const [showReasonPicker, setShowReasonPicker] = useState(false);

  const mobile = extractDigits(mobileDisplay);
  const isValidMobile = /^[6-9]\d{9}$/.test(mobile);

  const lookupQuery = useLookupOwner(mobile);
  const checkInMutation = useCheckIn();

  const ownerData = lookupQuery.data?.data as OwnerWithPets | undefined;
  const isLooking = lookupQuery.isFetching;
  const ownerNotFound = isValidMobile && !isLooking && !ownerData;

  // Reset state when sheet closes
  useEffect(() => {
    if (!visible) {
      setMobileDisplay('');
      setSelectedPet(null);
      setShowReasonPicker(false);
    }
  }, [visible]);

  const handleMobileChange = useCallback((text: string) => {
    setMobileDisplay(formatMobile(text));
  }, []);

  const handlePetTap = useCallback((pet: Pet) => {
    setSelectedPet(pet);
    setShowReasonPicker(true);
  }, []);

  const handleReasonSelected = useCallback(
    async (params: { visitReason?: string; isEmergency: boolean }) => {
      if (!selectedPet) return;
      setShowReasonPicker(false);

      try {
        const result = await checkInMutation.mutateAsync({
          petId: selectedPet.id,
          visitReason: params.visitReason,
          isEmergency: params.isEmergency,
        });

        onDismiss();
        onCheckInSuccess?.(selectedPet.name, result.data.position);
      } catch (error: any) {
        if (error?.code === 'SAME_DAY_RECHECK') {
          Alert.alert(
            'Check in again?',
            `${selectedPet.name} was already seen today. Check in for another visit?`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Check In Again',
                onPress: async () => {
                  try {
                    const result = await checkInMutation.mutateAsync({
                      petId: selectedPet.id,
                      visitReason: params.visitReason,
                      isEmergency: params.isEmergency,
                      reCheckIn: true,
                    });
                    onDismiss();
                    onCheckInSuccess?.(selectedPet.name, result.data.position);
                  } catch {
                    // handled by mutation error handler
                  }
                },
              },
            ],
          );
        } else if (error?.status === 409) {
          Alert.alert(
            'Already in queue',
            `${selectedPet.name} is already in today's queue.`,
          );
        }
      }
    },
    [selectedPet, checkInMutation, onDismiss, onCheckInSuccess],
  );

  const handleRegisterNew = useCallback(() => {
    onDismiss();
    router.push({
      pathname: '/patient/register',
      params: { initialMobile: mobile, fromCheckIn: '1' },
    });
  }, [onDismiss, router, mobile]);

  const renderPetItem = useCallback(
    ({ item }: { item: Pet }) => {
      const speciesKey = (item.species || 'OTHER') as keyof typeof SPECIES_ICONS;
      const iconName = SPECIES_ICONS[speciesKey] || 'paw';

      return (
        <Pressable
          onPress={() => handlePetTap(item)}
          style={styles.petRow}
          accessibilityLabel={`Check in ${item.name}`}
          accessibilityRole="button"
        >
          <View style={styles.petIcon}>
            <MaterialCommunityIcons name={iconName as any} size={24} color="#5D4037" />
          </View>
          <Text variant="bodyLarge" style={styles.petName}>
            {item.name}
          </Text>
          <MaterialCommunityIcons name="chevron-right" size={20} color="#79747E" />
        </Pressable>
      );
    },
    [handlePetTap],
  );

  return (
    <>
      <BottomSheet
        visible={visible && !showReasonPicker}
        onDismiss={onDismiss}
        title="Check In Patient"
      >
        {/* Mobile Number Input */}
        <TextInput
          label="Mobile Number"
          value={mobileDisplay}
          onChangeText={handleMobileChange}
          keyboardType="phone-pad"
          maxLength={11} // 10 digits + 1 space
          placeholder="Enter 10-digit mobile number"
          left={<TextInput.Icon icon="phone" />}
          style={styles.mobileInput}
          testID="check-in-mobile-input"
        />

        {/* Loading State */}
        {isLooking && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" />
            <Text variant="bodySmall" style={styles.loadingText}>
              Looking up patient...
            </Text>
          </View>
        )}

        {/* Owner Found */}
        {ownerData && (
          <View style={styles.ownerSection}>
            <Text variant="titleMedium">{ownerData.name}</Text>
            <Text variant="bodySmall" style={styles.ownerMobile}>
              {formatMobile(ownerData.mobile)}
            </Text>
            <Text variant="bodySmall" style={styles.instructions}>
              Tap a pet to check in
            </Text>
            <FlatList
              data={ownerData.pets}
              keyExtractor={(item) => item.id}
              renderItem={renderPetItem}
              scrollEnabled={false}
              style={styles.petList}
            />
          </View>
        )}

        {/* Owner Not Found */}
        {ownerNotFound && (
          <View style={styles.notFoundSection}>
            <Text variant="titleMedium">New patient</Text>
            <Text variant="bodySmall" style={styles.notFoundText}>
              No records found for this number.
            </Text>
            <Button
              mode="outlined"
              onPress={handleRegisterNew}
              icon="account-plus"
              style={styles.registerButton}
            >
              Register New Patient
            </Button>
          </View>
        )}

        {/* Check-in Loading */}
        {checkInMutation.isPending && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" />
            <Text variant="bodySmall" style={styles.loadingText}>
              Checking in...
            </Text>
          </View>
        )}
      </BottomSheet>

      {/* Visit Reason Picker */}
      <VisitReasonPicker
        visible={showReasonPicker}
        onDismiss={() => setShowReasonPicker(false)}
        onSelect={handleReasonSelected}
      />
    </>
  );
}

const styles = StyleSheet.create({
  mobileInput: {
    marginBottom: 16,
    backgroundColor: '#FFFBF5',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
    justifyContent: 'center',
  },
  loadingText: {
    color: '#49454F',
  },
  ownerSection: {
    marginTop: 8,
  },
  ownerMobile: {
    color: '#49454F',
    marginBottom: 8,
  },
  instructions: {
    color: '#2E7D32',
    fontWeight: '500',
    marginBottom: 8,
  },
  petList: {
    marginTop: 4,
  },
  petRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F0EB',
    minHeight: 56,
  },
  petIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5F0EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  petName: {
    flex: 1,
  },
  notFoundSection: {
    marginTop: 16,
    alignItems: 'center',
    gap: 8,
  },
  notFoundText: {
    color: '#49454F',
  },
  registerButton: {
    marginTop: 8,
  },
});
