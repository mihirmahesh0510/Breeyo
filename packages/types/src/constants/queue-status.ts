export enum QueueStatus {
  WAITING = 'WAITING',
  IN_CONSULT = 'IN_CONSULT',
  DONE = 'DONE',
  NO_SHOW = 'NO_SHOW',
}

export const QUEUE_TRANSITIONS: Record<QueueStatus, QueueStatus[]> = {
  [QueueStatus.WAITING]: [QueueStatus.IN_CONSULT, QueueStatus.NO_SHOW],
  [QueueStatus.IN_CONSULT]: [QueueStatus.DONE, QueueStatus.NO_SHOW],
  [QueueStatus.DONE]: [],
  [QueueStatus.NO_SHOW]: [],
};

export function isValidTransition(from: QueueStatus, to: QueueStatus): boolean {
  return QUEUE_TRANSITIONS[from]?.includes(to) ?? false;
}

export const QUEUE_STATUS_LABELS: Record<QueueStatus, string> = {
  [QueueStatus.WAITING]: 'Waiting',
  [QueueStatus.IN_CONSULT]: 'In Consult',
  [QueueStatus.DONE]: 'Done',
  [QueueStatus.NO_SHOW]: 'No Show',
};
