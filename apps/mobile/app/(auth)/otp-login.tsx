import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter, Link } from 'expo-router';
import { otpRequestSchema } from '@breeyo/validators';
import { apiClient, ApiClientError } from '../../src/lib/api';
import { useAuth } from '../../src/providers/AuthProvider';

const RESEND_COOLDOWN_SECONDS = 60;

export default function OtpLoginScreen() {
  const router = useRouter();
  const { otpLogin } = useAuth();

  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const otpInputRef = useRef<TextInput>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  function startCooldown() {
    setCooldownSeconds(RESEND_COOLDOWN_SECONDS);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCooldownSeconds((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function getFullPhone(): string {
    const digits = phone.replace(/\D/g, '');
    return `+91${digits}`;
  }

  async function handleSendOtp() {
    setError(null);

    const fullPhone = getFullPhone();
    const parsed = otpRequestSchema.safeParse({ phone: fullPhone });
    if (!parsed.success) {
      setError('Enter a valid 10-digit phone number');
      return;
    }

    setIsSending(true);
    try {
      await apiClient('/api/v1/auth/otp/request', {
        method: 'POST',
        body: JSON.stringify({ phone: fullPhone }),
      });
      setOtpSent(true);
      startCooldown();
      setTimeout(() => otpInputRef.current?.focus(), 100);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Unable to send OTP. Please try again.');
      }
    } finally {
      setIsSending(false);
    }
  }

  async function handleVerifyOtp() {
    setError(null);

    if (otp.length !== 6 || !/^\d{6}$/.test(otp)) {
      setError('Enter a valid 6-digit OTP');
      return;
    }

    setIsVerifying(true);
    try {
      const result = await otpLogin(getFullPhone(), otp);

      if (result.success) {
        router.replace('/(app)');
        return;
      }

      if (result.code === 'CLINIC_SELECTION_REQUIRED' && result.clinics) {
        router.push({
          pathname: '/select-clinic',
          params: {
            clinics: JSON.stringify(result.clinics),
            phone: getFullPhone(),
            otp,
          },
        });
        return;
      }

      setError(result.message);
    } finally {
      setIsVerifying(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Log in with OTP</Text>
        <Text style={styles.subtitle}>
          We will send a one-time password to your phone number
        </Text>

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

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
              editable={!otpSent}
            />
          </View>
        </View>

        {!otpSent ? (
          <TouchableOpacity
            style={[styles.button, isSending && styles.buttonDisabled]}
            onPress={handleSendOtp}
            disabled={isSending}
          >
            {isSending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Send OTP</Text>
            )}
          </TouchableOpacity>
        ) : (
          <>
            <View style={styles.field}>
              <Text style={styles.label}>Enter OTP</Text>
              <TextInput
                ref={otpInputRef}
                style={[styles.input, styles.otpInput]}
                value={otp}
                onChangeText={(text) => setOtp(text.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
              />
            </View>

            <TouchableOpacity
              style={[styles.button, isVerifying && styles.buttonDisabled]}
              onPress={handleVerifyOtp}
              disabled={isVerifying}
            >
              {isVerifying ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Verify</Text>
              )}
            </TouchableOpacity>

            <View style={styles.resendRow}>
              {cooldownSeconds > 0 ? (
                <Text style={styles.cooldownText}>
                  Resend OTP in {cooldownSeconds}s
                </Text>
              ) : (
                <TouchableOpacity onPress={handleSendOtp} disabled={isSending}>
                  <Text style={styles.resendText}>Resend OTP</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={() => {
                  setOtpSent(false);
                  setOtp('');
                  setError(null);
                }}
              >
                <Text style={styles.changeNumberText}>Change number</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        <View style={styles.linkContainer}>
          <Text style={styles.linkText}>Prefer email login? </Text>
          <Link href="/(auth)/login" asChild>
            <TouchableOpacity>
              <Text style={styles.linkAction}>Log In with Email</Text>
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
    marginBottom: 32,
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
  otpInput: {
    textAlign: 'center',
    fontSize: 24,
    letterSpacing: 8,
    fontWeight: '600',
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
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
  },
  cooldownText: {
    fontSize: 14,
    color: '#999',
  },
  resendText: {
    fontSize: 14,
    color: '#2563eb',
    fontWeight: '500',
  },
  changeNumberText: {
    fontSize: 14,
    color: '#666',
    textDecorationLine: 'underline',
  },
  linkContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 32,
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
