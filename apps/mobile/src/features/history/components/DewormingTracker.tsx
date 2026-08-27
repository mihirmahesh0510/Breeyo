import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { colors } from '@breeyo/ui';
import type { DewormingRecord } from '@breeyo/types';

interface DewormingTrackerProps {
  records: DewormingRecord[];
  isLoading?: boolean;
}

type DewormingStatus = 'completed' | 'upcoming' | 'overdue';

function getDewormingStatus(record: DewormingRecord): DewormingStatus {
  if (!record.nextDueDate) return 'completed';
  const now = new Date();
  const nextDue = new Date(record.nextDueDate);
  if (nextDue < now) return 'overdue';
  return 'upcoming';
}

const STATUS_STYLES: Record<
  DewormingStatus,
  { bg: string; text: string; label: string }
> = {
  completed: { bg: '#E8F5E9', text: colors.success, label: 'Completed' },
  upcoming: { bg: '#E3F2FD', text: '#1565C0', label: 'Upcoming' },
  overdue: { bg: '#FFDAD6', text: '#B3261E', label: 'Overdue' },
};

function formatDate(date: Date | null): string {
  if (!date) return '-';
  const d = new Date(date);
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function DewormingRow({ record }: { record: DewormingRecord }) {
  const status = getDewormingStatus(record);
  const statusStyle = STATUS_STYLES[status];

  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Text style={styles.drugName}>{record.drugName}</Text>
        <Text style={styles.dateText}>
          Administered: {formatDate(record.administeredAt)}
        </Text>
        {record.nextDueDate ? (
          <Text
            style={[
              styles.nextDueText,
              status === 'overdue' && styles.overdueText,
            ]}
          >
            Next due: {formatDate(record.nextDueDate)}
          </Text>
        ) : null}
      </View>
      <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
        <Text style={[styles.statusText, { color: statusStyle.text }]}>
          {statusStyle.label}
        </Text>
      </View>
    </View>
  );
}

function SkeletonRow() {
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <View style={{ width: 120, height: 14, backgroundColor: '#E7E0EC', borderRadius: 4 }} />
        <View style={{ width: 180, height: 12, backgroundColor: '#E7E0EC', borderRadius: 4, marginTop: 4 }} />
      </View>
      <View style={{ width: 70, height: 24, backgroundColor: '#E7E0EC', borderRadius: 12 }} />
    </View>
  );
}

export function DewormingTracker({
  records,
  isLoading,
}: DewormingTrackerProps) {
  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Deworming Records</Text>
        <SkeletonRow />
        <SkeletonRow />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Deworming Records</Text>
      {records.length === 0 ? (
        <Text style={styles.emptyText}>No deworming records.</Text>
      ) : (
        <FlatList
          data={records}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <DewormingRow record={item} />}
          scrollEnabled={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1B1F',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E7E0EC',
  },
  rowLeft: {
    flex: 1,
    marginRight: 8,
  },
  drugName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1C1B1F',
  },
  dateText: {
    fontSize: 12,
    color: '#79747E',
    marginTop: 2,
  },
  nextDueText: {
    fontSize: 12,
    color: '#49454F',
    marginTop: 2,
  },
  overdueText: {
    color: '#B3261E',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  emptyText: {
    fontSize: 14,
    color: '#79747E',
    textAlign: 'center',
    paddingVertical: 20,
  },
});
