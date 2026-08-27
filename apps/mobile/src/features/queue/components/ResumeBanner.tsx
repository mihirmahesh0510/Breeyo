import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '@breeyo/ui';
import { useAuth } from '../../../providers/AuthProvider';
import { apiClient } from '../../../lib/api';
import { navigateToConsultation } from '../../../navigation/consultation-navigator';

interface DraftConsultation {
  id: string;
  petId: string;
  petName: string;
  queueEntryId: string | null;
  isOrphaned: boolean;
}

interface DraftResponse {
  data: DraftConsultation[];
}

export function ResumeBanner() {
  const router = useRouter();
  const { accessToken, user } = useAuth();
  const [draft, setDraft] = useState<DraftConsultation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDiscarding, setIsDiscarding] = useState(false);

  const fetchDrafts = useCallback(async () => {
    if (!accessToken) {
      setIsLoading(false);
      return;
    }

    try {
      const response = await apiClient<DraftResponse>(
        '/api/v1/consultations?status=draft&vetId=me',
        { token: accessToken },
      );

      // Take the first draft (most recent)
      if (response.data && response.data.length > 0) {
        setDraft(response.data[0]!);
      } else {
        setDraft(null);
      }
    } catch {
      // Silently fail -- banner is non-critical
      setDraft(null);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    fetchDrafts();
  }, [fetchDrafts]);

  const handleResume = useCallback(() => {
    if (!draft) return;

    navigateToConsultation(router, {
      consultationId: draft.id,
      petId: draft.petId,
      queueEntryId: draft.queueEntryId || undefined,
    });
  }, [draft, router]);

  const handleDiscard = useCallback(() => {
    if (!draft || !accessToken) return;

    Alert.alert(
      'Discard Draft?',
      'Are you sure you want to discard this consultation draft? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: async () => {
            setIsDiscarding(true);
            try {
              await apiClient(
                `/api/v1/consultations/${draft.id}/draft`,
                { method: 'DELETE', token: accessToken },
              );
              setDraft(null);
            } catch {
              Alert.alert('Error', 'Failed to discard draft. Please try again.');
            } finally {
              setIsDiscarding(false);
            }
          },
        },
      ],
    );
  }, [draft, accessToken]);

  // Don't render if loading, no draft, or discarding
  if (isLoading || !draft) return null;

  const isOrphaned = draft.isOrphaned;

  if (isOrphaned) {
    // Orphaned draft: queue entry archived/missing (D-66)
    return (
      <View style={styles.orphanedContainer}>
        <Text style={styles.orphanedText}>
          You have an unfinished consultation for {draft.petName}.
        </Text>
        <View style={styles.orphanedActions}>
          <Pressable
            style={styles.resumeButtonSmall}
            onPress={handleResume}
            disabled={isDiscarding}
          >
            <Text style={styles.resumeButtonSmallText}>Resume</Text>
          </Pressable>
          <Pressable
            style={styles.discardButton}
            onPress={handleDiscard}
            disabled={isDiscarding}
          >
            {isDiscarding ? (
              <ActivityIndicator size="small" color="#B3261E" />
            ) : (
              <Text style={styles.discardButtonText}>Discard</Text>
            )}
          </Pressable>
        </View>
      </View>
    );
  }

  // Active draft with queue entry still in IN_CONSULT
  return (
    <Pressable style={styles.container} onPress={handleResume}>
      <Text style={styles.text}>
        {draft.petName} has a consultation in progress.{' '}
        <Text style={styles.tapText}>Tap to resume.</Text>
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.primaryContainer,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 12,
  },
  text: {
    fontSize: 14,
    color: colors.onPrimaryContainer,
    lineHeight: 20,
  },
  tapText: {
    fontWeight: '600',
  },
  orphanedContainer: {
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 12,
  },
  orphanedText: {
    fontSize: 14,
    color: colors.warning,
    lineHeight: 20,
    marginBottom: 8,
  },
  orphanedActions: {
    flexDirection: 'row',
    gap: 12,
  },
  resumeButtonSmall: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  resumeButtonSmallText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  discardButton: {
    borderWidth: 1,
    borderColor: '#B3261E',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    minWidth: 70,
    alignItems: 'center',
  },
  discardButtonText: {
    color: '#B3261E',
    fontSize: 13,
    fontWeight: '600',
  },
});
