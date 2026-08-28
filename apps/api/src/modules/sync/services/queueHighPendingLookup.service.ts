/**
 * WR-10 fix: server-side computation of "how many QUEUE_HIGH operations are
 * still outstanding for this clinic/device" for the DOMAIN-SPECIFIC replay
 * endpoints (`/inventory/sync/replay`, `/consultations/sync/replay`) -- the
 * paths the mobile app's real reconnect/replay flow
 * (`buildReplayCycleDeps.ts`'s `REPLAY_PATH_BY_DOMAIN`) actually calls.
 * `replayIngest.service.ts` already gates the generic `/sync/replay`
 * endpoint correctly (Verify-fix 10.7), but real mobile traffic never
 * reaches that endpoint, so `pauseLowerTierReplayForQueue` was effectively
 * dead code until this fix wired it into the endpoints real clients use.
 *
 * `replayIngest.service.ts` can compute `queueHighPendingCount` in-process
 * because the generic endpoint accepts one mixed-domain batch -- a
 * QUEUE_HIGH envelope and a lower-tier envelope can arrive in the SAME
 * call, so it just pre-scans that batch for QUEUE_HIGH envelopes lacking a
 * receipt (see `replayIngest.service.ts` ~130-152). The domain-specific
 * endpoints never receive a mixed batch -- the mobile client always posts
 * exactly one domain's envelope(s) to that domain's own path (`sendOperation`
 * in `buildReplayCycleDeps.ts` sends one envelope at a time to
 * `REPLAY_PATH_BY_DOMAIN[domain]`) -- so there is no in-request QUEUE_HIGH
 * envelope for an inventory or EMR call to inspect.
 *
 * Instead, the calling device reports the operationIds it still has queued
 * locally in the QUEUE_HIGH tier (mobile's `listPendingSyncOperationsByPriority`
 * already tracks exactly this locally) and the server VERIFIES that claim
 * against the shared `SyncReplayReceipt` ledger rather than trusting the
 * raw count or list: any reported id that already has a receipt was already
 * applied and does not count as outstanding. This mirrors
 * `replayIngest.service.ts`'s own "start from the claimed set, shrink it by
 * what already has a receipt" computation, just fed by a client-reported id
 * list instead of a same-batch envelope scan -- the server never just takes
 * the client's word for "N operations are pending" as a bare number.
 */
export interface QueueHighPendingLookupDb {
  syncReplayReceipt: {
    findMany(args: {
      where: { clinicId: string; deviceId: string; operationId: { in: string[] } };
      select: { operationId: true };
    }): Promise<{ operationId: string }[]>;
  };
}

export interface ResolveQueueHighPendingCountParams {
  clinicId: string;
  deviceId: string;
  /** operationIds the calling device claims are still queued locally in the
   *  QUEUE_HIGH tier -- untrusted input, verified below against receipts. */
  candidateOperationIds: string[];
}

export async function resolveQueueHighPendingCount(
  db: QueueHighPendingLookupDb,
  params: ResolveQueueHighPendingCountParams,
): Promise<number> {
  const candidates = Array.from(
    new Set(params.candidateOperationIds.filter((id): id is string => typeof id === 'string' && id.length > 0)),
  );
  if (candidates.length === 0) return 0;

  const receipts = await db.syncReplayReceipt.findMany({
    where: { clinicId: params.clinicId, deviceId: params.deviceId, operationId: { in: candidates } },
    select: { operationId: true },
  });
  const alreadyReceipted = new Set(receipts.map((receipt) => receipt.operationId));
  return candidates.filter((id) => !alreadyReceipted.has(id)).length;
}
