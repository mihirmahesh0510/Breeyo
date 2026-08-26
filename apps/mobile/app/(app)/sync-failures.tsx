import React, { useCallback } from 'react';
import { SyncFailureCenterScreen } from '../../src/features/offline-sync/screens/SyncFailureCenterScreen';
import { useSyncUiStore } from '../../src/features/offline-sync/store/syncUiStore';
import { useSyncFailureActions } from '../../src/features/offline-sync/hooks/useSyncFailureActions';
import type { FailureCenterItem } from '../../src/features/offline-sync/lib/sync-status';
import { useAuth } from '../../src/providers/AuthProvider';
import { useClinicVets } from '../../src/features/scheduling/hooks/useSchedule';

/**
 * D-18/D-20/D-22 to D-24 (F2, Phase 10 review-fix): the real navigation
 * target `SyncStatusBadge`'s `onPress` (app/(app)/_layout.tsx) routes to --
 * `SyncFailureCenterScreen.tsx` was fully built (Plan 10-05) but never
 * mounted anywhere, so staff had no way to actually reach it.
 *
 * `resolveUserName` reuses `useClinicVets()` (`scheduling/hooks/useSchedule.ts`)
 * -- the one staff-directory-shaped hook already in this codebase
 * (`ClinicalConflictResolutionSheet.tsx`'s own `resolveUserName` prop has no
 * production caller of its own to copy a pattern from) -- falling back to
 * the raw id for an owner id that is not a clinic vet.
 */
export default function SyncFailuresRoute() {
  const { user } = useAuth();
  const items = useSyncUiStore((state) => state.failureItems);
  const { retryFailureItem, escalateFailureItem } = useSyncFailureActions();
  const { data: vets } = useClinicVets();

  const resolveUserName = useCallback(
    (userId: string) => vets?.find((vet) => vet.id === userId)?.name ?? userId,
    [vets],
  );

  const handleRetry = useCallback(
    (item: FailureCenterItem) => {
      void retryFailureItem(item);
    },
    [retryFailureItem],
  );

  const handleEscalate = useCallback(
    (item: FailureCenterItem) => {
      void escalateFailureItem(item);
    },
    [escalateFailureItem],
  );

  if (!user) {
    return null;
  }

  return (
    <SyncFailureCenterScreen
      items={items}
      viewerUserId={user.id}
      resolveUserName={resolveUserName}
      onRetry={handleRetry}
      onEscalate={handleEscalate}
    />
  );
}
