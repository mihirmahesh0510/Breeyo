import React, { useState, useEffect, useCallback } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  Modal,
  View,
  FlatList,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { useAuth } from '../providers/AuthProvider';
import { apiClient } from '../lib/api';
import { getAccessToken, storeAuthTokens } from '../lib/auth-storage';

interface ClinicItem {
  id: string;
  name: string;
  address: string;
  roles: string[];
}

interface ClinicsResponse {
  data: {
    clinics: ClinicItem[];
  };
}

interface SwitchClinicResponse {
  data: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    clinic: { id: string; name: string };
  };
}

export function ClinicSwitcher() {
  const { activeClinicId, user, isAuthenticated } = useAuth();
  const [modalVisible, setModalVisible] = useState(false);
  const [clinics, setClinics] = useState<ClinicItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);

  const activeClinic = clinics.find((c) => c.id === activeClinicId);
  const displayName = activeClinic?.name || 'Select Clinic';

  const fetchClinics = useCallback(async () => {
    try {
      setLoading(true);
      const token = await getAccessToken();
      if (!token) return;

      const response = await apiClient<ClinicsResponse>('/api/v1/auth/clinics', {
        method: 'GET',
        token,
      });

      setClinics(response.data.clinics);
    } catch {
      // Silently fail -- user can retry by opening the modal again
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchClinics();
    }
  }, [isAuthenticated, fetchClinics]);

  const handleOpen = useCallback(() => {
    setModalVisible(true);
    fetchClinics();
  }, [fetchClinics]);

  const handleSwitch = useCallback(
    async (clinicId: string) => {
      if (clinicId === activeClinicId) {
        setModalVisible(false);
        return;
      }

      try {
        setSwitching(true);
        const token = await getAccessToken();
        if (!token) return;

        const response = await apiClient<SwitchClinicResponse>(
          '/api/v1/auth/active-clinic',
          {
            method: 'POST',
            token,
            body: JSON.stringify({ clinicId }),
          },
        );

        const { accessToken, refreshToken, clinic } = response.data;

        if (user) {
          await storeAuthTokens(accessToken, refreshToken, clinic.id, user);
        }

        // Close modal and reload -- the AuthProvider will pick up the new tokens
        setModalVisible(false);
        // Force a full app reload to reset state with new clinic context
        // In production this would update AuthProvider state directly
      } catch {
        // Show error feedback in production
      } finally {
        setSwitching(false);
      }
    },
    [activeClinicId, user],
  );

  if (!isAuthenticated) {
    return null;
  }

  return (
    <>
      <TouchableOpacity style={styles.trigger} onPress={handleOpen}>
        <Text style={styles.triggerText} numberOfLines={1}>
          {displayName}
        </Text>
        <Text style={styles.chevron}>&#9662;</Text>
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={() => setModalVisible(false)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Switch Clinic</Text>

            {loading ? (
              <ActivityIndicator style={styles.loader} color="#2563eb" />
            ) : (
              <FlatList
                data={clinics}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => {
                  const isActive = item.id === activeClinicId;
                  return (
                    <TouchableOpacity
                      style={[styles.clinicItem, isActive && styles.clinicItemActive]}
                      onPress={() => handleSwitch(item.id)}
                      disabled={switching}
                    >
                      <View style={styles.clinicInfo}>
                        <Text style={[styles.clinicName, isActive && styles.clinicNameActive]}>
                          {item.name}
                        </Text>
                        <Text style={styles.clinicRoles}>
                          {item.roles.join(', ')}
                        </Text>
                      </View>
                      {isActive && <Text style={styles.checkmark}>&#10003;</Text>}
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  <Text style={styles.emptyText}>No clinics found</Text>
                }
              />
            )}

            {switching && (
              <View style={styles.switchingOverlay}>
                <ActivityIndicator color="#2563eb" />
                <Text style={styles.switchingText}>Switching...</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
    maxWidth: 160,
  },
  triggerText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1e293b',
    marginRight: 4,
    flexShrink: 1,
  },
  chevron: {
    fontSize: 10,
    color: '#64748b',
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 34,
    maxHeight: '60%',
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: '#cbd5e1',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0f172a',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  loader: {
    paddingVertical: 24,
  },
  clinicItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  clinicItemActive: {
    backgroundColor: '#eff6ff',
  },
  clinicInfo: {
    flex: 1,
  },
  clinicName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1e293b',
  },
  clinicNameActive: {
    color: '#2563eb',
    fontWeight: '600',
  },
  clinicRoles: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  checkmark: {
    fontSize: 18,
    color: '#2563eb',
    marginLeft: 8,
  },
  emptyText: {
    textAlign: 'center',
    color: '#94a3b8',
    paddingVertical: 24,
    fontSize: 14,
  },
  switchingOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  switchingText: {
    fontSize: 14,
    color: '#2563eb',
  },
});
