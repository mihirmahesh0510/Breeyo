import { checkInSchema, queueStatusUpdateSchema } from '@breeyo/validators';
import { QueueStatus, isValidTransition, SOCKET_EVENTS } from '@breeyo/types';
import type { Server } from 'socket.io';
import { staleWriteConflictError } from '../../realtime/browser-sync.service.js';
import { QueueRepository } from './queue.repository.js';
import type {
  CheckInParams,
  UpdateStatusParams,
  CallNextParams,
  GetQueueBoardParams,
} from './queue.types.js';
import type { PushTriggerService } from '../scheduling/push-trigger.service.js';

/** Default estimated consult time in seconds (15 min) when insufficient data */
const DEFAULT_CONSULT_SECONDS = 900;

export class QueueService {
  constructor(
    private readonly repository: QueueRepository,
    private readonly io: Server | null = null,
    // Phase 8 (D-27 trigger 3): optional so every pre-existing
    // `new QueueService(repository, io)` call site and unit test keeps
    // compiling and behaving unchanged when omitted.
    private readonly pushTriggers: PushTriggerService | null = null,
  ) {}

  /**
   * Checks in a pet to the queue.
   * QUE-01: 2-tap check-in flow.
   */
  async checkIn(params: CheckInParams) {
    const parsed = checkInSchema.parse({
      petId: params.petId,
      visitReason: params.visitReason,
      isEmergency: params.isEmergency,
    });

    const today = QueueRepository.getTodayIST();

    // D-30: the pet must belong to the calling clinic. RLS hides other
    // clinics' pets from the tenant handle, so without this check the insert
    // fails on the invisible relation and surfaces as a 500 instead of a
    // clean 404. Explicit filter first, RLS as the backstop.
    const pet = await this.repository.findPetInClinic(params.clinicId, parsed.petId);

    if (!pet) {
      const error = new Error('Pet not found') as Error & { statusCode: number; code: string };
      error.statusCode = 404;
      error.code = 'PET_NOT_FOUND';
      throw error;
    }

    // D-40: Same-day re-check-in detection
    if (!params.reCheckIn) {
      const doneEntry = await this.repository.findTodayDoneEntryForPet(
        params.clinicId,
        parsed.petId,
        today,
      );

      if (doneEntry) {
        const error = new Error('Pet was already seen today. Set reCheckIn flag to confirm.') as Error & { statusCode: number; code: string };
        error.statusCode = 409;
        error.code = 'SAME_DAY_RECHECK';
        throw error;
      }
    }

    // Assign position: waiting count + 1
    const waitingCount = await this.repository.countWaiting(params.clinicId, today);

    // The active-entry check and the create run under one advisory lock
    // (queue-checkin-handoff-race fix) -- without it, this check-in could
    // race the sweep's appointment handoff pass for the same pet's now-due
    // appointment, both observing "no active entry" before either commits.
    const { entry, existingActive } = await this.repository.createEntryIfNoneActive(
      params.clinicId,
      parsed.petId,
      today,
      {
        clinicId: params.clinicId,
        petId: parsed.petId,
        checkedInBy: params.userId,
        status: 'WAITING',
        position: waitingCount + 1,
        isEmergency: parsed.isEmergency,
        visitReason: parsed.visitReason,
        // D-08/D-10: for an organic walk-in, priority time and physical
        // check-in time are the same instant.
        queuePriorityAt: new Date(),
      },
    );

    if (existingActive || !entry) {
      const error = new Error('Pet is already in today\'s queue') as Error & { statusCode: number; code: string };
      error.statusCode = 409;
      error.code = 'ALREADY_IN_QUEUE';
      throw error;
    }

    // Broadcast to clinic room
    this.broadcast(params.clinicId, SOCKET_EVENTS.PATIENT_CHECKED_IN, {
      entry,
      timestamp: Date.now(),
    });

    // D-27 trigger 3: check whether this check-in just crossed (or is still
    // past) the backlog threshold. Wrapped in try/catch -- a notification
    // failure must never fail the check-in that triggered it (RESEARCH
    // Pitfall 5 / T-08-45).
    if (this.pushTriggers) {
      try {
        const oldestWaiting = await this.repository.findOldestWaiting(params.clinicId, today);
        const longestWaitMinutes = oldestWaiting
          ? Math.max(0, Math.round((Date.now() - oldestWaiting.queuePriorityAt.getTime()) / 60000))
          : 0;
        // This check-in's own entry is already WAITING (created above), so
        // the post-check-in waiting count is waitingCount + 1.
        await this.pushTriggers.notifyQueueBacklog(params.clinicId, waitingCount + 1, longestWaitMinutes);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('QueueService.checkIn: backlog push trigger failed', err);
      }
    }

    return entry;
  }

