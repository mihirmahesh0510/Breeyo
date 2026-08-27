import React, { useRef, useEffect } from 'react';
import { View, Text, Pressable, TextInput, Animated, StyleSheet } from 'react-native';
import type { BodySystemExam } from '@breeyo/types';
import { BODY_SYSTEMS } from '@breeyo/types';
import { colors } from '@breeyo/ui';

interface BodySystemChecklistProps {
  systems: BodySystemExam[];
  onChange: (systems: BodySystemExam[]) => void;
}

function BodySystemRow({
  system,
  exam,
  onStatusChange,
  onFindingToggle,
  onNotesChange,
}: {
  system: (typeof BODY_SYSTEMS)[number];
  exam: BodySystemExam;
  onStatusChange: (status: 'normal' | 'abnormal') => void;
  onFindingToggle: (finding: string) => void;
  onNotesChange: (notes: string) => void;
}) {
  const animatedHeight = useRef(new Animated.Value(exam.status === 'abnormal' ? 1 : 0)).current;
  const isAbnormal = exam.status === 'abnormal';

  useEffect(() => {
    Animated.timing(animatedHeight, {
      toValue: isAbnormal ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [isAbnormal, animatedHeight]);

  const expandHeight = animatedHeight.interpolate({
    inputRange: [0, 1],
    outputRange: [0, system.subFindings.length * 36 + 60],
  });

  return (
    <View style={styles.systemRow}>
      <View style={styles.systemHeader}>
        <Text style={styles.systemLabel}>{system.label}</Text>
        <View style={styles.toggleGroup}>
          <Pressable
            style={[
              styles.toggleButton,
              styles.toggleLeft,
              !isAbnormal && styles.toggleSelected,
            ]}
            onPress={() => onStatusChange('normal')}
            accessibilityRole="button"
            accessibilityState={{ selected: !isAbnormal }}
            accessibilityLabel={`${system.label} Normal`}
          >
            <Text style={[styles.toggleText, !isAbnormal && styles.toggleTextSelected]}>
              Normal
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.toggleButton,
              styles.toggleRight,
              isAbnormal && styles.toggleAbnormalSelected,
            ]}
            onPress={() => onStatusChange('abnormal')}
            accessibilityRole="button"
            accessibilityState={{ selected: isAbnormal }}
            accessibilityLabel={`${system.label} Abnormal`}
          >
            <Text style={[styles.toggleText, isAbnormal && styles.toggleAbnormalText]}>
              Abnormal
            </Text>
          </Pressable>
        </View>
      </View>

      <Animated.View style={[styles.expandable, { height: expandHeight, overflow: 'hidden' }]}>
        <View style={styles.findingsContainer}>
          {system.subFindings.map((finding) => {
            const isChecked = exam.findings.includes(finding);
            return (
              <Pressable
                key={finding}
                style={styles.findingRow}
                onPress={() => onFindingToggle(finding)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isChecked }}
              >
                <View style={[styles.checkbox, isChecked && styles.checkboxChecked]}>
                  {isChecked && <Text style={styles.checkmark}>{'\u2713'}</Text>}
                </View>
                <Text style={styles.findingLabel}>{finding}</Text>
              </Pressable>
            );
          })}
          <TextInput
            style={styles.notesInput}
            value={exam.notes}
            onChangeText={onNotesChange}
            placeholder="Describe findings..."
            placeholderTextColor="#79747E"
            accessibilityLabel={`${system.label} notes`}
          />
        </View>
      </Animated.View>
    </View>
  );
}

export function BodySystemChecklist({ systems, onChange }: BodySystemChecklistProps) {
  const getExam = (systemId: string): BodySystemExam => {
    const found = systems.find((s) => s.system === systemId);
    return found || { system: systemId, status: 'normal', findings: [], notes: '' };
  };

  const updateSystem = (systemId: string, update: Partial<BodySystemExam>) => {
    const existing = systems.find((s) => s.system === systemId);
    if (existing) {
      onChange(
        systems.map((s) => (s.system === systemId ? { ...s, ...update } : s)),
      );
    } else {
      onChange([
        ...systems,
        { system: systemId, status: 'normal', findings: [], notes: '', ...update },
      ]);
    }
  };

  const handleStatusChange = (systemId: string, status: 'normal' | 'abnormal') => {
    if (status === 'normal') {
      updateSystem(systemId, { status, findings: [], notes: '' });
    } else {
      updateSystem(systemId, { status });
    }
  };

  const handleFindingToggle = (systemId: string, finding: string) => {
    const exam = getExam(systemId);
    const updated = exam.findings.includes(finding)
      ? exam.findings.filter((f) => f !== finding)
      : [...exam.findings, finding];
    updateSystem(systemId, { findings: updated });
  };

  return (
    <View style={styles.container}>
      {BODY_SYSTEMS.map((system) => (
        <BodySystemRow
          key={system.id}
          system={system}
          exam={getExam(system.id)}
          onStatusChange={(status) => handleStatusChange(system.id, status)}
          onFindingToggle={(finding) => handleFindingToggle(system.id, finding)}
          onNotesChange={(notes) => updateSystem(system.id, { notes })}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 2,
  },
  systemRow: {
    borderBottomWidth: 1,
    borderBottomColor: '#E7E0EC',
  },
  systemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  systemLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1C1B1F',
    flex: 1,
  },
  toggleGroup: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CAC4D0',
    overflow: 'hidden',
  },
  toggleButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toggleLeft: {
    borderRightWidth: 1,
    borderRightColor: '#CAC4D0',
  },
  toggleRight: {},
  toggleSelected: {
    backgroundColor: colors.primaryContainer,
  },
  toggleAbnormalSelected: {
    backgroundColor: '#FFDAD6',
  },
  toggleText: {
    fontSize: 12,
    color: '#49454F',
    fontWeight: '500',
  },
  toggleTextSelected: {
    color: colors.onPrimaryContainer,
  },
  toggleAbnormalText: {
    color: '#93000A',
  },
  expandable: {},
  findingsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    paddingLeft: 32,
  },
  findingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#CAC4D0',
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  findingLabel: {
    fontSize: 13,
    color: '#1C1B1F',
  },
  notesInput: {
    borderWidth: 1,
    borderColor: '#CAC4D0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: '#1C1B1F',
    marginTop: 4,
  },
});
