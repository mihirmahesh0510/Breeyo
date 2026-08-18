export enum QueueStatus {
  EXPECTED = 'EXPECTED',
  WAITING = 'WAITING',
  IN_CONSULT = 'IN_CONSULT',
  DONE = 'DONE',
  NO_SHOW = 'NO_SHOW',
}

export const QUEUE_TRANSITIONS: Record<QueueStatus, QueueStatus[]> = {
  [QueueStatus.EXPECTED]: [QueueStatus.WAITING, QueueStatus.NO_SHOW],
  [QueueStatus.WAITING]: [QueueStatus.IN_CONSULT, QueueStatus.NO_SHOW],
  [QueueStatus.IN_CONSULT]: [QueueStatus.DONE, QueueStatus.NO_SHOW],
  [QueueStatus.DONE]: [],
  [QueueStatus.NO_SHOW]: [],
};

export function isValidTransition(from: QueueStatus, to: QueueStatus): boolean {
  return QUEUE_TRANSITIONS[from]?.includes(to) ?? false;
}

export const QUEUE_STATUS_LABELS: Record<QueueStatus, string> = {
  [QueueStatus.EXPECTED]: 'Expected',
  [QueueStatus.WAITING]: 'Waiting',
  [QueueStatus.IN_CONSULT]: 'In Consult',
  [QueueStatus.DONE]: 'Done',
  [QueueStatus.NO_SHOW]: 'No Show',
};

export const CLOSED_QUEUE_STATUSES = [QueueStatus.DONE, QueueStatus.NO_SHOW] as const;
export const ACTIVE_QUEUE_STATUSES = [QueueStatus.EXPECTED, QueueStatus.WAITING, QueueStatus.IN_CONSULT] as const;
