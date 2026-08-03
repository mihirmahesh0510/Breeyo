import type { QueueStatus } from './constants/queue-status.js';

export interface QueueEntry {
  id: string;
  clinicId: string;
  petId: string;
  checkedInBy: string;
  treatingVetId: string | null;
  status: QueueStatus;
  position: number;
  isEmergency: boolean;
  visitReason: string | null;
  checkedInAt: Date;
  calledAt: Date | null;
  completedAt: Date | null;
  archivedAt: Date | null;
  updatedAt: Date;
}

export interface QueueEntryWithPet extends QueueEntry {
  pet: {
    id: string;
    name: string;
    species: string;
    owner: {
      id: string;
      name: string;
      mobile: string;
    };
  };
}

export interface QueueBoard {
  inConsult: QueueEntryWithPet[];
  waiting: QueueEntryWithPet[];
  done: QueueEntryWithPet[];
}

export interface CheckInInput {
  petId: string;
  visitReason?: string;
  isEmergency?: boolean;
}

export interface QueueStatusUpdate {
  status: QueueStatus;
}

export interface CallNextResult {
  entry: QueueEntryWithPet;
  updatedBy: string;
}
