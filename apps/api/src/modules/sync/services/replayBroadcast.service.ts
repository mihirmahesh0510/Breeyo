import type { Server } from 'socket.io';

/**
 * Scoped replay-broadcast events (Plan 10-05 Task 2, T-10-09). Deliberately
 * NOT added to `@breeyo/types`'s shared `SOCKET_EVENTS` -- these exist only
 * to invalidate/prompt active BROWSER views after a mobile replay lands,
 * mirroring `apps/api/src/realtime/socket.events.ts`'s `BROWSER_SYNC_EVENTS`
 * (whose own header documents the same "browser-only, not the shared
 * mobile contract" reasoning) rather than widening a contract mobile
 * clients would also need to parse.
 */
export const REPLAY_BROADCAST_EVENTS = {
  REPLAY_APPLIED: 'replay:applied',
  REPLAY_CONFLICT_OPENED: 'replay:conflict-opened',
  REPLAY_FAILURE_ESCALATED: 'replay:failure-escalated',
} as const;

export type ReplayBroadcastEvent = (typeof REPLAY_BROADCAST_EVENTS)[keyof typeof REPLAY_BROADCAST_EVENTS];

/**
 * T-10-09: every broadcast carries only what a browser view needs to decide
 * "does this affect me, and if so what do I re-fetch" -- clinic id (so the
 * room scoping below is never the only guard), the domain (`queue` |
 * `emr` | `inventory`), the specific affected entity ids, and an optional
 * date-window hint for a same-day board that only cares about today. Never
 * the full replayed payload itself -- that would leak another device's
 * unreviewed edit into every open browser tab in the clinic before staff
 * have chosen to look at it.
 */
export interface ReplayBroadcastPayload {
  clinicId: string;
  domain: string;
  entityIds: string[];
  dateWindow?: { from: string; to: string };
}

/**
 * Emits scoped replay-lifecycle events for mobile/web consumers (Plan
 * 10-05 Task 2, D-40-style stale-state prompting). Mirrors
 * `BrowserSyncService`'s `io: Server | null` constructor convention -- every
 * emit is a no-op when `io` is null (unit tests, or a caller with no
 * realtime server), never a thrown error.
 *
 * T-10-09 (Information Disclosure): every emit targets exactly one
 * `clinic:${clinicId}` room, never a bare/global broadcast -- a clinic's
 * replay activity is never visible to a socket connection scoped to a
 * different clinic's room.
 */
export class ReplayBroadcastService {
  constructor(private readonly io: Server | null = null) {}

  /** A replayed operation was applied -- affected views should refresh or, if actively open, prompt D-40-style. */
  emitReplayApplied(payload: ReplayBroadcastPayload): void {
    this.io?.to(`clinic:${payload.clinicId}`).emit(REPLAY_BROADCAST_EVENTS.REPLAY_APPLIED, payload);
  }

  /** A replay produced a new unresolved conflict (D-05 to D-10) -- affected views should show the conflict prompt, not silently keep rendering stale state. */
  emitReplayConflictOpened(payload: ReplayBroadcastPayload): void {
    this.io?.to(`clinic:${payload.clinicId}`).emit(REPLAY_BROADCAST_EVENTS.REPLAY_CONFLICT_OPENED, payload);
  }

  /** A failure/conflict task escalated to a new owner (D-23, D-24, D-36) -- affected views can surface "now with Dr. X" without a page refresh. */
  emitReplayFailureEscalated(payload: ReplayBroadcastPayload): void {
    this.io?.to(`clinic:${payload.clinicId}`).emit(REPLAY_BROADCAST_EVENTS.REPLAY_FAILURE_ESCALATED, payload);
  }
}
