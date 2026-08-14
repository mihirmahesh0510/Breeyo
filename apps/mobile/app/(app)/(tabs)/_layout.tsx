import React from 'react';
import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function TabsLayout() {
  return (
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
  );
}
