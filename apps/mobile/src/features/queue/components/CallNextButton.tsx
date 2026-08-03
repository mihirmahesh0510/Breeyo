import React from 'react';
import { StyleSheet } from 'react-native';
import { Button, ActivityIndicator } from 'react-native-paper';

interface CallNextButtonProps {
  onPress: () => void;
  loading: boolean;
  disabled: boolean;
}

export function CallNextButton({ onPress, loading, disabled }: CallNextButtonProps) {
  return (
    <Button
      mode="contained"
      onPress={onPress}
      disabled={disabled || loading}
      loading={loading}
      icon="arrow-right-circle"
      style={styles.button}
      buttonColor="#2E7D32"
      textColor="#FFFFFF"
      contentStyle={styles.content}
      accessibilityLabel="Call next patient"
    >
      Call Next
    </Button>
  );
}

const styles = StyleSheet.create({
  button: {
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
  },
  content: {
    height: 48,
  },
});
