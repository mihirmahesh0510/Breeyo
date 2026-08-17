import type { QueueEntryStatus } from '@prisma/client';
import type { CheckInInput, QueueStatus } from '@breeyo/types';

export interface CheckInParams extends CheckInInput {
  clinicId: string;
  userId: string;
  reCheckIn?: boolean;
}

/**
 * Params consumed by `QueueRepository.createEntry`. `queuePriorityAt` and
 * `appointmentId` are typed here (rather than inline in queue.repository.ts)
 * so plan 08-09's handoff pass can pass them through typed params instead of
 * casting.
 */
export interface CreateEntryParams {
  clinicId: string;
  petId: string;
  checkedInBy: string;
  status: QueueEntryStatus;
  position: number;
  isEmergency: boolean;
  visitReason?: string;
  // Phase 8 (D-08, D-10): defaults to `new Date()` in the repository when
  // omitted (an organic walk-in); a sweep-created EXPECTED row passes
  // `appointment.scheduledFor` explicitly instead.
  queuePriorityAt?: Date;
  // Phase 8 (D-08, D-28): links a sweep-created EXPECTED row back to the
  // appointment it came from.
  appointmentId?: string | null;
}

export interface UpdateStatusParams {
  clinicId: string;
  entryId: string;
  status: QueueStatus;
  userId: string;
}

export interface CallNextParams {
  clinicId: string;
  userId: string;
}

export interface GetQueueBoardParams {
  clinicId: string;
  date?: Date;
}
