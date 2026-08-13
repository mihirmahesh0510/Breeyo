import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useAuth } from '../../../providers/AuthProvider';
import { apiClient } from '../../../lib/api';
import type { PreventiveCareStatus, PreventiveCareStatusLevel } from '@breeyo/types';

interface PreventiveCareCardProps {
  petId: string;
  onViewVaccinations?: () => void;
  onViewDeworming?: () => void;
}

interface PreventiveCareResponse {
  data: PreventiveCareStatus;
}

const STATUS_COLORS: Record<
  PreventiveCareStatusLevel,
  { bg: string; text: string; label: string }
> = {
  upToDate: { bg: '#E8F5E9', text: '#2E7D32', label: 'Up to date' },
  dueSoon: { bg: '#FFF3E0', text: '#E65100', label: 'Due soon' },
  overdue: { bg: '#FFDAD6', text: '#B3261E', label: 'Overdue' },
};

function formatDate(date: Date | null): string {
  if (!date) return 'Not scheduled';
  const d = new Date(date);
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function StatusBadge({ level }: { level: PreventiveCareStatusLevel }) {
  const colors = STATUS_COLORS[level];
  return (
    <View style={[styles.statusBadge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.statusBadgeText, { color: colors.text }]}>
        {colors.label}
      </Text>
    </View>
  );
}

export function PreventiveCareCard({
  petId,
  onViewVaccinations,
  onViewDeworming,
}: PreventiveCareCardProps) {
  const { accessToken } = useAuth();
  const [status, setStatus] = useState<PreventiveCareStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!petId || !accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient<PreventiveCareResponse>(
        `/api/v1/pets/${petId}/preventive-care`,
        { token: accessToken },
      );
      setStatus(response.data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load preventive care status';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [petId, accessToken]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Preventive Care</Text>
        <View style={styles.skeletonRow}>
          <View style={styles.skeletonBlock} />
          <View style={styles.skeletonBadge} />
        </View>
        <View style={styles.skeletonRow}>
          <View style={styles.skeletonBlock} />
          <View style={styles.skeletonBadge} />
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Preventive Care</Text>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity onPress={fetchStatus}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!status) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Preventive Care</Text>
        <Text style={styles.emptyText}>
          No vaccination or deworming records yet.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Preventive Care</Text>

      {/* Vaccination Row */}
      <TouchableOpacity
        style={styles.statusRow}
        onPress={onViewVaccinations}
        activeOpacity={onViewVaccinations ? 0.7 : 1}
      >
        <View style={styles.statusLeft}>
          <Text style={styles.statusLabel}>Vaccination</Text>
          <Text style={styles.nextDueText}>
            Next due: {formatDate(status.vaccinationNextDue)}
          </Text>
          {status.vaccinationOverdueItems.length > 0 ? (
            <Text style={styles.overdueItems}>
              Overdue: {status.vaccinationOverdueItems.join(', ')}
            </Text>
          ) : null}
        </View>
        <StatusBadge level={status.vaccinationStatus} />
      </TouchableOpacity>

      {/* Deworming Row */}
      <TouchableOpacity
        style={[styles.statusRow, styles.lastRow]}
        onPress={onViewDeworming}
        activeOpacity={onViewDeworming ? 0.7 : 1}
      >
        <View style={styles.statusLeft}>
          <Text style={styles.statusLabel}>Deworming</Text>
          <Text style={styles.nextDueText}>
            Next due: {formatDate(status.dewormingNextDue)}
          </Text>
        </View>
        <StatusBadge level={status.dewormingStatus} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFBF5',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E7E0EC',
    marginHorizontal: 16,
    marginVertical: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1B1F',
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E7E0EC',
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  statusLeft: {
    flex: 1,
    marginRight: 8,
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1C1B1F',
  },
  nextDueText: {
    fontSize: 12,
    color: '#79747E',
    marginTop: 2,
  },
  overdueItems: {
    fontSize: 12,
    color: '#B3261E',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  emptyText: {
    fontSize: 14,
    color: '#79747E',
    textAlign: 'center',
    paddingVertical: 12,
  },
  errorText: {
    fontSize: 14,
    color: '#B3261E',
    textAlign: 'center',
  },
  retryText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2E7D32',
    textAlign: 'center',
    marginTop: 4,
  },
  skeletonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  skeletonBlock: {
    width: 120,
    height: 14,
    backgroundColor: '#E7E0EC',
    borderRadius: 4,
  },
  skeletonBadge: {
    width: 80,
    height: 24,
    backgroundColor: '#E7E0EC',
    borderRadius: 12,
  },
});
