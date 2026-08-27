import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors } from '@breeyo/ui';
import type { ConsultationSummary, VisitType } from '@breeyo/types';

interface HistoryItemProps {
  consultation: ConsultationSummary;
  onRepeatRx?: (consultationId: string) => void;
  onPress?: (consultationId: string) => void;
}

const VISIT_TYPE_COLORS: Record<VisitType, { bg: string; text: string }> = {
  general: { bg: '#E8F5E9', text: colors.primary },
  surgery: { bg: '#FFF3E0', text: colors.tertiary },
  vaccination: { bg: '#E3F2FD', text: '#1565C0' },
};

function formatDate(date: Date): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDuration(minutes: number | null): string {
  if (!minutes) return '';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export function HistoryItem({
  consultation,
  onRepeatRx,
  onPress,
}: HistoryItemProps) {
  const [expanded, setExpanded] = useState(false);

  const visitColors =
    VISIT_TYPE_COLORS[consultation.visitType] || VISIT_TYPE_COLORS.general;

  const handlePress = () => {
    if (onPress) {
      onPress(consultation.id);
    } else {
      setExpanded(!expanded);
    }
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      {/* Main Row - 56px height */}
      <View style={styles.mainRow}>
        <View style={styles.leftContent}>
          <View style={styles.topRow}>
            <Text style={styles.dateText}>
              {formatDate(consultation.startedAt)}
            </Text>
            <View style={[styles.badge, { backgroundColor: visitColors.bg }]}>
              <Text style={[styles.badgeText, { color: visitColors.text }]}>
                {consultation.visitType}
              </Text>
            </View>
          </View>
          {consultation.assessment ? (
            <Text style={styles.assessmentText} numberOfLines={1}>
              {consultation.assessment}
            </Text>
          ) : (
            <Text style={styles.noAssessmentText}>No assessment recorded</Text>
          )}
        </View>

        {/* Repeat Rx Button */}
        {consultation.prescriptionCount > 0 ? (
          <TouchableOpacity
            style={styles.repeatRxButton}
            onPress={() => onRepeatRx?.(consultation.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.repeatRxText}>Repeat Rx</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Sub Row */}
      <View style={styles.subRow}>
        <Text style={styles.vetName}>{consultation.vetName}</Text>
        {consultation.durationMinutes ? (
          <Text style={styles.duration}>
            {formatDuration(consultation.durationMinutes)}
          </Text>
        ) : null}
        {consultation.attachmentCount > 0 ? (
          <Text style={styles.attachmentCount}>
            {consultation.attachmentCount} file{consultation.attachmentCount > 1 ? 's' : ''}
          </Text>
        ) : null}
      </View>

      {/* Expanded Detail */}
      {expanded ? (
        <View style={styles.expandedSection}>
          <Text style={styles.expandedLabel}>Status</Text>
          <Text style={styles.expandedValue}>{consultation.status}</Text>
          {consultation.prescriptionCount > 0 ? (
            <>
              <Text style={styles.expandedLabel}>Prescriptions</Text>
              <Text style={styles.expandedValue}>
                {consultation.prescriptionCount} item{consultation.prescriptionCount > 1 ? 's' : ''}
              </Text>
            </>
          ) : null}
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E7E0EC',
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
  },
  leftContent: {
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#49454F',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  assessmentText: {
    fontSize: 14,
    color: '#1C1B1F',
    marginTop: 2,
  },
  noAssessmentText: {
    fontSize: 14,
    color: '#79747E',
    fontStyle: 'italic',
    marginTop: 2,
  },
  repeatRxButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.primary,
    marginLeft: 8,
  },
  repeatRxText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 12,
  },
  vetName: {
    fontSize: 12,
    color: '#79747E',
  },
  duration: {
    fontSize: 12,
    color: '#79747E',
  },
  attachmentCount: {
    fontSize: 12,
    color: '#79747E',
  },
  expandedSection: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E7E0EC',
  },
  expandedLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#79747E',
    marginTop: 4,
  },
  expandedValue: {
    fontSize: 13,
    color: '#1C1B1F',
    marginTop: 1,
  },
});
