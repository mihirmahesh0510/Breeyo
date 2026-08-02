import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../src/providers/AuthProvider';

interface ClinicOption {
  id: string;
  name: string;
  address: string;
}

export default function SelectClinicScreen() {
  const router = useRouter();
  const { login, otpLogin } = useAuth();
  const params = useLocalSearchParams<{
    clinics: string;
    email?: string;
    password?: string;
    phone?: string;
    otp?: string;
  }>();

  const clinics = useMemo<ClinicOption[]>(() => {
    try {
      return JSON.parse(params.clinics || '[]');
    } catch {
      return [];
    }
  }, [params.clinics]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSelectClinic(clinic: ClinicOption) {
    setSelectedId(clinic.id);
    setError(null);
    setIsSubmitting(true);

    try {
      let result;

      if (params.email && params.password) {
        result = await login(params.email, params.password, clinic.id);
      } else if (params.phone && params.otp) {
        result = await otpLogin(params.phone, params.otp, clinic.id);
      } else {
        setError('Session expired. Please log in again.');
        setIsSubmitting(false);
        return;
      }

      if (result.success) {
        router.replace('/(app)');
      } else {
        setError(result.message);
      }
    } finally {
      setIsSubmitting(false);
      setSelectedId(null);
    }
  }

  function renderClinic({ item }: { item: ClinicOption }) {
    const isSelected = selectedId === item.id;
    return (
      <TouchableOpacity
        style={[styles.clinicCard, isSelected && styles.clinicCardSelected]}
        onPress={() => handleSelectClinic(item)}
        disabled={isSubmitting}
      >
        <View style={styles.clinicInfo}>
          <Text style={styles.clinicName}>{item.name}</Text>
          <Text style={styles.clinicAddress}>{item.address}</Text>
        </View>
        {isSelected && isSubmitting && <ActivityIndicator color="#2563eb" />}
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Select a Clinic</Text>
      <Text style={styles.subtitle}>
        You are a member of multiple clinics. Choose one to continue.
      </Text>

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={clinics}
        renderItem={renderClinic}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 24,
    paddingTop: 80,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
  },
  listContent: {
    paddingBottom: 24,
  },
  clinicCard: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fafafa',
  },
  clinicCardSelected: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  clinicInfo: {
    flex: 1,
  },
  clinicName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
    marginBottom: 4,
  },
  clinicAddress: {
    fontSize: 14,
    color: '#666',
  },
  separator: {
    height: 12,
  },
  errorContainer: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 14,
  },
});
