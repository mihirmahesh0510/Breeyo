import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';
import { canAccessWhatsAppScreens } from '../utils/whatsapp-access';

/**
 * WHA-05 / D-20: `WhatsAppAccessGate` wraps both the Inbox and Thread route
 * files so a direct route entry is refused exactly like the nav entry is
 * hidden -- this is a usability gate, not a security boundary (the API
 * independently enforces `SEND_WHATSAPP`/`MANAGE_CLINIC_SETTINGS`).
 *
 * `useAuth()`'s `StoredUserSummary` carries only `{ id, email, fullName }` --
 * it has never carried roles (see `useBillingSettingsPermission` in
 * `useBillingSettings.ts`, the established precedent for this exact gap).
 * `GET /api/v1/auth/clinics` (already used by `ClinicSwitcher.tsx`) is the
 * one endpoint that returns this user's role names for the ACTIVE clinic
 * membership, so this hook reads that response rather than inventing a new
 * endpoint or touching `AuthProvider.tsx` (out of this plan's file scope).
 */
interface ClinicMembershipItem {
  id: string;
  name: string;
  address: string;
  roles: string[];
}

interface ClinicsResponse {
  data: {
    clinics: ClinicMembershipItem[];
  };
}

const CLINICS_QUERY_KEY = ['auth', 'clinics'] as const;

export function useWhatsAppScreenAccess() {
  const { accessToken, activeClinicId } = useAuth();

  const query = useQuery({
    queryKey: [...CLINICS_QUERY_KEY, activeClinicId],
    queryFn: () => apiClient<ClinicsResponse>('/api/v1/auth/clinics', { token: accessToken! }),
    enabled: !!accessToken && !!activeClinicId,
    staleTime: 5 * 60_000,
    select: (response) => {
      const membership = response.data.clinics.find((c) => c.id === activeClinicId);
      return membership?.roles ?? [];
    },
  });

  const roles = query.data ?? [];
  // A user can hold more than one role on a clinic membership -- access is
  // granted if ANY held role passes the (single-role) predicate.
  const canAccess = roles.some((role) => canAccessWhatsAppScreens(role));

  return {
    ...query,
    roles,
    /** False while loading, so the screen is never shown before the check resolves. */
    canAccess,
  };
}

const REFUSAL_TITLE = 'Front Desk or Admin access required';
const REFUSAL_BODY = 'Only Front Desk and Admin staff can open WhatsApp messages.';

export function WhatsAppAccessGate({ children }: { children: React.ReactNode }) {
  const { canAccess, isLoading } = useWhatsAppScreenAccess();

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!canAccess) {
    return (
      <View style={styles.center}>
        <Text variant="titleMedium" style={styles.title}>
          {REFUSAL_TITLE}
        </Text>
        <Text variant="bodyMedium" style={styles.body}>
          {REFUSAL_BODY}
        </Text>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    backgroundColor: '#FFFBF5',
    gap: 8,
  },
  title: {
    textAlign: 'center',
    color: '#1C1B1F',
  },
  body: {
    textAlign: 'center',
    color: '#49454F',
  },
});
