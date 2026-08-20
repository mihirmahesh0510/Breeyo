/**
 * Browser-only realtime sync events (Plan 09-04, D-40, D-42, D-43).
 *
 * Deliberately NOT added to `@breeyo/types`'s `SOCKET_EVENTS`: that constant
 * is shared with `apps/mobile`, and these events exist only to carry inline
 * refresh metadata (`staleVersion`, `changedByUser`, `changedAt`,
 * `reviewPath`) to the browser queue/billing workbenches -- widening the
 * shared mobile contract for a browser-only stale-state prompt would be the
 * wrong layer for this. Kept as a flat file in `apps/api/src/realtime/`
 * alongside `socket.ts`, matching this plan's flat-module-file convention.
 */
export const BROWSER_SYNC_EVENTS = {
  QUEUE_BOARD_SYNC: 'browser:queue-board-sync',
  BILLING_WORKBENCH_SYNC: 'browser:billing-workbench-sync',
} as const;

export type BrowserSyncEvent = (typeof BROWSER_SYNC_EVENTS)[keyof typeof BROWSER_SYNC_EVENTS];

/**
 * D-40/D-43: the inline refresh metadata every browser-sync event and every
 * browser workbench row carries -- never a blanket "something changed" flag.
 *
 * - `staleVersion`: the changed record's `updatedAt`, as epoch milliseconds.
 *   A browser workbench compares this against the version it last rendered
 *   to decide `fresh` vs `stale` (D-40) rather than trusting a client-side
 *   guess.
 * - `changedByUser`: D-43/D-24 actor attribution -- a display name when one
 *   is available, the raw user id as a fallback, or `null` when no actor
 *   is known for this change.
 * - `changedAt`: the same instant as `staleVersion`, as an ISO string, for
 *   direct rendering in a banner or row.
 * - `reviewPath`: where the "Review changes" action in `StaleStateBanner`
 *   should take the caller for this specific record.
 */
export interface BrowserSyncChangeMetadata {
  staleVersion: number;
  changedByUser: string | null;
  changedAt: string;
  reviewPath: string;
}
