import React, { useState } from 'react';
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
import { useRouter, useLocalSearchParams, Link } from 'expo-router';
import { apiClient, ApiClientError } from '../../src/lib/api';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token?: string }>();

  // "Request reset" form state
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);

  // "Set new password" form state (when launched via deep link with token)
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordReset, setPasswordReset] = useState(false);

  async function handleSendResetLink() {
    setError(null);

    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Please enter a valid email address');
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient('/api/v1/auth/password-reset/request', {
        method: 'POST',
        body: JSON.stringify({ email: trimmed }),
      });
      setEmailSent(true);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Unable to send reset link. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResetPassword() {
    setError(null);

    if (!newPassword || newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient('/api/v1/auth/password-reset/confirm', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword }),
      });
      setPasswordReset(true);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Unable to reset password. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  // Password successfully reset via deep link
  if (passwordReset) {
    return (
      <View style={styles.container}>
        <View style={styles.successContent}>
          <Text style={styles.title}>Password Reset</Text>
          <Text style={styles.successMessage}>
            Your password has been reset successfully. You can now log in with your new password.
          </Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => router.replace('/(auth)/login')}
          >
            <Text style={styles.buttonText}>Go to Login</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Deep link flow: token is present, show "set new password" form
  if (token) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Set New Password</Text>
          <Text style={styles.subtitle}>
            Enter your new password below.
          </Text>

          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={styles.field}>
            <Text style={styles.label}>New Password</Text>
            <TextInput
              style={styles.input}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="Minimum 8 characters"
              secureTextEntry
              autoComplete="new-password"
              autoFocus
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Confirm Password</Text>
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Re-enter your password"
              secureTextEntry
              autoComplete="new-password"
            />
          </View>

          <TouchableOpacity
            style={[styles.button, isSubmitting && styles.buttonDisabled]}
            onPress={handleResetPassword}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Reset Password</Text>
            )}
          </TouchableOpacity>

          <View style={styles.linkContainer}>
            <Link href="/(auth)/login" asChild>
              <TouchableOpacity>
                <Text style={styles.linkAction}>Back to Login</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // Email sent confirmation
  if (emailSent) {
    return (
      <View style={styles.container}>
        <View style={styles.successContent}>
          <Text style={styles.title}>Check Your Email</Text>
          <Text style={styles.successMessage}>
            We have sent a password reset link to{' '}
            <Text style={styles.emailHighlight}>{email.trim()}</Text>. Please check your inbox and
            follow the instructions to reset your password.
          </Text>
          <Text style={styles.spamNote}>
            Did not receive the email? Check your spam folder or try again.
          </Text>

          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              setEmailSent(false);
              setError(null);
            }}
          >
            <Text style={styles.retryButtonText}>Try a Different Email</Text>
          </TouchableOpacity>

          <View style={styles.linkContainer}>
            <Link href="/(auth)/login" asChild>
              <TouchableOpacity>
                <Text style={styles.linkAction}>Back to Login</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
      </View>
    );
  }

  // Default: "enter email" form
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Forgot Password</Text>
        <Text style={styles.subtitle}>
          Enter your email address and we will send you a link to reset your password.
        </Text>

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

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
            autoFocus
          />
        </View>

        <TouchableOpacity
          style={[styles.button, isSubmitting && styles.buttonDisabled]}
          onPress={handleSendResetLink}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Send Reset Link</Text>
          )}
        </TouchableOpacity>

        <View style={styles.linkContainer}>
          <Link href="/(auth)/login" asChild>
            <TouchableOpacity>
              <Text style={styles.linkAction}>Back to Login</Text>
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
  successContent: {
    padding: 24,
    paddingTop: 80,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 32,
    lineHeight: 22,
  },
  successMessage: {
    fontSize: 16,
    color: '#333',
    lineHeight: 24,
    marginBottom: 12,
  },
  emailHighlight: {
    fontWeight: '600',
    color: '#111',
  },
  spamNote: {
    fontSize: 14,
    color: '#999',
    marginBottom: 24,
  },
  field: {
    marginBottom: 20,
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
  retryButton: {
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  retryButtonText: {
    color: '#2563eb',
    fontSize: 16,
    fontWeight: '600',
  },
  linkContainer: {
    alignItems: 'center',
    marginTop: 24,
  },
  linkAction: {
    fontSize: 14,
    color: '#2563eb',
    fontWeight: '600',
  },
});
