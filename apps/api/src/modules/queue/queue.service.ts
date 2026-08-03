import { checkInSchema, queueStatusUpdateSchema } from '@breeyo/validators';
import { QueueStatus, isValidTransition, SOCKET_EVENTS } from '@breeyo/types';
import type { Server } from 'socket.io';
import { QueueRepository } from './queue.repository.js';
import type {
  CheckInParams,
  UpdateStatusParams,
  CallNextParams,
  GetQueueBoardParams,
} from './queue.types.js';

/** Default estimated consult time in seconds (15 min) when insufficient data */
const DEFAULT_CONSULT_SECONDS = 900;

export class QueueService {
  constructor(
    private readonly repository: QueueRepository,
    private readonly io: Server | null = null,
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

    // Check for existing active entry (WAITING or IN_CONSULT)
    const activeEntry = await this.repository.findTodayActiveEntryForPet(
      params.clinicId,
      parsed.petId,
      today,
    );

    if (activeEntry) {
      const error = new Error('Pet is already in today\'s queue') as Error & { statusCode: number; code: string };
      error.statusCode = 409;
      error.code = 'ALREADY_IN_QUEUE';
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

    const entry = await this.repository.createEntry({
      clinicId: params.clinicId,
      petId: parsed.petId,
      checkedInBy: params.userId,
      status: 'WAITING',
      position: waitingCount + 1,
      isEmergency: parsed.isEmergency,
      visitReason: parsed.visitReason,
    });

    // Broadcast to clinic room
    this.broadcast(params.clinicId, SOCKET_EVENTS.PATIENT_CHECKED_IN, {
      entry,
      timestamp: Date.now(),
    });

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

    if (parsed.status === QueueStatus.DONE || parsed.status === QueueStatus.NO_SHOW) {
      updateData.completedAt = new Date();
    }

    const updated = await this.repository.updateEntry(params.entryId, updateData);

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
      inConsult: board.inConsult,
      waiting: waitingWithEstimates,
      done: board.done,
    };
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