  /**
   * Updates a queue entry's status.
   * QUE-04: State machine validated transitions.
   */
  async updateStatus(params: UpdateStatusParams) {
    const parsed = queueStatusUpdateSchema.parse({ status: params.status });

    const entry = await this.repository.findEntryById(params.entryId);
    if (!entry) {
      const error = new Error('Queue entry not found') as Error & { statusCode: number; code: string };
      error.statusCode = 404;
      error.code = 'ENTRY_NOT_FOUND';
      throw error;
    }

    // Validate transition using state machine
    const fromStatus = entry.status as unknown as QueueStatus;
    const toStatus = parsed.status as unknown as QueueStatus;

    if (!isValidTransition(fromStatus, toStatus)) {
      const error = new Error(`Cannot transition from ${entry.status} to ${parsed.status}`) as Error & { statusCode: number; code: string };
      error.statusCode = 400;
      error.code = 'INVALID_TRANSITION';
      throw error;
    }

    // Build update data based on target status
    const updateData: Record<string, unknown> = {
      status: parsed.status,
    };

    if (parsed.status === QueueStatus.IN_CONSULT) {
      updateData.treatingVetId = params.userId;
      updateData.calledAt = new Date();
    }

    if (parsed.status === QueueStatus.WAITING) {
      // D-10/D-11: the only edge into WAITING is EXPECTED -> WAITING (a
      // sweep-created row whose checkedInAt is still its creation instant,
      // not the patient's physical arrival time), so stamp checkedInAt with
      // the real arrival instant here. Do NOT touch queuePriorityAt: it
      // stays pinned to the slot time set at creation, which is exactly
      // what makes D-10 hold for an early check-in (D-11). "Fixing" it to
      // the arrival time here would silently delete the ordering feature.
      updateData.checkedInAt = new Date();

      // The entry entered the board as EXPECTED with position 0 (Task 3);
      // now that it is physically in the walk-in line, give it a real
      // position at the back of today's WAITING queue.
      const today = QueueRepository.getTodayIST();
      const waitingCount = await this.repository.countWaiting(entry.clinicId, today);
      updateData.position = waitingCount + 1;
    }

    if (parsed.status === QueueStatus.DONE || parsed.status === QueueStatus.NO_SHOW) {
      updateData.completedAt = new Date();
    }

    const updated =
      params.expectedVersion === undefined
        ? await this.repository.updateEntry(params.entryId, updateData)
        : await this.repository.updateEntry(params.entryId, updateData, params.expectedVersion);

    if (updated === null) {
      const current = await this.repository.findEntryById(params.entryId);
      if (current) {
        throw staleWriteConflictError({
          domain: 'queue',
          entityType: 'QUEUE_ENTRY',
          entityId: params.entryId,
          currentVersion: current.updatedAt.getTime(),
          expectedVersion: params.expectedVersion!,
        });
      }
      const error = new Error('Queue entry not found') as Error & { statusCode: number; code: string };
      error.statusCode = 404;
      error.code = 'ENTRY_NOT_FOUND';
      throw error;
    }

    // Broadcast status change
    this.broadcast(entry.clinicId, SOCKET_EVENTS.QUEUE_UPDATED, {
      entry: updated,
      updatedBy: params.userId,
      timestamp: Date.now(),
    });

    return updated;
  }

  /**
   * Calls the next patient in the queue.
   * QUE-05: Emergency patients prioritized.
   */
  async callNext(params: CallNextParams) {
    const today = QueueRepository.getTodayIST();

    const next = await this.repository.findNextWaiting(params.clinicId, today);
    if (!next) {
      const error = new Error('No patients waiting in queue') as Error & { statusCode: number; code: string };
      error.statusCode = 404;
      error.code = 'NO_PATIENTS_WAITING';
      throw error;
    }

    return this.updateStatus({
      clinicId: params.clinicId,
      entryId: next.id,
      status: QueueStatus.IN_CONSULT,
      userId: params.userId,
    });
  }

  /**
   * Returns the queue board grouped by status with computed positions and estimated wait.
   * QUE-03: Queue position and estimated wait.
   */
  async getQueueBoard(params: GetQueueBoardParams) {
    const today = QueueRepository.getTodayIST(params.date);

    const board = await this.repository.getQueueBoard(params.clinicId, today);

    // Get average consult duration (last 7 days)
    const avgSeconds = await this.repository.getAverageConsultDuration(
      params.clinicId,
      7,
    );

    const consultDuration = avgSeconds ?? DEFAULT_CONSULT_SECONDS;

    // Compute dynamic positions and estimated wait for waiting entries
    const waitingWithEstimates = board.waiting.map((entry, index) => ({
      ...entry,
      computedPosition: index + 1,
      estimatedWaitSeconds: Math.round((index + 1) * consultDuration),
    }));

    return {
      // D-08/D-13: passed through untransformed -- an EXPECTED entry hasn't
      // checked in yet, so it has no computed position or estimated wait.
      expected: board.expected,
      inConsult: board.inConsult,
      waiting: waitingWithEstimates,
      done: board.done,
    };
  }

  /**
   * Archives WAITING/DONE/NO_SHOW entries checked in before today, scoped
   * to the calling clinic (the global midnight sweep calls the repository
   * directly with no clinicId).
   * D-23: IN_CONSULT entries persist past midnight, everything else archives.
   */
  async archiveOldEntries(clinicId: string) {
    return this.repository.archiveEntries(QueueRepository.getTodayIST(), clinicId);
  }

  /**
   * D-28: removes a stale EXPECTED queue entry for an appointment that was
   * just cancelled or rescheduled, so the board updates immediately instead
   * of waiting for the grace-window sweep to flip it to NO_SHOW. Called by
   * plan 08-07's cancel/reschedule handlers and plan 08-11's wiring. A
   * queue entry that has already progressed past EXPECTED (the patient
   * physically arrived through some other path) is never touched -- when
   * the repository deletes nothing, this does nothing further, no error.
   */
  async removeExpectedEntryForAppointment(clinicId: string, appointmentId: string): Promise<void> {
    const deletedCount = await this.repository.deleteExpectedEntryForAppointment(clinicId, appointmentId);

    if (deletedCount > 0) {
      this.broadcast(clinicId, SOCKET_EVENTS.QUEUE_UPDATED, {
        appointmentId,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Broadcasts an event to all clients in a clinic room.
   */
  private broadcast(clinicId: string, event: string, data: unknown) {
    if (this.io) {
      this.io.to(`clinic:${clinicId}`).emit(event, data);
    }
  }
}
