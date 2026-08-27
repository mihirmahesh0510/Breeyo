import React, { useCallback, useMemo, useState } from 'react';
import { View, Pressable, StyleSheet, FlatList } from 'react-native';
import { Text } from 'react-native-paper';
import { BottomSheet, BreeyoIconButton, colors } from '@breeyo/ui';

const IST_TIME_ZONE = 'Asia/Kolkata';

function istDateKey(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: IST_TIME_ZONE });
}

/** `Tue, 18 Aug` -- UI-SPEC's mobile date format. */
function formatNavigatorLabel(date: Date): string {
  return date.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: IST_TIME_ZONE,
  });
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export interface DateNavigatorProps {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
}

/**
 * `‹ Tue, 18 Aug ›` with 44px arrows and a tap-to-open date picker.
 *
 * `apps/mobile` declares no native date-picker dependency, and UI-SPEC's own
 * Registry Safety section forbids adding one for this phase ("no new npm
 * package may be introduced"). `InvoiceDueDatePicker.tsx` (Phase 6) already
 * established the precedent for this exact constraint: build the picker
 * from existing components rather than install one. Here that's a
 * `BottomSheet` listing a short run of nearby dates, not a full calendar
 * grid -- day-by-day is already covered by the arrows, so the picker only
 * needs to support jumping a few days in either direction.
 */
export function DateNavigator({ selectedDate, onSelectDate }: DateNavigatorProps) {
  const [pickerVisible, setPickerVisible] = useState(false);
  const today = useMemo(() => new Date(), []);
  const isToday = istDateKey(selectedDate) === istDateKey(today);

  const handlePrevDay = useCallback(() => {
    onSelectDate(addDays(selectedDate, -1));
  }, [onSelectDate, selectedDate]);

  const handleNextDay = useCallback(() => {
    onSelectDate(addDays(selectedDate, 1));
  }, [onSelectDate, selectedDate]);

  const handleToday = useCallback(() => {
    onSelectDate(today);
  }, [onSelectDate, today]);

  const pickerDates = useMemo(
    () => Array.from({ length: 17 }, (_, i) => addDays(today, i - 3)),
    [today],
  );

  const handlePickDate = useCallback(
    (date: Date) => {
      onSelectDate(date);
      setPickerVisible(false);
    },
    [onSelectDate],
  );

  return (
    <View style={styles.container}>
      <BreeyoIconButton
        icon="chevron-left"
        onPress={handlePrevDay}
        accessibilityLabel="Previous day"
        size={24}
        testID="date-navigator-prev"
      />

      <Pressable
        onPress={() => setPickerVisible(true)}
        style={styles.labelButton}
        accessibilityRole="button"
        accessibilityLabel={`Change date, currently ${formatNavigatorLabel(selectedDate)}`}
        testID="date-navigator-label"
      >
        <Text variant="titleMedium" style={[styles.label, isToday && styles.labelToday]}>
          {formatNavigatorLabel(selectedDate)}
        </Text>
      </Pressable>

      {!isToday && (
        <Pressable
          onPress={handleToday}
          style={styles.todayChip}
          accessibilityRole="button"
          accessibilityLabel="Go to today"
          testID="date-navigator-today"
        >
          <Text variant="labelSmall" style={styles.todayChipText}>
            Today
          </Text>
        </Pressable>
      )}

      <BreeyoIconButton
        icon="chevron-right"
        onPress={handleNextDay}
        accessibilityLabel="Next day"
        size={24}
        testID="date-navigator-next"
      />

      <BottomSheet
        visible={pickerVisible}
        onDismiss={() => setPickerVisible(false)}
        title="Pick a date"
      >
        <FlatList
          data={pickerDates}
          keyExtractor={(d) => istDateKey(d)}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => handlePickDate(item)}
              style={styles.pickerRow}
              accessibilityRole="button"
              accessibilityLabel={formatNavigatorLabel(item)}
            >
              <Text variant="bodyLarge">
                {istDateKey(item) === istDateKey(today) ? 'Today' : formatNavigatorLabel(item)}
              </Text>
            </Pressable>
          )}
        />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 4,
  },
  labelButton: {
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  label: {
    color: '#1C1B1F',
  },
  labelToday: {
    color: colors.primary,
  },
  todayChip: {
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#F5F0EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayChipText: {
    color: colors.primary,
  },
  pickerRow: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F0EB',
  },
});
