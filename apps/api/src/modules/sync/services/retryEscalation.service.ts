import { ConflictSeverity, ResolutionState } from '@breeyo/types';

export type RetryEscalationRecordKind = 'CONFLICT' | 'FAILURE_TASK';

export interface RetryEscalationConflictRow {
  id: string;
  clinicId: string;
  severity: ConflictSeverity;
  currentOwnerUserId: string;
  guidedRetryCount: number;
  resolutionState: ResolutionState;
}

/** `SyncFailureTask` has no `severity` column at all -- a raw envelope-validation failure is never itself clinical/operational, so there is no clinician hand-off concept for this table (see `recordGuidedRetryFailure`'s header). */
export interface RetryEscalationTaskRow {
  id: string;
  clinicId: string;
  currentOwnerUserId: string;
  guidedRetryCount: number;
  resolutionState: ResolutionState;
}

/**
 * Minimal Prisma delegate surface this service needs, kept local rather
 * than importing the generated client directly -- matches
 * `ReplayIngestPrismaClient`'s convention in `replayIngest.service.ts`.
 */
export interface RetryEscalationPrismaClient {
  syncConflictRecord: {
    findUnique(args: { where: { id: string } }): Promise<RetryEscalationConflictRow | null>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<RetryEscalationConflictRow>;
  };
  syncFailureTask: {
    findUnique(args: { where: { id: string } }): Promise<RetryEscalationTaskRow | null>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<RetryEscalationTaskRow>;
  };
}

/**
 * D-36: resolves "who else is on duty right now" for a clinic, excluding a
 * specific (unreachable) clinician. Injected rather than implemented here
 * so this service stays free of any real staff-roster/RBAC query -- see
 * `apps/api/src/modules/scheduling/availability.repository.ts`'s
 * `listClinicVets` for the concrete Clinician-role query a real
 * implementation composes this from. Every real implementation MUST
 * exclude Admin-role members -- D-36 explicitly rules out ever falling
 * back to Admin.
 */
export interface OnDutyRosterProvider {
  listOtherOnDutyClinicianIds(clinicId: string, excludeUserId: string): Promise<string[]>;
}

/**
 * verify-fix 10.6: `statusCode` defaults to 409 (an invalid-state-transition
 * attempt is a conflict, matching `resolutionError`'s convention in
 * `consultationConflictResolution.service.ts`) so the centralized
 * `error-handler.ts` can surface a real 4xx instead of every one of these
 * collapsing into a generic 500 "unexpected error" once a live route calls
 * this service directly.
 */
