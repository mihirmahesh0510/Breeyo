import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiClient, ApiClientError } from '../lib/api';
import {
  getAccessToken,
  getRefreshToken,
  getActiveClinicId,
  getUserSummary,
  storeAuthTokens,
  clearAuthStorage,
  type StoredUserSummary,
} from '../lib/auth-storage';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: StoredUserSummary | null;
  activeClinicId: string | null;
  accessToken: string | null;
  wizardCompleted: boolean | null;
}

interface LoginResponse {
  data: {
    accessToken: string;
    refreshToken: string;
    user: StoredUserSummary;
    // Real API shape (apps/api/src/modules/auth/auth.service.ts `login()`) returns
    // `clinic: { id, name }`, not a top-level `clinicId` -- found via live E2E
    // testing: the old `clinicId` field here was always undefined, so every login
    // persisted the literal string "undefined" as the stored active clinic id,
    // breaking tenant context for every authenticated write in the app.
    clinic: { id: string; name: string };
  };
}

interface RefreshResponse {
  data: {
    accessToken: string;
    refreshToken: string;
  };
}

interface ClinicCurrentResponse {
  data: {
    id: string;
    name: string;
    wizardCompletedAt: string | null;
    workingHours?: unknown[] | null;
  };
}

interface ClinicSelectionPayload {
  clinics: Array<{ id: string; name: string; address: string }>;
}

type LoginResult =
  | { success: true }
  | { success: false; code: string; message: string; clinics?: ClinicSelectionPayload['clinics'] };

interface AuthContextValue extends AuthState {
  login: (email: string, password: string, clinicId?: string) => Promise<LoginResult>;
  otpLogin: (phone: string, otp: string, clinicId?: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    user: null,
    activeClinicId: null,
    accessToken: null,
    wizardCompleted: null,
  });

  const fetchWizardStatus = useCallback(async (token: string): Promise<boolean | null> => {
    try {
      const clinic = await apiClient<ClinicCurrentResponse>('/api/v1/clinics/current', { token });
      return !!clinic.data.wizardCompletedAt;
    } catch {
      // If we cannot determine wizard status, treat as null (unknown)
      return null;
    }
  }, []);

  const handleLoginResponse = useCallback(async (response: LoginResponse) => {
    const { accessToken, refreshToken, user, clinic } = response.data;
    const clinicId = clinic.id;
    await storeAuthTokens(accessToken, refreshToken, clinicId, user);
    const wizardCompleted = await fetchWizardStatus(accessToken);
    setState({
      isAuthenticated: true,
      isLoading: false,
      user,
      activeClinicId: clinicId,
      accessToken,
      wizardCompleted,
    });
  }, [fetchWizardStatus]);

  const refreshSession = useCallback(async (): Promise<boolean> => {
    try {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) return false;

      const response = await apiClient<RefreshResponse>('/api/v1/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      });

      const { accessToken: newAccess, refreshToken: newRefresh } = response.data;
      const [user, clinicId] = await Promise.all([getUserSummary(), getActiveClinicId()]);

      if (!user || !clinicId) {
        await clearAuthStorage();
        return false;
      }

      await storeAuthTokens(newAccess, newRefresh, clinicId, user);
      const wizardCompleted = await fetchWizardStatus(newAccess);
      setState({
        isAuthenticated: true,
        isLoading: false,
        user,
        activeClinicId: clinicId,
        accessToken: newAccess,
        wizardCompleted,
      });
      return true;
    } catch {
      await clearAuthStorage();
      return false;
    }
  }, [fetchWizardStatus]);

  const login = useCallback(
    async (email: string, password: string, clinicId?: string): Promise<LoginResult> => {
      try {
        const body: Record<string, string> = { email, password };
        if (clinicId) body.clinicId = clinicId;

        const response = await apiClient<LoginResponse>('/api/v1/auth/login', {
          method: 'POST',
          body: JSON.stringify(body),
        });

        await handleLoginResponse(response);
        return { success: true };
      } catch (error) {
        if (error instanceof ApiClientError) {
          const result: LoginResult = { success: false, code: error.code, message: error.message };
          if (error.code === 'CLINIC_SELECTION_REQUIRED' && error.details) {
            result.clinics = (error.details as ClinicSelectionPayload).clinics;
          }
          return result;
        }
        return { success: false, code: 'NETWORK_ERROR', message: 'Unable to connect to server' };
      }
    },
    [handleLoginResponse],
  );

  const otpLogin = useCallback(
    async (phone: string, otp: string, clinicId?: string): Promise<LoginResult> => {
      try {
        const body: Record<string, string> = { phone, otp };
        if (clinicId) body.clinicId = clinicId;

        const response = await apiClient<LoginResponse>('/api/v1/auth/otp/verify', {
          method: 'POST',
          body: JSON.stringify(body),
        });

        await handleLoginResponse(response);
        return { success: true };
      } catch (error) {
        if (error instanceof ApiClientError) {
          const result: LoginResult = { success: false, code: error.code, message: error.message };
          if (error.code === 'CLINIC_SELECTION_REQUIRED' && error.details) {
            result.clinics = (error.details as ClinicSelectionPayload).clinics;
          }
          return result;
        }
        return { success: false, code: 'NETWORK_ERROR', message: 'Unable to connect to server' };
      }
    },
    [handleLoginResponse],
  );

  const logout = useCallback(async () => {
    try {
      const token = await getAccessToken();
      if (token) {
        await apiClient('/api/v1/auth/logout', {
          method: 'POST',
          token,
        });
      }
    } catch {
      // Logout API failure should not block local cleanup
    }
    await clearAuthStorage();
    setState({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      activeClinicId: null,
      accessToken: null,
      wizardCompleted: null,
    });
  }, []);

  useEffect(() => {
    async function hydrateSession() {
      try {
        const [accessToken, user, clinicId] = await Promise.all([
          getAccessToken(),
          getUserSummary(),
          getActiveClinicId(),
        ]);

        if (accessToken && user && clinicId) {
          const wizardCompleted = await fetchWizardStatus(accessToken);
          setState({
            isAuthenticated: true,
            isLoading: false,
            user,
            activeClinicId: clinicId,
            accessToken,
            wizardCompleted,
          });
          return;
        }

        // Try refreshing if we have a refresh token but no access token
        const refreshed = await refreshSession();
        if (!refreshed) {
          setState((prev) => ({ ...prev, isLoading: false }));
        }
      } catch {
        await clearAuthStorage();
        setState((prev) => ({ ...prev, isLoading: false }));
      }
    }

    hydrateSession();
  }, [refreshSession, fetchWizardStatus]);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        otpLogin,
        logout,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
