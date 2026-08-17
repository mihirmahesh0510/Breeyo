'use client';

import React from 'react';
import { AuthProvider } from '../src/lib/AuthProvider';

export function Providers({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
