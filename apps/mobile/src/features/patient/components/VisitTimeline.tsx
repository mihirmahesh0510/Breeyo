import React from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { Card, StatusBadge, EmptyState, colors } from '@breeyo/ui';
import type { StatusVariant } from '@breeyo/ui';
import type { Visit } from '../hooks/usePatientProfile';

interface VisitTimelineProps {
  visits: Visit[];
  testID?: string;
}

/**
 * Map a visit status string to a StatusBadge variant.
 */
function mapVisitStatus(status: string): StatusVariant {
  switch (status.toLowerCase()) {
    case 'in_consult':
    case 'inconsult':
      return 'inConsult';
    case 'waiting':
      return 'waiting';
    case 'done':
    case 'completed':
      return 'done';
    case 'no_show':
      return 'noShow';
    default:
      return 'done';
  }
}

/**
 * Format an ISO date string for display.
 * e.g., "2025-03-15T10:30:00Z" -> "15 Mar 2025, 10:30 AM"
 */
function formatVisitDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;

  const day = String(d.getDate()).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[d.getMonth()];
  const year = d.getFullYear();

  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;

  return `${day} ${month} ${year}, ${hours}:${minutes} ${ampm}`;
}

function VisitCard({ visit }: { visit: Visit }) {
  const statusVariant = mapVisitStatus(visit.status);
  const dateDisplay = formatVisitDate(visit.checkedInAt);

  return (
    <View style={styles.visitCardWrapper}>
      <View style={styles.timelineIndicator}>
        <View style={styles.timelineDot} />
        <View style={styles.timelineLine} />
      </View>
      <View style={styles.visitCardContent}>
        <Card variant="outlined" testID={`visit-${visit.id}`}>
          <Card.Body>
            <View style={styles.visitHeader}>
              <Text variant="bodySmall" style={styles.visitDate}>
                {dateDisplay}
              </Text>
              <StatusBadge status={statusVariant} />
            </View>
            {visit.visitReason && (
              <Text variant="bodyLarge" style={styles.visitReason}>
                {visit.visitReason}
              </Text>
            )}
            {visit.vetName && (
              <Text variant="bodySmall" style={styles.vetName}>
                Dr. {visit.vetName}
              </Text>
            )}
          </Card.Body>
        </Card>
      </View>
    </View>
  );
}

export function VisitTimeline({ visits, testID }: VisitTimelineProps) {
  if (!visits || visits.length === 0) {
    return (
      <EmptyState
        title="No visits yet"
        description="This pet will appear here after their first check-in."
        testID="visits-empty"
      />
    );
  }

  // Sort newest first
  const sortedVisits = [...visits].sort(
    (a, b) => new Date(b.checkedInAt).getTime() - new Date(a.checkedInAt).getTime(),
  );

  return (
    <FlatList<Visit>
      data={sortedVisits}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <VisitCard visit={item} />}
      scrollEnabled={false}
      contentContainerStyle={styles.listContent}
      testID={testID}
    />
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingVertical: 8,
  },
  visitCardWrapper: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  timelineIndicator: {
    alignItems: 'center',
    width: 24,
    marginRight: 12,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    marginTop: 16,
  },
  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: '#CAC4D0',
    marginTop: 4,
  },
  visitCardContent: {
    flex: 1,
    marginBottom: 8,
  },
  visitHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  visitDate: {
    color: '#49454F',
  },
  visitReason: {
    fontWeight: '600',
    marginBottom: 4,
  },
  vetName: {
    color: '#49454F',
  },
});
