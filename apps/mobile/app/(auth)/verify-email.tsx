import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { apiClient, ApiClientError } from '../../src/lib/api';

const RESEND_COOLDOWN_SECONDS = 60;

export default function VerifyEmailScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email: string }>();

  const [isResending, setIsResending] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

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

  async function handleResend() {
    setError(null);
    setSuccessMessage(null);
    setIsResending(true);

    try {
      await apiClient('/api/v1/auth/verify-email/resend', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setSuccessMessage('Email sent!');
      startCooldown();
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 429) {
        setError('Too many attempts \u2014 try again later');
      } else if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Unable to resend email. Please try again.');
      }
    } finally {
      setIsResending(false);
    }
  }

  function handleBackToLogin() {
    router.replace('/(auth)/login');
  }

  const isResendDisabled = isResending || cooldownSeconds > 0;

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.icon}>{'\u2709\uFE0F'}</Text>

        <Text style={styles.title}>Check your email</Text>

        <Text style={styles.message}>
          We have sent a verification link to{' '}
          <Text style={styles.emailHighlight}>{email}</Text>
        </Text>

        {successMessage && (
          <View style={styles.successContainer}>
            <Text style={styles.successText}>{successMessage}</Text>
          </View>
        )}

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.resendButton, isResendDisabled && styles.buttonDisabled]}
          onPress={handleResend}
          disabled={isResendDisabled}
        >
          {isResending ? (
            <ActivityIndicator color="#2563eb" />
          ) : cooldownSeconds > 0 ? (
            <Text style={styles.resendButtonText}>
              Resend in {cooldownSeconds}s
            </Text>
          ) : (
            <Text style={styles.resendButtonText}>Resend verification email</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.backLink} onPress={handleBackToLogin}>
          <Text style={styles.backLinkText}>Back to Login</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 24,
    paddingTop: 100,
    alignItems: 'center',
  },
  icon: {
    fontSize: 64,
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  emailHighlight: {
    fontWeight: '600',
    color: '#111',
  },
  successContainer: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    width: '100%',
  },
  successText: {
    color: '#16a34a',
    fontSize: 14,
    textAlign: 'center',
  },
  errorContainer: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    width: '100%',
  },
  errorText: {
    color: '#dc2626',
    fontSize: 14,
    textAlign: 'center',
  },
  resendButton: {
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    width: '100%',
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  resendButtonText: {
    color: '#2563eb',
    fontSize: 16,
    fontWeight: '600',
  },
  backLink: {
    marginTop: 8,
  },
  backLinkText: {
    color: '#2563eb',
    fontSize: 14,
    fontWeight: '600',
  },
});
