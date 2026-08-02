import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { apiClient } from '../../src/lib/api';
import { getAccessToken } from '../../src/lib/auth-storage';

interface ClinicData {
  id: string;
  name: string;
  address: string;
  city?: string;
  contactPhone?: string;
  gstin?: string;
}

interface ClinicResponse {
  data: ClinicData;
}

export default function ClinicProfileStep() {
  const router = useRouter();

  const [clinicName, setClinicName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [gstin, setGstin] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    async function fetchClinic() {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const response = await apiClient<ClinicResponse>('/api/v1/clinics/current', {
          token,
        });
        const clinic = response.data;
        setClinicName(clinic.name || '');
        setAddress(clinic.address || '');
        setCity(clinic.city || '');
        setContactPhone(clinic.contactPhone || '');
        setGstin(clinic.gstin || '');
      } catch {
        // If fetch fails, user can still fill in manually
      } finally {
        setIsLoading(false);
      }
    }
    fetchClinic();
  }, []);

  const handleNext = async () => {
    setIsSaving(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        Alert.alert('Error', 'Session expired. Please log in again.');
        return;
      }
      await apiClient('/api/v1/clinics/current/profile', {
        method: 'PUT',
        token,
        body: JSON.stringify({
          name: clinicName,
          address,
          city,
          contactPhone,
          gstin: gstin || undefined,
        }),
      });
      router.push('/setup-wizard/invite-staff');
    } catch {
      Alert.alert('Error', 'Failed to save clinic profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Clinic Profile</Text>
      <Text style={styles.subtitle}>Tell us about your clinic</Text>

      <View style={styles.field}>
        <Text style={styles.label}>Clinic Name</Text>
        <TextInput
          style={styles.input}
          value={clinicName}
          onChangeText={setClinicName}
          placeholder="Enter clinic name"
          testID="clinic-name-input"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Address</Text>
        <TextInput
          style={styles.input}
          value={address}
          onChangeText={setAddress}
          placeholder="Enter address"
          testID="address-input"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>City</Text>
        <TextInput
          style={styles.input}
          value={city}
          onChangeText={setCity}
          placeholder="Enter city"
          testID="city-input"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Contact Phone</Text>
        <TextInput
          style={styles.input}
          value={contactPhone}
          onChangeText={setContactPhone}
          placeholder="Enter phone number"
          keyboardType="phone-pad"
          testID="phone-input"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>GSTIN (Optional)</Text>
        <TextInput
          style={styles.input}
          value={gstin}
          onChangeText={setGstin}
          placeholder="Enter GSTIN"
          autoCapitalize="characters"
          testID="gstin-input"
        />
      </View>

      <TouchableOpacity
        style={[styles.button, isSaving && styles.buttonDisabled]}
        onPress={handleNext}
        disabled={isSaving}
        testID="next-button"
      >
        <Text style={styles.buttonText}>{isSaving ? 'Saving...' : 'Next'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    padding: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 24,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111827',
  },
  button: {
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
