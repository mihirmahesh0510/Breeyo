import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { useAuth } from '../../../providers/AuthProvider';
import { apiClient } from '../../../lib/api';
import type { AddendumEntry } from '@breeyo/types';

interface AddendumSectionProps {
  consultationId: string;
  addenda: AddendumEntry[];
  onAddendumAdded?: (entry: AddendumEntry) => void;
}

function formatAddendumDate(dateStr: Date | string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${months[d.getMonth()]} ${d.getFullYear()} ${hours}:${minutes}`;
}

export function AddendumSection({
  consultationId,
  addenda,
  onAddendumAdded,
}: AddendumSectionProps) {
  const { accessToken, user } = useAuth();
  const [isAdding, setIsAdding] = useState(false);
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOpenForm = useCallback(() => {
    setIsAdding(true);
  }, []);

  const handleCancel = useCallback(() => {
    setIsAdding(false);
    setText('');
  }, []);

  const handleSave = useCallback(async () => {
    if (!text.trim() || !accessToken) return;

    setIsSubmitting(true);
    try {
      const response = await apiClient<{ data: AddendumEntry }>(
        `/api/v1/consultations/${consultationId}/addendum`,
        {
          method: 'POST',
          token: accessToken,
          body: JSON.stringify({ text: text.trim() }),
        },
      );

      onAddendumAdded?.(response.data);
      setIsAdding(false);
      setText('');
      Alert.alert('Success', 'Addendum added to consultation record');
    } catch {
      Alert.alert('Error', 'Failed to save addendum. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [text, accessToken, consultationId, onAddendumAdded]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Addenda</Text>

      {/* Existing addenda */}
      {addenda.length > 0 ? (
        addenda.map((entry) => (
          <View key={entry.id} style={styles.addendumItem}>
            <Text style={styles.addendumText}>{entry.text}</Text>
            <Text style={styles.addendumMeta}>
              Added by {entry.addedByName} on {formatAddendumDate(entry.addedAt)}
            </Text>
          </View>
        ))
      ) : !isAdding ? (
        <Text style={styles.emptyText}>No addenda recorded.</Text>
      ) : null}

      {/* Add Addendum Form */}
      {isAdding ? (
        <View style={styles.formContainer}>
          <TextInput
            style={styles.textArea}
            value={text}
            onChangeText={setText}
            placeholder="Additional notes to the finalized record..."
            placeholderTextColor="#79747E"
            multiline
            textAlignVertical="top"
            autoFocus
            accessibilityLabel="Addendum text input"
          />
          <View style={styles.formActions}>
            <Pressable
              style={styles.cancelButton}
              onPress={handleCancel}
              disabled={isSubmitting}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[
                styles.saveButton,
                (!text.trim() || isSubmitting) && styles.saveButtonDisabled,
              ]}
              onPress={handleSave}
              disabled={!text.trim() || isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.saveButtonText}>Save Addendum</Text>
              )}
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable style={styles.addButton} onPress={handleOpenForm}>
          <Text style={styles.addButtonText}>Add Addendum</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginVertical: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E7E0EC',
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1B1F',
    marginBottom: 8,
  },
  addendumItem: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E7E0EC',
  },
  addendumText: {
    fontSize: 14,
    color: '#1C1B1F',
    lineHeight: 20,
  },
  addendumMeta: {
    fontSize: 12,
    color: '#79747E',
    marginTop: 4,
    fontStyle: 'italic',
  },
  emptyText: {
    fontSize: 13,
    color: '#79747E',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  formContainer: {
    marginTop: 8,
  },
  textArea: {
    borderWidth: 1,
    borderColor: '#CAC4D0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 14,
    color: '#1C1B1F',
    minHeight: 80,
    backgroundColor: '#FFFBF5',
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 12,
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  cancelButtonText: {
    fontSize: 14,
    color: '#49454F',
    fontWeight: '500',
  },
  saveButton: {
    backgroundColor: '#2E7D32',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    minWidth: 120,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  addButton: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#2E7D32',
    borderRadius: 20,
    paddingVertical: 10,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#2E7D32',
    fontSize: 14,
    fontWeight: '500',
  },
});
