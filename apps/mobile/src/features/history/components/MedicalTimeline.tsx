import React, { useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { colors } from '@breeyo/ui';
import type { ConsultationSummary, VisitType } from '@breeyo/types';

interface MedicalTimelineProps {
  consultations: ConsultationSummary[];
  onViewConsultation?: (consultationId: string) => void;
  isLoading?: boolean;
}

const VISIT_TYPE_COLORS: Record<VisitType, { bg: string; text: string; dot: string }> = {
  general: { bg: '#E8F5E9', text: colors.primary, dot: colors.primary },
  surgery: { bg: '#FFF3E0', text: colors.tertiary, dot: colors.tertiary },
  vaccination: { bg: '#E3F2FD', text: '#1565C0', dot: '#1565C0' },
};

function formatDate(date: Date): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function TimelineCard({
  consultation,
  onPress,
  isLast,
}: {
  consultation: ConsultationSummary;
  onPress?: () => void;
  isLast: boolean;
}) {
  const visitColors =
    VISIT_TYPE_COLORS[consultation.visitType] || VISIT_TYPE_COLORS.general;

  return (
    <View style={styles.itemContainer}>
      {/* Timeline Line */}
      <View style={styles.timelineColumn}>
        <View style={[styles.dot, { backgroundColor: visitColors.dot }]} />
        {!isLast ? <View style={styles.line} /> : null}
      </View>

      {/* Card */}
      <TouchableOpacity
        style={styles.card}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
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
          <Text style={styles.assessmentText} numberOfLines={2}>
            {consultation.assessment}
          </Text>
        ) : (
          <Text style={styles.noAssessmentText}>No assessment recorded</Text>
        )}

        <View style={styles.cardFooter}>
          <Text style={styles.vetText}>{consultation.vetName}</Text>
          {consultation.prescriptionCount > 0 ? (
            <Text style={styles.rxCount}>
              {consultation.prescriptionCount} Rx
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
    </View>
  );
}

function SkeletonCard() {
  return (
    <View style={styles.itemContainer}>
      <View style={styles.timelineColumn}>
        <View style={[styles.dot, { backgroundColor: '#E7E0EC' }]} />
        <View style={styles.line} />
      </View>
      <View style={[styles.card, { opacity: 0.5 }]}>
        <View style={{ width: 100, height: 14, backgroundColor: '#E7E0EC', borderRadius: 4 }} />
        <View style={{ width: '80%', height: 14, backgroundColor: '#E7E0EC', borderRadius: 4, marginTop: 8 }} />
        <View style={{ width: 60, height: 12, backgroundColor: '#E7E0EC', borderRadius: 4, marginTop: 8 }} />
      </View>
    </View>
  );
}

export function MedicalTimeline({
  consultations,
  onViewConsultation,
  isLoading,
}: MedicalTimelineProps) {
  const renderItem = useCallback(
    ({ item, index }: { item: ConsultationSummary; index: number }) => (
      <TimelineCard
        consultation={item}
        onPress={() => onViewConsultation?.(item.id)}
        isLast={index === consultations.length - 1}
      />
    ),
    [consultations.length, onViewConsultation],
  );

  if (isLoading) {
    return (
      <View style={styles.container}>
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }

  if (consultations.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No visit history yet.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={consultations}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  itemContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
  },
  timelineColumn: {
    alignItems: 'center',
    width: 24,
    marginRight: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 14,
  },
  line: {
    width: 2,
    flex: 1,
    backgroundColor: '#E7E0EC',
    marginVertical: 2,
  },
  card: {
    flex: 1,
    backgroundColor: '#F5F0EB',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  cardHeader: {
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
    marginTop: 6,
  },
  noAssessmentText: {
    fontSize: 14,
    color: '#79747E',
    fontStyle: 'italic',
    marginTop: 6,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  vetText: {
    fontSize: 12,
    color: '#79747E',
  },
  rxCount: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.primary,
  },
  emptyContainer: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#79747E',
  },
});
