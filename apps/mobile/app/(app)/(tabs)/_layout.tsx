import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useWhatsAppScreenAccess } from '../../../src/features/whatsapp/components/WhatsAppAccessGate';

/**
 * WHA-05 / D-20: the WhatsApp nav entry point.
 *
 * The WhatsApp Inbox/Thread routes live at `app/(app)/whatsapp/*` -- a
 * sibling stack to `(tabs)`, the same shape as `patient/[petId].tsx` --
 * rather than as a bottom tab, because a `Tabs.Screen` must be backed by a
 * file inside this same `(tabs)/` directory and adding one is outside this
 * plan's file scope. A role-gated floating button (Front Desk/Admin only,
 * D-20) pushes to `/whatsapp` instead, satisfying "open from app
 * navigation" and "does not see the entry" for other roles without a tab
 * that would need a backing route file this plan does not create.
 */
function WhatsAppNavButton() {
  const router = useRouter();
  const { canAccess } = useWhatsAppScreenAccess();

  if (!canAccess) return null;

  return (
    <Pressable
      onPress={() => router.push('/whatsapp')}
      style={styles.whatsappButton}
      accessibilityRole="button"
      accessibilityLabel="WhatsApp"
      hitSlop={8}
    >
      <MaterialCommunityIcons name="whatsapp" size={26} color="#FFFFFF" />
    </Pressable>
  );
}

export default function TabsLayout() {
  return (
    <View style={styles.root}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#2E7D32',
          tabBarInactiveTintColor: '#79747E',
          tabBarStyle: {
            backgroundColor: '#FFFBF5',
            borderTopColor: '#CAC4D0',
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Queue',
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons
                name="clipboard-list-outline"
                size={size}
                color={color}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="schedule"
          options={{
            title: 'Schedule',
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="calendar-month" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="patients"
          options={{
            title: 'Patients',
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="paw" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="inventory"
          options={{
            title: 'Inventory',
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="package-variant-closed" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="billing"
          options={{
            title: 'Billing',
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="receipt" size={size} color={color} />
            ),
          }}
        />
      </Tabs>

      <WhatsAppNavButton />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  whatsappButton: {
    position: 'absolute',
    left: 16,
    bottom: 72,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#2E7D32',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
});
