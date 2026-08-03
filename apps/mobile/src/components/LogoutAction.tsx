import React, { useState } from 'react';
import { TouchableOpacity, Text, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useAuth } from '../providers/AuthProvider';

interface LogoutActionProps {
  /** Label shown on the button. Defaults to "Log Out". */
  label?: string;
}

export function LogoutAction({ label = 'Log Out' }: LogoutActionProps) {
  const { logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  function handlePress() {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          setIsLoggingOut(true);
          try {
            await logout();
          } finally {
            setIsLoggingOut(false);
          }
        },
      },
    ]);
  }

  if (isLoggingOut) {
    return <ActivityIndicator style={styles.container} color="#dc2626" />;
  }

  return (
    <TouchableOpacity style={styles.container} onPress={handlePress}>
      <Text style={styles.text}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  text: {
    color: '#dc2626',
    fontSize: 14,
    fontWeight: '500',
  },
});
