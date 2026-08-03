import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { apiClient } from '../../src/lib/api';
import { getAccessToken } from '../../src/lib/auth-storage';
import { AVAILABLE_STAFF_ROLES, formatPhoneWithPrefix, type StaffRole } from '../../src/lib/wizard-utils';

interface InvitedStaff {
  fullName: string;
  phone: string;
  roleName: StaffRole;
}

export default function InviteStaffStep() {
  const router = useRouter();

  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [selectedRole, setSelectedRole] = useState<StaffRole>('Clinician');
  const [invitedList, setInvitedList] = useState<InvitedStaff[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const handleSendInvite = async () => {
    if (!phone.trim() || !fullName.trim()) {
      Alert.alert('Error', 'Please enter phone number and full name.');
      return;
    }

    setIsSending(true);
    setSuccessMessage('');
    try {
      const token = await getAccessToken();
      if (!token) {
        Alert.alert('Error', 'Session expired. Please log in again.');
        return;
      }

      const phoneWithPrefix = formatPhoneWithPrefix(phone);

      await apiClient('/api/v1/auth/staff/invite', {
        method: 'POST',
        token,
        body: JSON.stringify({
          phone: phoneWithPrefix,
          fullName,
          roleName: selectedRole,
        }),
      });

      const invited: InvitedStaff = {
        fullName,
        phone: phoneWithPrefix,
        roleName: selectedRole,
      };
      setInvitedList((prev) => [...prev, invited]);
      setSuccessMessage(`Invitation sent to ${fullName}`);
      setPhone('');
      setFullName('');
      setSelectedRole('Clinician');
    } catch {
      Alert.alert('Error', 'Failed to send invitation. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  const handleNext = () => {
    router.push('/setup-wizard/clinic-hours');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Invite Staff</Text>
      <Text style={styles.subtitle}>Add team members to your clinic</Text>

      <View style={styles.field}>
        <Text style={styles.label}>Phone Number</Text>
        <View style={styles.phoneRow}>
          <Text style={styles.phonePrefix}>+91</Text>
          <TextInput
            style={styles.phoneInput}
            value={phone}
            onChangeText={setPhone}
            placeholder="9876543210"
            keyboardType="phone-pad"
            testID="staff-phone-input"
          />
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Full Name</Text>
        <TextInput
          style={styles.input}
          value={fullName}
          onChangeText={setFullName}
          placeholder="Enter full name"
          testID="staff-name-input"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Role</Text>
        <View style={styles.roleRow}>
          {AVAILABLE_STAFF_ROLES.map((role) => (
            <TouchableOpacity
              key={role}
              style={[
                styles.roleChip,
                selectedRole === role && styles.roleChipActive,
              ]}
              onPress={() => setSelectedRole(role)}
              testID={`role-${role}`}
            >
              <Text
                style={[
                  styles.roleChipText,
                  selectedRole === role && styles.roleChipTextActive,
                ]}
              >
                {role}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity
        style={[styles.sendButton, isSending && styles.buttonDisabled]}
        onPress={handleSendInvite}
        disabled={isSending}
        testID="send-invite-button"
      >
        <Text style={styles.sendButtonText}>
          {isSending ? 'Sending...' : 'Send Invite'}
        </Text>
      </TouchableOpacity>

      {successMessage ? (
        <Text style={styles.successText} testID="success-message">
          {successMessage}
        </Text>
      ) : null}

      {invitedList.length > 0 && (
        <View style={styles.invitedSection}>
          <Text style={styles.invitedTitle}>Invited Staff</Text>
          {invitedList.map((staff, index) => (
            <View key={index} style={styles.invitedRow}>
              <Text style={styles.invitedName}>{staff.fullName}</Text>
              <Text style={styles.invitedRole}>{staff.roleName}</Text>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity
        style={styles.nextButton}
        onPress={handleNext}
        testID="next-button"
      >
        <Text style={styles.nextButtonText}>Next</Text>
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
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  phonePrefix: {
    fontSize: 16,
    color: '#374151',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
    backgroundColor: '#F9FAFB',
  },
  phoneInput: {
    flex: 1,
    borderWidth: 1,
    borderLeftWidth: 0,
    borderColor: '#D1D5DB',
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111827',
  },
  roleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  roleChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
  },
  roleChipActive: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  roleChipText: {
    fontSize: 14,
    color: '#6B7280',
  },
  roleChipTextActive: {
    color: '#2563EB',
    fontWeight: '600',
  },
  sendButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  successText: {
    color: '#059669',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  invitedSection: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 16,
  },
  invitedTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  invitedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  invitedName: {
    fontSize: 15,
    color: '#111827',
  },
  invitedRole: {
    fontSize: 13,
    color: '#6B7280',
  },
  nextButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
  },
  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
