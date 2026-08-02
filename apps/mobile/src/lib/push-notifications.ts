import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { apiClient } from './api';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Registers for push notifications by requesting permissions,
 * obtaining an Expo push token, and registering it with the API.
 *
 * @param accessToken - The user's current JWT access token
 * @returns The Expo push token string, or null if registration failed
 */
export async function registerForPushNotifications(
  accessToken: string,
): Promise<string | null> {
  // Check existing permissions
  const { status: existingStatus } =
    await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Request permissions if not granted
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  // Get the Expo push token
  const tokenData = await Notifications.getExpoPushTokenAsync();
  const token = tokenData.data;

  // Register with the API
  const platform = Platform.OS as 'ios' | 'android';

  await apiClient('/api/v1/notifications/device-token', {
    method: 'POST',
    token: accessToken,
    body: JSON.stringify({ token, platform }),
  });

  return token;
}

/**
 * Unregisters a push token by calling the API to remove it.
 *
 * @param token - The Expo push token to unregister
 * @param accessToken - The user's current JWT access token
 */
export async function unregisterPushToken(
  token: string,
  accessToken: string,
): Promise<void> {
  await apiClient('/api/v1/notifications/device-token', {
    method: 'DELETE',
    token: accessToken,
    body: JSON.stringify({ token }),
  });
}
