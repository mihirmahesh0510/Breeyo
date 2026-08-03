import type { CheckInInput, QueueStatus } from '@breeyo/types';

export interface CheckInParams extends CheckInInput {
  clinicId: string;
  userId: string;
  reCheckIn?: boolean;
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
