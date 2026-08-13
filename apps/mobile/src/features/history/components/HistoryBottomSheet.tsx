import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  FlatList,
  Animated,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { useAuth } from '../../../providers/AuthProvider';
import { apiClient } from '../../../lib/api';
import { HistoryItem } from './HistoryItem';
import type { ConsultationSummary } from '@breeyo/types';

interface HistoryBottomSheetProps {
  visible: boolean;
  petId: string;
  petName: string;
  onClose: () => void;
  onRepeatRx?: (consultationId: string) => void;
  onViewConsultation?: (consultationId: string) => void;
}

interface HistoryResponse {
  data: ConsultationSummary[];
}

function SkeletonRow() {
  return (
    <View style={skeletonStyles.row}>
      <View style={skeletonStyles.datePlaceholder} />
      <View style={skeletonStyles.badgePlaceholder} />
      <View style={skeletonStyles.textPlaceholder} />
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  datePlaceholder: {
    width: 80,
    height: 14,
    backgroundColor: '#E7E0EC',
    borderRadius: 4,
  },
  badgePlaceholder: {
    width: 60,
    height: 20,
    backgroundColor: '#E7E0EC',
    borderRadius: 10,
  },
  textPlaceholder: {
    flex: 1,
    height: 14,
    backgroundColor: '#E7E0EC',
    borderRadius: 4,
  },
});

export function HistoryBottomSheet({
  visible,
  petId,
  petName,
  onClose,
  onRepeatRx,
  onViewConsultation,
}: HistoryBottomSheetProps) {
  const { accessToken } = useAuth();
  const [history, setHistory] = useState<ConsultationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slideAnim = React.useRef(
    new Animated.Value(Dimensions.get('window').height),
  ).current;

  const fetchHistory = useCallback(async () => {
    if (!petId || !accessToken) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient<HistoryResponse>(
        `/api/v1/pets/${petId}/history`,
        { token: accessToken },
      );
      setHistory(response.data);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load history';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [petId, accessToken]);

  useEffect(() => {
    if (visible) {
      fetchHistory();
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 150,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: Dimensions.get('window').height,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, fetchHistory, slideAnim]);

  const renderItem = useCallback(
    ({ item }: { item: ConsultationSummary }) => (
      <HistoryItem
        consultation={item}
        onRepeatRx={onRepeatRx}
        onPress={onViewConsultation}
      />
    ),
    [onRepeatRx, onViewConsultation],
  );

  const renderEmpty = () => {
    if (isLoading) return null;
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>
          No previous visits for {petName}.
        </Text>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Animated.View
          style={[
            styles.sheet,
            { transform: [{ translateY: slideAnim }] },
          ]}
          onStartShouldSetResponder={() => true}
        >
          <View style={styles.handle} />

          <View style={styles.header}>
            <Text style={styles.title}>Medical History</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </View>

          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={fetchHistory}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : isLoading ? (
            <View>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </View>
          ) : (
            <FlatList
              data={history}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              ListEmptyComponent={renderEmpty}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          )}
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFBF5',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '75%',
    minHeight: 300,
    paddingTop: 8,
    paddingBottom: 32,
  },
  handle: {
    width: 32,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CAC4D0',
    alignSelf: 'center',
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E7E0EC',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1B1F',
  },
  closeText: {
    fontSize: 14,
    color: '#2E7D32',
    fontWeight: '500',
  },
  listContent: {
    flexGrow: 1,
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#79747E',
  },
  errorContainer: {
    paddingVertical: 24,
    alignItems: 'center',
    gap: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#B3261E',
  },
  retryText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2E7D32',
  },
});
