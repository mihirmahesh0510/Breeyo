import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, Link } from 'expo-router';
import { signupSchema } from '@breeyo/validators';
import { apiClient, ApiClientError } from '../../src/lib/api';

interface FieldErrors {
  [key: string]: string | undefined;
}

export default function SignupScreen() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [clinicAddress, setClinicAddress] = useState('');
  const [clinicPhone, setClinicPhone] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);

  function formatPhone(raw: string): string {
    const digits = raw.replace(/\D/g, '');
    return digits.startsWith('91') ? `+${digits}` : `+91${digits}`;
  }

  async function handleSignup() {
    setFieldErrors({});
    setApiError(null);

    const input = {
      email: email.trim(),
      password,
      fullName: fullName.trim(),
      phone: formatPhone(phone),
      licenseNumber: licenseNumber.trim() || undefined,
      specialization: specialization.trim() || undefined,
      clinicName: clinicName.trim(),
      clinicAddress: clinicAddress.trim(),
      clinicPhone: formatPhone(clinicPhone),
    };

    const parsed = signupSchema.safeParse(input);
    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as string;
        if (!errors[field]) {
          errors[field] = issue.message;
        }
      }
      setFieldErrors(errors);
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient('/api/v1/auth/signup', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      router.replace({
        pathname: '/(auth)/verify-email',
        params: { email: parsed.data.email },
      });
    } catch (error) {
      if (error instanceof ApiClientError) {
        setApiError(error.message);
      } else {
        setApiError('Unable to connect to server. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function renderError(field: string) {
    if (!fieldErrors[field]) return null;
    return <Text style={styles.errorText}>{fieldErrors[field]}</Text>;
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>Set up your clinic on Breeyo</Text>

        {apiError && (
          <View style={styles.apiErrorContainer}>
            <Text style={styles.apiErrorText}>{apiError}</Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>Your Details</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Full Name</Text>
          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            placeholder="Dr. Priya Sharma"
            autoCapitalize="words"
            autoComplete="name"
          />
          {renderError('fullName')}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="priya@clinic.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          {renderError('email')}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Minimum 8 characters"
            secureTextEntry
            autoComplete="new-password"
          />
          {renderError('password')}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Phone Number</Text>
          <View style={styles.phoneRow}>
            <Text style={styles.phonePrefix}>+91</Text>
            <TextInput
              style={[styles.input, styles.phoneInput]}
              value={phone}
              onChangeText={setPhone}
              placeholder="9876543210"
              keyboardType="phone-pad"
              maxLength={10}
            />
          </View>
          {renderError('phone')}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>License Number (optional)</Text>
          <TextInput
            style={styles.input}
            value={licenseNumber}
            onChangeText={setLicenseNumber}
            placeholder="e.g. MCI-12345"
            autoCapitalize="characters"
          />
          {renderError('licenseNumber')}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Specialization (optional)</Text>
          <TextInput
            style={styles.input}
            value={specialization}
            onChangeText={setSpecialization}
            placeholder="e.g. General Practice"
            autoCapitalize="words"
          />
          {renderError('specialization')}
        </View>

        <Text style={styles.sectionTitle}>Clinic Details</Text>

        <View style={styles.field}>
          <Text style={styles.label}>Clinic Name</Text>
          <TextInput
            style={styles.input}
            value={clinicName}
            onChangeText={setClinicName}
            placeholder="Sharma Health Clinic"
            autoCapitalize="words"
          />
          {renderError('clinicName')}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Clinic Address</Text>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            value={clinicAddress}
            onChangeText={setClinicAddress}
            placeholder="123 MG Road, Bengaluru"
            multiline
            numberOfLines={2}
          />
          {renderError('clinicAddress')}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Clinic Phone</Text>
          <View style={styles.phoneRow}>
            <Text style={styles.phonePrefix}>+91</Text>
            <TextInput
              style={[styles.input, styles.phoneInput]}
              value={clinicPhone}
              onChangeText={setClinicPhone}
              placeholder="9876543210"
              keyboardType="phone-pad"
              maxLength={10}
            />
          </View>
          {renderError('clinicPhone')}
        </View>

        <TouchableOpacity
          style={[styles.button, isSubmitting && styles.buttonDisabled]}
          onPress={handleSignup}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Sign Up</Text>
          )}
        </TouchableOpacity>

        <View style={styles.linkContainer}>
          <Text style={styles.linkText}>Already have an account? </Text>
          <Link href="/(auth)/login" asChild>
            <TouchableOpacity>
              <Text style={styles.linkAction}>Log In</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    padding: 24,
    paddingTop: 60,
    paddingBottom: 40,
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
    marginBottom: 12,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111',
    backgroundColor: '#fafafa',
  },
  multilineInput: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  phonePrefix: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
    marginRight: 8,
    paddingVertical: 12,
  },
  phoneInput: {
    flex: 1,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 13,
    marginTop: 4,
  },
  apiErrorContainer: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  apiErrorText: {
    color: '#dc2626',
    fontSize: 14,
  },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  linkContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
  },
  linkText: {
    fontSize: 14,
    color: '#666',
  },
  linkAction: {
    fontSize: 14,
    color: '#2563eb',
    fontWeight: '600',
  },
});
