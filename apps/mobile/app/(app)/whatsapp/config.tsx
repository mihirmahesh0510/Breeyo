import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../../src/lib/api';
import { useAuth } from '../../../src/providers/AuthProvider';
import { canAccessWhatsAppConfig } from '../../../src/features/whatsapp/utils/whatsapp-access';
import { WhatsAppConfigScreen } from '../../../src/features/whatsapp/screens/WhatsAppConfigScreen';

/**
 * WHA-05 / D-20: the Config route is gated with `canAccessWhatsAppConfig`
 * (Admin only) -- stricter than `WhatsAppAccessGate.tsx`'s Front Desk +
 * Admin gate on the Inbox/Thread routes. This is a client USABILITY gate;
 * the server independently enforces `MANAGE_CLINIC_SETTINGS` on the config
 * endpoints regardless of what this check returns.
 *
 * Mirrors `WhatsAppAccessGate.tsx`'s `useWhatsAppScreenAccess` shape exactly
 * (same `GET /api/v1/auth/clinics` read, same role-membership lookup) but is
 * not a re-export of it -- that hook is hardwired to `canAccessWhatsAppScreens`
 * and widening it into a parameterized gate is out of this plan's file
 * scope (`WhatsAppAccessGate.tsx` is not in `files_modified`).
 */
interface ClinicMembershipItem {
  id: string;
  name: string;
  address: string;
  roles: string[];
}

interface ClinicsResponse {
  data: { clinics: ClinicMembershipItem[] };
}

const REFUSAL_TITLE = 'Admin access required';
const REFUSAL_BODY = 'Only Admin staff can open WhatsApp simulator settings.';

function useWhatsAppConfigAccess() {
  const { accessToken, activeClinicId } = useAuth();

  const query = useQuery({
    queryKey: ['auth', 'clinics', activeClinicId],
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
  // granted if ANY held role passes `canAccessWhatsAppConfig` (Admin only).
  const canAccess = roles.some((role) => canAccessWhatsAppConfig(role));

  return { ...query, roles, canAccess };
}

export default function WhatsAppConfigRoute() {
  const { canAccess, isLoading } = useWhatsAppConfigAccess();

  if (isLoading) {
    return (
      <View style={styles.center} testID="whatsapp-config-gate-loading">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!canAccess) {
    return (
      <View style={styles.center} testID="whatsapp-config-gate-refused">
        <Text variant="titleMedium" style={styles.title}>
          {REFUSAL_TITLE}
        </Text>
        <Text variant="bodyMedium" style={styles.body}>
          {REFUSAL_BODY}
        </Text>
      </View>
    );
  }

  return <WhatsAppConfigScreen />;
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