function retryEscalationError(
  message: string,
  code = 'RETRY_ESCALATION_INVALID_STATE',
  statusCode = 409,
): Error & { code: string; statusCode: number } {
  const error = new Error(message) as Error & { code: string; statusCode: number };
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

/**
 * verify-fix 10.6: the D-24/D-36 "who else is on duty" resolution, factored
 * out of the class so `ConsultationConflictResolutionService`'s own ESCALATE
 * action (verify-fix 10.5) can reuse the EXACT SAME roster-exhaustion/never-
 * Admin behavior instead of hand-rolling a second copy of it. Kept as a
 * plain exported function (not a class method) so it carries no dependency
 * on `RetryEscalationPrismaClient` or either row shape.
 */
export async function resolveNextOnDutyClinicianId(
  onDutyRosterProvider: OnDutyRosterProvider | undefined,
  clinicId: string,
  excludeUserId: string,
): Promise<string> {
  if (!onDutyRosterProvider) {
    throw retryEscalationError(
      'An on-duty roster provider is required to escalate a SAFETY_CRITICAL item to a clinician (D-24, D-36)',
      'ROSTER_PROVIDER_REQUIRED',
      500,
    );
  }
  const candidates = await onDutyRosterProvider.listOtherOnDutyClinicianIds(clinicId, excludeUserId);
  if (candidates.length === 0) {
    throw retryEscalationError(
      'No other on-duty clinician is available to escalate to -- per D-36 this never falls back to Admin and never stalls silently',
      'NO_ON_DUTY_CLINICIAN_AVAILABLE',
      409,
    );
  }
  return candidates[0];
}

/**
 * Guided retry -> escalation ownership service (Plan 10-05 Task 2, D-22 to
 * D-24, D-36, D-10). This is an OWNERSHIP-only state machine: it never
 * reads or writes `ReplayPriority` (neither row type this service touches
 * even has a priority column) -- D-37 is enforced structurally, not just by
 * convention, because there is nothing here for an escalation to preempt
 * with.
 *
 * Two kinds of unresolved item share the same `OPEN -> GUIDED_RETRY ->
 * ESCALATED -> RESOLVED` ladder (`ResolutionState`, `@breeyo/types`):
 *
 *  - A `SyncFailureTask` (a replay envelope that never even parsed) always
 *    stays owned by the originating user (D-22) -- there is no clinician
 *    concept for a raw envelope failure, so a failed guided retry here just
 *    marks it ESCALATED into the failure center's "Operational review"
 *    section, ownership unchanged (D-10's lighter review).
 *  - A `SyncConflictRecord` already carries its own accountable owner from
 *    creation (`replayIngest.service.ts`'s `ingestOneConflict`): the
 *    assigned clinician for `SAFETY_CRITICAL` (D-09), or the originating
 *    user for `OPERATIONAL`. Only the `SAFETY_CRITICAL` case escalates to a
 *    DIFFERENT clinician on a failed guided retry (D-24) -- and, per D-36,
 *    keeps escalating to yet another on-duty clinician if that one is also
 *    unreachable, rather than falling back to Admin or leaving the item
 *    pinned to someone who is not acting on it.
 */
export class RetryEscalationService {
  constructor(
    private readonly db: RetryEscalationPrismaClient,
    private readonly onDutyRosterProvider?: OnDutyRosterProvider,
  ) {}

  private async getRow(
    kind: RetryEscalationRecordKind,
    id: string,
  ): Promise<RetryEscalationConflictRow | RetryEscalationTaskRow> {
    const row =
      kind === 'CONFLICT'
        ? await this.db.syncConflictRecord.findUnique({ where: { id } })
        : await this.db.syncFailureTask.findUnique({ where: { id } });
    if (!row) {
      throw retryEscalationError(`No ${kind === 'CONFLICT' ? 'conflict' : 'failure task'} found for id "${id}"`, 'NOT_FOUND', 404);
    }
    return row;
  }

  /**
   * WR-6: exposes just enough of `getRow` for the controller to run the
   * owner-only authorization check (`request.user.id ===
   * currentOwnerUserId`) BEFORE calling `assignOriginatingUserRetry` or
   * `escalate` -- both of those are mutating state transitions with no
   * caller-identity parameter of their own, so any authenticated staff
   * member in the clinic (RLS only scopes by `clinicId`, not by owner)
   * could otherwise retry/escalate a row currently assigned to a different
   * clinician, including a `SAFETY_CRITICAL` conflict. Still resolves
   * through the same `getRow` (so tenant isolation / NOT_FOUND behavior for
   * a cross-clinic id is unchanged) rather than a second hand-rolled query.
   */
  async getCurrentOwnerUserId(kind: RetryEscalationRecordKind, id: string): Promise<string> {
    const row = await this.getRow(kind, id);
    return row.currentOwnerUserId;
  }

  private async updateRow(
    kind: RetryEscalationRecordKind,
    id: string,
    data: Record<string, unknown>,
  ): Promise<RetryEscalationConflictRow | RetryEscalationTaskRow> {
    return kind === 'CONFLICT'
      ? this.db.syncConflictRecord.update({ where: { id }, data })
      : this.db.syncFailureTask.update({ where: { id }, data });
  }

  /**
   * D-22/D-09: advances OPEN -> GUIDED_RETRY. Ownership is NOT reassigned
   * here -- the row's `currentOwnerUserId` was already resolved to the
   * correct first-retry owner at creation time (the originating user for a
   * failure task or an OPERATIONAL conflict; the assigned clinician for a
   * SAFETY_CRITICAL conflict, per D-09). This method only records that a
   * guided retry attempt is now in flight.
   */
  async assignOriginatingUserRetry(
    kind: RetryEscalationRecordKind,
    id: string,
  ): Promise<RetryEscalationConflictRow | RetryEscalationTaskRow> {
    const row = await this.getRow(kind, id);
    if (row.resolutionState !== ResolutionState.OPEN) {
      throw retryEscalationError(`Cannot start a guided retry from resolution state "${row.resolutionState}" (must be OPEN)`);
    }
    return this.updateRow(kind, id, { resolutionState: ResolutionState.GUIDED_RETRY });
  }

  /**
   * D-23: a guided retry failed. Every item moves to ESCALATED regardless
   * of kind/severity -- D-23 is explicit that escalation is automatic after
   * a failed guided retry, "not immediately and not only by manual
   * handoff." What differs is ownership:
   *
   *  - SAFETY_CRITICAL conflict: the clinician whose own guided retry just
   *    failed is, by definition, not resolving it -- D-24/D-36 hand off to
   *    a DIFFERENT on-duty clinician (never back to the same one, never to
   *    Admin, never left stalled with nobody able to act).
   *  - Everything else (a plain failure task, or an OPERATIONAL conflict):
   *    D-10's lighter review applies -- ownership is left as-is; the item
   *    surfaces in the failure center's "Operational review" section
   *    rather than paging a clinician.
   */
  async recordGuidedRetryFailure(
    kind: RetryEscalationRecordKind,
    id: string,
  ): Promise<RetryEscalationConflictRow | RetryEscalationTaskRow> {
    const row = await this.getRow(kind, id);
    if (row.resolutionState !== ResolutionState.GUIDED_RETRY) {
      throw retryEscalationError(
        `Cannot record a guided-retry failure from resolution state "${row.resolutionState}" (must be GUIDED_RETRY)`,
      );
    }

    const guidedRetryCount = row.guidedRetryCount + 1;
    const isSafetyCriticalConflict = kind === 'CONFLICT' && (row as RetryEscalationConflictRow).severity === ConflictSeverity.SAFETY_CRITICAL;

    if (!isSafetyCriticalConflict) {
      return this.updateRow(kind, id, { guidedRetryCount, resolutionState: ResolutionState.ESCALATED });
    }

    const nextOwnerUserId = await this.resolveNextOnDutyClinician(row.clinicId, row.currentOwnerUserId);
    return this.updateRow(kind, id, {
      guidedRetryCount,
      resolutionState: ResolutionState.ESCALATED,
      currentOwnerUserId: nextOwnerUserId,
    });
  }

  /**
   * D-36: the item is already ESCALATED, and the clinician it was handed to
   * is ALSO unreachable or their shift has ended before acting. Moves it to
   * yet another on-duty clinician -- this is the "escalates further" half
   * of D-36, distinct from `recordGuidedRetryFailure`'s first escalation.
   */
  async reassignUnreachableEscalatedOwner(
    kind: RetryEscalationRecordKind,
    id: string,
  ): Promise<RetryEscalationConflictRow | RetryEscalationTaskRow> {
    const row = await this.getRow(kind, id);
    if (row.resolutionState !== ResolutionState.ESCALATED) {
      throw retryEscalationError(`Cannot reassign an unreachable owner from resolution state "${row.resolutionState}" (must be ESCALATED)`);
    }
    const isSafetyCriticalConflict = kind === 'CONFLICT' && (row as RetryEscalationConflictRow).severity === ConflictSeverity.SAFETY_CRITICAL;
    if (!isSafetyCriticalConflict) {
      throw retryEscalationError('Only a SAFETY_CRITICAL conflict reassigns to another on-duty clinician (D-24 scopes clinician hand-off to safety-critical items)');
    }

    const nextOwnerUserId = await this.resolveNextOnDutyClinician(row.clinicId, row.currentOwnerUserId);
    return this.updateRow(kind, id, { currentOwnerUserId: nextOwnerUserId });
  }

  private async resolveNextOnDutyClinician(clinicId: string, excludeUserId: string): Promise<string> {
    return resolveNextOnDutyClinicianId(this.onDutyRosterProvider, clinicId, excludeUserId);
  }

  /**
   * verify-fix 10.6: single entry point a live route calls without needing
   * to know in advance which of the two ESCALATED-bound transitions applies
   * -- a first escalation out of a failed guided retry
   * (`recordGuidedRetryFailure`, starts from `GUIDED_RETRY`) or an
   * already-`ESCALATED` item's further hand-off to yet another clinician
   * because the first one is ALSO unreachable (D-36,
   * `reassignUnreachableEscalatedOwner`, starts from `ESCALATED`). Peeks the
   * row's current state to dispatch to the correct one; any other starting
   * state still rejects exactly as the underlying method already does.
   */
  async escalate(
    kind: RetryEscalationRecordKind,
    id: string,
  ): Promise<RetryEscalationConflictRow | RetryEscalationTaskRow> {
    const row = await this.getRow(kind, id);
    if (row.resolutionState === ResolutionState.ESCALATED) {
      return this.reassignUnreachableEscalatedOwner(kind, id);
    }
    return this.recordGuidedRetryFailure(kind, id);
  }
}
