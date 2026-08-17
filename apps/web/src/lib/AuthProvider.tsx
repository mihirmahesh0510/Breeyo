'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiClient, ApiClientError } from './api';
import { readSession, writeSession, clearSession, type WebSession } from './auth-store';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
}

export interface ClinicOption {
  id: string;
  name: string;
}

// Real API shape (apps/api/src/modules/auth/auth.service.ts `login()`, wrapped by
// auth.controller.ts `loginHandler` as `{ data }`): `data.accessToken`,
// `data.refreshToken`, `data.expiresIn`, `data.user: { id, email, fullName }` and
// `data.clinic: { id, name }` -- there is no top-level `clinicId`, the active
// clinic comes from `data.clinic.id`.
interface LoginResponse {
  data: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    user: AuthUser;
    clinic: { id: string; name: string };
  };
}

type LoginResult =
  | { success: true }
  | { success: false; code: string; message: string; clinics?: ClinicOption[] };

interface AuthState {
  accessToken: string | null;
  activeClinicId: string | null;
  user: AuthUser | null;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string, clinicId?: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    accessToken: null,
    activeClinicId: null,
    user: null,
    isLoading: true,
  });

  // Hydrate from sessionStorage on mount only -- never during render, so a
  // server-rendered pass and the first client render agree (avoids a
  // hydration mismatch), and the guarded route sees `isLoading: true` until
  // this resolves.
  useEffect(() => {
    const session = readSession();
    if (session) {
      setState({
        accessToken: session.accessToken,
        activeClinicId: session.activeClinicId,
        user: { id: session.userId, email: '', fullName: session.userName },
        isLoading: false,
      });
    } else {
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  }, []);

  const login = useCallback(
    async (email: string, password: string, clinicId?: string): Promise<LoginResult> => {
      try {
        const body: Record<string, string> = { email, password };
        if (clinicId) {
          body.clinicId = clinicId;
        }

        const response = await apiClient<LoginResponse>('/api/v1/auth/login', {
          method: 'POST',
          body: JSON.stringify(body),
        });

        const { accessToken, refreshToken, user, clinic } = response.data;

        const session: WebSession = {
          accessToken,
          refreshToken,
          userId: user.id,
          userName: user.fullName,
          activeClinicId: clinic.id,
        };
        writeSession(session);

        setState({
          accessToken,
          activeClinicId: clinic.id,
          user,
          isLoading: false,
        });

        return { success: true };
      } catch (error) {
        if (error instanceof ApiClientError) {
          // See api.ts: for CLINIC_SELECTION_REQUIRED the API puts the clinic
          // list at `error.clinics` (top-level on the error object), not
          // nested under `error.details`. apiClient folds that into
          // `details.clinics` so callers here have one place to look.
          const clinics = (error.details as { clinics?: ClinicOption[] } | undefined)?.clinics;
          return { success: false, code: error.code, message: error.message, clinics };
        }
        return { success: false, code: 'NETWORK_ERROR', message: 'Unable to connect to server' };
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    const session = readSession();
    try {
      if (session?.accessToken) {
        await apiClient('/api/v1/auth/logout', {
          method: 'POST',
          token: session.accessToken,
          body: JSON.stringify({ refreshToken: session.refreshToken ?? '' }),
        });
      }
    } catch {
      // A failed logout call must still clear local state -- best effort only.
    }
    clearSession();
    setState({ accessToken: null, activeClinicId: null, user: null, isLoading: false });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Plan 08-14's data hooks call this on any failed request. There is no
// refresh-token rotation or silent-refresh path in this plan (Phase 9 scope) --
// a 401 always means the held token is stale or revoked, so the only correct
// response is to drop the local session and send the user back to `/login`.
export function handleUnauthorized(error: unknown): boolean {
  if (error instanceof ApiClientError && error.status === 401) {
    clearSession();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    return true;
  }
  return false;
}
