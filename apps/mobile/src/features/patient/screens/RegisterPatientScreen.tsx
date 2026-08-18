import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TextInput as RNTextInput,
} from 'react-native';
import { Text, ProgressBar, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { Species, OwnerWithPets, RegisterOwnerInput, RegisterPetInput } from '@breeyo/types';
import { showToast } from '@breeyo/ui';

import { useRegisterPatient, useLookupOwner, useAddPet } from '../hooks/usePatientRegister';
import { useCheckIn } from '../../queue/hooks/useCheckIn';
import { SpeciesBreedPicker } from '../components/SpeciesBreedPicker';
import { PetPhotoPicker } from '../components/PetPhotoPicker';
import { ExistingOwnerCard } from '../components/ExistingOwnerCard';

// --- Types ---

interface OwnerFormData {
  mobile: string;
  name: string;
  email: string;
  address: string;
  altPhone: string;
}

interface PetFormData {
  name: string;
  species: Species | null;
  breed: string;
  ageYears: string;
  ageMonths: string;
  weight: string;
  color: string;
  microchipId: string;
  photoUri: string | null;
  notes: string;
}

// --- Constants ---

const COLORS = {
  primary: '#2E7D32',
  onPrimary: '#FFFFFF',
  tertiary: '#E65100',
  background: '#FFFBF5',
  surface: '#FFFBF5',
  onSurface: '#1C1B1F',
  onSurfaceVariant: '#49454F',
  outline: '#79747E',
  outlineVariant: '#CAC4D0',
  error: '#BA1A1A',
  primaryContainer: '#C8E6C9',
  surfaceVariant: '#F5F0EB',
  success: '#2E7D32',
} as const;

const INITIAL_OWNER: OwnerFormData = {
  mobile: '',
  name: '',
  email: '',
  address: '',
  altPhone: '',
};

const INITIAL_PET: PetFormData = {
  name: '',
  species: null,
  breed: '',
  ageYears: '',
  ageMonths: '',
  weight: '',
  color: '',
  microchipId: '',
  photoUri: null,
  notes: '',
};

const MOBILE_REGEX = /^[6-9]\d{9}$/;

// --- Helpers ---

function formatMobileDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)} ${digits.slice(5)}`;
}

function cleanMobile(formatted: string): string {
  return formatted.replace(/\s/g, '');
}

function isValidMobile(mobile: string): boolean {
  return MOBILE_REGEX.test(cleanMobile(mobile));
}

// --- Component ---

export function RegisterPatientScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    initialMobile?: string;
    ownerId?: string;
    fromCheckIn?: string;
  }>();

  // --- State ---
  const [step, setStep] = useState<1 | 2>(params.ownerId ? 2 : 1);
  const [ownerForm, setOwnerForm] = useState<OwnerFormData>(() => ({
    ...INITIAL_OWNER,
    mobile: params.initialMobile
      ? formatMobileDisplay(params.initialMobile)
      : '',
  }));
  const [petForm, setPetForm] = useState<PetFormData>(INITIAL_PET);
  const [existingOwner, setExistingOwner] = useState<OwnerWithPets | null>(null);
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const [ownerErrors, setOwnerErrors] = useState<Record<string, string>>({});
  const [petErrors, setPetErrors] = useState<Record<string, string>>({});

  // --- Queries & Mutations ---
  const mobileLookupQuery = cleanMobile(ownerForm.mobile);
  const lookupResult = useLookupOwner(mobileLookupQuery);

  const registerMutation = useRegisterPatient();
  const addPetMutation = useAddPet(existingOwner?.id ?? params.ownerId ?? '');
  const checkInMutation = useCheckIn();

  // --- Derived ---
  const isStep1Valid = useMemo(() => {
    return isValidMobile(ownerForm.mobile) && ownerForm.name.trim().length > 0;
  }, [ownerForm.mobile, ownerForm.name]);

  const isStep2Valid = useMemo(() => {
    return petForm.name.trim().length > 0 && petForm.species !== null;
  }, [petForm.name, petForm.species]);

  const isSubmitting = registerMutation.isPending || addPetMutation.isPending || checkInMutation.isPending;

  // --- Effects ---

  // Auto-detect existing owner when lookup returns data
  useEffect(() => {
    if (lookupResult.data) {
      setExistingOwner(lookupResult.data);
    } else if (lookupResult.isError) {
      // 404 means owner not found -- clear existing owner
      setExistingOwner(null);
    }
  }, [lookupResult.data, lookupResult.isError]);

  // Pre-fill step 2 for existing owner passed via route param
  useEffect(() => {
    if (params.ownerId) {
      setStep(2);
    }
  }, [params.ownerId]);

  // --- Form Field Handlers ---

  const updateOwnerField = useCallback(
    (field: keyof OwnerFormData) => (value: string) => {
      if (field === 'mobile') {
        // Only allow digits, format as we go
        const digits = value.replace(/\D/g, '').slice(0, 10);
        setOwnerForm((prev) => ({ ...prev, mobile: formatMobileDisplay(digits) }));
        // Clear existing owner when mobile changes
        setExistingOwner(null);
      } else {
        setOwnerForm((prev) => ({ ...prev, [field]: value }));
      }
      // Clear error for this field
      setOwnerErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    },
    [],
  );

  const updatePetField = useCallback(
    (field: keyof PetFormData) =>
      (value: string | Species | null) => {
        setPetForm((prev) => ({ ...prev, [field]: value }));
        setPetErrors((prev) => {
          const next = { ...prev };
          delete next[field];
          return next;
        });
      },
    [],
  );

  // --- Step Navigation ---

  const handleNext = useCallback(() => {
    // Validate step 1
    const errors: Record<string, string> = {};
    if (!isValidMobile(ownerForm.mobile)) {
      errors.mobile = 'Enter a valid 10-digit Indian mobile number';
    }
    if (!ownerForm.name.trim()) {
      errors.name = 'Owner name is required';
    }
    if (ownerForm.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerForm.email)) {
      errors.email = 'Enter a valid email address';
    }

    if (Object.keys(errors).length > 0) {
      setOwnerErrors(errors);
      return;
    }

    setStep(2);
  }, [ownerForm]);

  const handleBack = useCallback(() => {
    setStep(1);
    setPetErrors({});
  }, []);

  // --- Existing Owner Actions ---

  const handleAddPetToExisting = useCallback(() => {
    if (existingOwner) {
      setStep(2);
    }
  }, [existingOwner]);

  const handleViewProfile = useCallback(() => {
    if (existingOwner) {
      router.push(`/(app)/owner/${existingOwner.id}` as any);
    }
  }, [existingOwner, router]);

  // --- Submit ---

  const handleRegister = useCallback(async () => {
    // Validate pet form
    const errors: Record<string, string> = {};
    if (!petForm.name.trim()) {
      errors.name = 'Pet name is required';
    }
    if (!petForm.species) {
      errors.species = 'Species is required';
    }
    if (petForm.ageYears && (isNaN(Number(petForm.ageYears)) || Number(petForm.ageYears) < 0)) {
      errors.ageYears = 'Enter a valid number';
    }
    if (petForm.ageMonths && (isNaN(Number(petForm.ageMonths)) || Number(petForm.ageMonths) < 0 || Number(petForm.ageMonths) > 11)) {
      errors.ageMonths = 'Enter 0-11';
    }
    if (petForm.weight && (isNaN(Number(petForm.weight)) || Number(petForm.weight) <= 0)) {
      errors.weight = 'Enter a valid weight';
    }

    if (Object.keys(errors).length > 0) {
      setPetErrors(errors);
      return;
    }

    // Build pet input
    const petInput: RegisterPetInput = {
      name: petForm.name.trim(),
      species: petForm.species!,
    };
    if (petForm.breed) petInput.breed = petForm.breed;
    if (petForm.ageYears) {
      const currentYear = new Date().getFullYear();
      petInput.birthYear = currentYear - Number(petForm.ageYears);
    }
    if (petForm.ageMonths) {
      const currentMonth = new Date().getMonth() + 1;
      const monthOffset = Number(petForm.ageMonths);
      let birthMonth = currentMonth - monthOffset;
      if (birthMonth <= 0) birthMonth += 12;
      petInput.birthMonth = birthMonth;
    }
    if (petForm.weight) petInput.weight = Number(petForm.weight);
    if (petForm.color.trim()) petInput.color = petForm.color.trim();
    if (petForm.microchipId.trim()) petInput.microchipId = petForm.microchipId.trim();
    if (petForm.notes.trim()) petInput.notes = petForm.notes.trim();
    // Note: photoUrl would require upload first; for now pass the local URI marker
    // Actual upload is handled separately before this call in production
    if (petForm.photoUri) petInput.photoUrl = petForm.photoUri;

    try {
      let newPetId: string | undefined;

      if (existingOwner || params.ownerId) {
        // Add pet to existing owner
        const addedPet = await addPetMutation.mutateAsync(petInput);
        newPetId = addedPet.id;
        showToast('success', `${petInput.name} added to ${existingOwner?.name ?? 'owner'}`);
      } else {
        // Register new owner + pet
        const ownerInput: RegisterOwnerInput = {
          mobile: cleanMobile(ownerForm.mobile),
          name: ownerForm.name.trim(),
        };
        if (ownerForm.email.trim()) ownerInput.email = ownerForm.email.trim();
        if (ownerForm.address.trim()) ownerInput.address = ownerForm.address.trim();
        if (ownerForm.altPhone.trim()) ownerInput.altPhone = cleanMobile(ownerForm.altPhone);

        const result = await registerMutation.mutateAsync({
          owner: ownerInput,
          pet: petInput,
        });
        newPetId = result.pet.id;
        showToast('success', `${petInput.name} registered successfully`);
      }

      // Auto-check-in when coming from the check-in flow (D-12)
      if (params.fromCheckIn === '1' && newPetId) {
        try {
          await checkInMutation.mutateAsync({ petId: newPetId });
          showToast('success', `${petInput.name} checked in to queue`);
          router.back();
          return;
        } catch {
          // Check-in failed but registration succeeded — still show success
          showToast('error', 'Registered but could not auto-check-in. Please check in manually.');
        }
      }

      setRegistrationComplete(true);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Registration failed. Please try again.';
      showToast('error', message);
    }
  }, [
    petForm,
    ownerForm,
    existingOwner,
    params.ownerId,
    params.fromCheckIn,
    registerMutation,
    addPetMutation,
    checkInMutation,
    router,
  ]);

  const handleAddAnother = useCallback(() => {
    setPetForm(INITIAL_PET);
    setPetErrors({});
    setRegistrationComplete(false);
    // Stay on step 2 if adding to existing owner
    if (!existingOwner && !params.ownerId) {
      setStep(1);
      setOwnerForm(INITIAL_OWNER);
      setOwnerErrors({});
      setExistingOwner(null);
    }
  }, [existingOwner, params.ownerId]);

  // --- Render ---

  if (registrationComplete) {
    return (
      <View style={styles.container}>
        <View style={styles.successContainer}>
          <MaterialCommunityIcons
            name="check-circle"
            size={72}
            color={COLORS.success}
          />
          <Text variant="headlineSmall" style={styles.successTitle}>
            Patient Registered!
          </Text>
          <Text variant="bodyMedium" style={styles.successSubtitle}>
            {petForm.name} has been successfully registered.
          </Text>

          <View style={styles.successActions}>
            <View style={styles.primaryButton}>
              <Text
                variant="labelLarge"
                style={styles.primaryButtonText}
                onPress={handleAddAnother}
                accessibilityRole="button"
              >
                Add Another Pet
              </Text>
            </View>
            <Text
              variant="labelLarge"
              style={styles.textButton}
              onPress={() => router.back()}
              accessibilityRole="button"
            >
              Done
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      {/* Step Progress */}
      <View style={styles.header}>
        <View style={styles.stepIndicator}>
          <Text variant="labelMedium" style={styles.stepLabel}>
            Step {step} of 2
          </Text>
          <Text variant="titleMedium" style={styles.stepTitle}>
            {step === 1 ? 'Owner Information' : 'Pet Information'}
          </Text>
        </View>
        <ProgressBar
          progress={step / 2}
          color={COLORS.primary}
          style={styles.progressBar}
        />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {step === 1 ? (
          <Step1OwnerInfo
            form={ownerForm}
            errors={ownerErrors}
            existingOwner={existingOwner}
            isLookingUp={lookupResult.isFetching}
            onChangeField={updateOwnerField}
            onAddPetToExisting={handleAddPetToExisting}
            onViewProfile={handleViewProfile}
          />
        ) : (
          <Step2PetInfo
            form={petForm}
            errors={petErrors}
            onChangeField={updatePetField}
          />
        )}
      </ScrollView>

      {/* Bottom Action Bar */}
      <View style={styles.bottomBar}>
        {step === 2 && !params.ownerId && (
          <View style={styles.outlinedButton}>
            <Text
              variant="labelLarge"
              style={styles.outlinedButtonText}
              onPress={handleBack}
              accessibilityRole="button"
            >
              Back
            </Text>
          </View>
        )}

        {step === 1 ? (
          <View
            style={[
              styles.primaryButton,
              styles.flexButton,
              !isStep1Valid && styles.disabledButton,
            ]}
          >
            <Text
              variant="labelLarge"
              style={[
                styles.primaryButtonText,
                !isStep1Valid && styles.disabledButtonText,
              ]}
              onPress={isStep1Valid ? handleNext : undefined}
              accessibilityRole="button"
              accessibilityState={{ disabled: !isStep1Valid }}
            >
              Next
            </Text>
          </View>
        ) : (
          <View
            style={[
              styles.primaryButton,
              styles.flexButton,
              (!isStep2Valid || isSubmitting) && styles.disabledButton,
            ]}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color={COLORS.onPrimary} />
            ) : (
              <Text
                variant="labelLarge"
                style={[
                  styles.primaryButtonText,
                  (!isStep2Valid || isSubmitting) && styles.disabledButtonText,
                ]}
                onPress={isStep2Valid && !isSubmitting ? handleRegister : undefined}
                accessibilityRole="button"
                accessibilityState={{ disabled: !isStep2Valid || isSubmitting }}
              >
                Register Patient
              </Text>
            )}
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

// --- Step 1: Owner Information ---

interface Step1Props {
  form: OwnerFormData;
  errors: Record<string, string>;
  existingOwner: OwnerWithPets | null;
  isLookingUp: boolean;
  onChangeField: (field: keyof OwnerFormData) => (value: string) => void;
  onAddPetToExisting: () => void;
  onViewProfile: () => void;
}

function Step1OwnerInfo({
  form,
  errors,
  existingOwner,
  isLookingUp,
  onChangeField,
  onAddPetToExisting,
  onViewProfile,
}: Step1Props) {
  return (
    <View style={styles.stepContent}>
      {/* Mobile Number */}
      <View style={styles.fieldGroup}>
        <Text variant="labelLarge" style={styles.fieldLabel}>
          Mobile Number *
        </Text>
        <View style={styles.mobileInputRow}>
          <View style={styles.countryCode}>
            <Text variant="bodyLarge" style={styles.countryCodeText}>
              +91
            </Text>
          </View>
          <View style={styles.mobileInputContainer}>
            <MobileInput
              value={form.mobile}
              onChangeText={onChangeField('mobile')}
              error={errors.mobile}
            />
          </View>
          {isLookingUp && (
            <ActivityIndicator
              size="small"
              color={COLORS.primary}
              style={styles.lookupSpinner}
            />
          )}
        </View>
        {errors.mobile && (
          <Text variant="bodySmall" style={styles.errorText}>
            {errors.mobile}
          </Text>
        )}
      </View>

      {/* Existing Owner Card */}
      {existingOwner && (
        <ExistingOwnerCard
          owner={existingOwner}
          onAddPet={onAddPetToExisting}
          onViewProfile={onViewProfile}
          testID="existing-owner-card"
        />
      )}

      {/* Name */}
      <FieldInput
        label="Owner Name *"
        value={form.name}
        onChangeText={onChangeField('name')}
        error={errors.name}
        placeholder="Full name"
        autoCapitalize="words"
        testID="owner-name-input"
      />

      {/* Optional Fields */}
      <Text variant="labelMedium" style={styles.sectionHeader}>
        Optional Details
      </Text>

      <FieldInput
        label="Email"
        value={form.email}
        onChangeText={onChangeField('email')}
        error={errors.email}
        placeholder="email@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        testID="owner-email-input"
      />

      <FieldInput
        label="Address"
        value={form.address}
        onChangeText={onChangeField('address')}
        placeholder="Full address"
        multiline
        testID="owner-address-input"
      />

      <FieldInput
        label="Alternate Phone"
        value={form.altPhone}
        onChangeText={onChangeField('altPhone')}
        placeholder="10-digit number"
        keyboardType="phone-pad"
        testID="owner-alt-phone-input"
      />
    </View>
  );
}

// --- Step 2: Pet Information ---

interface Step2Props {
  form: PetFormData;
  errors: Record<string, string>;
  onChangeField: (field: keyof PetFormData) => (value: string | Species | null) => void;
}

function Step2PetInfo({ form, errors, onChangeField }: Step2Props) {
  return (
    <View style={styles.stepContent}>
      {/* Photo Picker */}
      <PetPhotoPicker
        photoUri={form.photoUri}
        onPhotoSelected={(uri) => onChangeField('photoUri')(uri)}
        onRemove={() => onChangeField('photoUri')(null)}
        testID="pet-photo-picker"
      />

      {/* Pet Name */}
      <FieldInput
        label="Pet Name *"
        value={form.name}
        onChangeText={onChangeField('name') as (v: string) => void}
        error={errors.name}
        placeholder="e.g., Bruno, Whiskers"
        autoCapitalize="words"
        testID="pet-name-input"
      />

      {/* Species & Breed */}
      <View style={styles.fieldGroup}>
        <Text variant="labelLarge" style={styles.fieldLabel}>
          Species *
        </Text>
        <SpeciesBreedPicker
          species={form.species}
          breed={form.breed}
          onSpeciesChange={(s) => onChangeField('species')(s)}
          onBreedChange={(b) => onChangeField('breed')(b)}
          testID="species-breed-picker"
        />
        {errors.species && (
          <Text variant="bodySmall" style={styles.errorText}>
            {errors.species}
          </Text>
        )}
      </View>

      {/* Age */}
      <Text variant="labelMedium" style={styles.sectionHeader}>
        Age (optional)
      </Text>
      <View style={styles.row}>
        <View style={styles.halfField}>
          <FieldInput
            label="Years"
            value={form.ageYears}
            onChangeText={onChangeField('ageYears') as (v: string) => void}
            error={errors.ageYears}
            placeholder="0"
            keyboardType="number-pad"
            testID="pet-age-years-input"
          />
        </View>
        <View style={styles.halfField}>
          <FieldInput
            label="Months"
            value={form.ageMonths}
            onChangeText={onChangeField('ageMonths') as (v: string) => void}
            error={errors.ageMonths}
            placeholder="0"
            keyboardType="number-pad"
            testID="pet-age-months-input"
          />
        </View>
      </View>

      {/* Weight */}
      <FieldInput
        label="Weight (kg)"
        value={form.weight}
        onChangeText={onChangeField('weight') as (v: string) => void}
        error={errors.weight}
        placeholder="e.g., 12.5"
        keyboardType="decimal-pad"
        testID="pet-weight-input"
      />

      {/* Optional text fields */}
      <Text variant="labelMedium" style={styles.sectionHeader}>
        Additional Details (optional)
      </Text>

      <FieldInput
        label="Color / Markings"
        value={form.color}
        onChangeText={onChangeField('color') as (v: string) => void}
        placeholder="e.g., Golden, Black & White"
        testID="pet-color-input"
      />

      <FieldInput
        label="Microchip ID"
        value={form.microchipId}
        onChangeText={onChangeField('microchipId') as (v: string) => void}
        placeholder="15-digit microchip number"
        testID="pet-microchip-input"
      />

      <FieldInput
        label="Notes"
        value={form.notes}
        onChangeText={onChangeField('notes') as (v: string) => void}
        placeholder="Any additional notes about this pet..."
        multiline
        testID="pet-notes-input"
      />
    </View>
  );
}

// --- Shared Sub-components ---

/**
 * Mobile number text input with numeric keyboard
 */
function MobileInput({
  value,
  onChangeText,
  error,
}: {
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
}) {
  return (
    <RNTextInput
      value={value}
      onChangeText={onChangeText}
      keyboardType="number-pad"
      maxLength={11} // 10 digits + 1 space
      placeholder="98765 43210"
      placeholderTextColor={COLORS.onSurfaceVariant}
      style={[
        styles.mobileTextInput,
        error ? { borderColor: COLORS.error } : null,
      ]}
      accessibilityLabel="Mobile number"
      testID="owner-mobile-input"
    />
  );
}

/**
 * Reusable field input wrapper with label and error handling.
 * Uses raw React Native TextInput for full prop control.
 */
function FieldInput({
  label,
  value,
  onChangeText,
  error,
  placeholder,
  keyboardType,
  autoCapitalize,
  multiline,
  testID,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
  placeholder?: string;
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'number-pad' | 'decimal-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  multiline?: boolean;
  testID?: string;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text variant="labelLarge" style={styles.fieldLabel}>
        {label}
      </Text>
      <RNTextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.onSurfaceVariant}
        keyboardType={keyboardType ?? 'default'}
        autoCapitalize={autoCapitalize ?? 'sentences'}
        multiline={multiline ?? false}
        style={[
          styles.textInput,
          multiline && styles.multilineInput,
          error ? { borderColor: COLORS.error } : null,
        ]}
        accessibilityLabel={label}
        testID={testID}
      />
      {error && (
        <Text variant="bodySmall" style={styles.errorText}>
          {error}
        </Text>
      )}
    </View>
  );
}

// --- Styles ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.outlineVariant,
  },
  stepIndicator: {
    marginBottom: 12,
  },
  stepLabel: {
    color: COLORS.onSurfaceVariant,
    marginBottom: 2,
  },
  stepTitle: {
    color: COLORS.onSurface,
    fontWeight: '600',
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  stepContent: {
    gap: 16,
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    color: COLORS.onSurface,
    fontWeight: '500',
  },
  textInput: {
    borderWidth: 1,
    borderColor: COLORS.outline,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.onSurface,
    backgroundColor: COLORS.surface,
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  errorText: {
    color: COLORS.error,
    marginTop: 2,
  },
  sectionHeader: {
    color: COLORS.onSurfaceVariant,
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfField: {
    flex: 1,
  },

  // Mobile input specific
  mobileInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countryCode: {
    borderWidth: 1,
    borderColor: COLORS.outline,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: COLORS.surfaceVariant,
  },
  countryCodeText: {
    color: COLORS.onSurface,
    fontWeight: '500',
  },
  mobileInputContainer: {
    flex: 1,
  },
  mobileTextInput: {
    borderWidth: 1,
    borderColor: COLORS.outline,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 18,
    color: COLORS.onSurface,
    backgroundColor: COLORS.surface,
    letterSpacing: 1,
  },
  lookupSpinner: {
    marginLeft: 4,
  },

  // Bottom bar
  bottomBar: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.outlineVariant,
    backgroundColor: COLORS.surface,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: COLORS.onPrimary,
    fontWeight: '600',
  },
  outlinedButton: {
    borderWidth: 1,
    borderColor: COLORS.outline,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlinedButtonText: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  flexButton: {
    flex: 1,
  },
  disabledButton: {
    backgroundColor: COLORS.surfaceVariant,
  },
  disabledButtonText: {
    color: COLORS.onSurfaceVariant,
  },
  textButton: {
    color: COLORS.primary,
    fontWeight: '600',
    paddingVertical: 8,
  },

  // Success state
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  successTitle: {
    color: COLORS.onSurface,
    fontWeight: '600',
  },
  successSubtitle: {
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
  },
  successActions: {
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
  },
});
