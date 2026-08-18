'use client';

// Client-side route guard only. This is deliberately NOT Next.js middleware
// (there is no apps/web/middleware.ts): middleware runs on the edge runtime,
// which cannot read sessionStorage, so a middleware-based guard here would
// either be a permanent no-op or would require introducing the httpOnly
// cookie session that auth-store.ts's header comment explicitly avoids. The
// guard therefore has to run after hydration, in a client component, where
// useAuth() has already read the token out of sessionStorage.

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';

interface RequireAuthResult {
  ready: boolean;
  accessToken?: string;
}

export function useRequireAuth(): RequireAuthResult {
  const { accessToken, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !accessToken) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [isLoading, accessToken, pathname, router]);

  if (isLoading) {
    return { ready: false };
  }

  if (!accessToken) {
    return { ready: false };
  }

  return { ready: true, accessToken };
}
