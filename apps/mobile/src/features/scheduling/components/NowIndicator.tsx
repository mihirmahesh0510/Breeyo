import React from 'react';
import { View, StyleSheet } from 'react-native';

/**
 * A 2px `primary` rule with an 8px dot, positioned by the caller (via
 * `splitIndexForNowIndicator`) between the last past and first future row.
 * Only ever rendered when the selected date is today.
 */
export function NowIndicator() {
  return (
    <View
      style={styles.container}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="now-indicator"
    >
      <View style={styles.dot} />
      <View style={styles.line} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginVertical: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2E7D32',
  },
  line: {
    flex: 1,
    height: 2,
    backgroundColor: '#2E7D32',
    marginLeft: 4,
  },
});
