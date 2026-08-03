// Secure storage wrapper for auth tokens
// Uses expo-secure-store (iOS Keychain / Android Keystore)
// Never store tokens in AsyncStorage

import * as SecureStore from 'expo-secure-store';

const KEYS = {
  ACCESS_TOKEN: 'breeyo_access_token',
  REFRESH_TOKEN: 'breeyo_refresh_token',
  ACTIVE_CLINIC_ID: 'breeyo_active_clinic_id',
  USER_SUMMARY: 'breeyo_user_summary',
} as const;

export interface StoredUserSummary {
  id: string;
  email: string;
  fullName: string;
}

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.ACCESS_TOKEN);
}

export async function setAccessToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS.ACCESS_TOKEN, token);
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.REFRESH_TOKEN);
}

export async function setRefreshToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS.REFRESH_TOKEN, token);
}

export async function getActiveClinicId(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.ACTIVE_CLINIC_ID);
}

export async function setActiveClinicId(clinicId: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS.ACTIVE_CLINIC_ID, clinicId);
}

export async function getUserSummary(): Promise<StoredUserSummary | null> {
  const raw = await SecureStore.getItemAsync(KEYS.USER_SUMMARY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredUserSummary;
  } catch {
    return null;
  }
}

export async function setUserSummary(user: StoredUserSummary): Promise<void> {
  await SecureStore.setItemAsync(KEYS.USER_SUMMARY, JSON.stringify(user));
}

export async function storeAuthTokens(
  accessToken: string,
  refreshToken: string,
  clinicId: string,
  user: StoredUserSummary,
): Promise<void> {
  await Promise.all([
    setAccessToken(accessToken),
    setRefreshToken(refreshToken),
    setActiveClinicId(clinicId),
    setUserSummary(user),
  ]);
}

export async function clearAuthStorage(): Promise<void> {
  await Promise.all(
    Object.values(KEYS).map((key) => SecureStore.deleteItemAsync(key)),
  );
}
