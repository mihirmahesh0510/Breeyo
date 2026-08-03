import { describe, it } from 'vitest';

describe('Queue Status Transitions (QUE-04)', () => {
  it.todo('transitions WAITING -> IN_CONSULT');
  it.todo('transitions IN_CONSULT -> DONE');
  it.todo('transitions WAITING -> NO_SHOW (long-press)');
  it.todo('transitions IN_CONSULT -> NO_SHOW');
  it.todo('rejects invalid transition WAITING -> DONE');
  it.todo('rejects invalid transition DONE -> WAITING (terminal state)');
  it.todo('rejects invalid transition NO_SHOW -> WAITING (terminal state)');
  it.todo('sets treatingVetId on transition to IN_CONSULT (D-37)');
  it.todo('sets calledAt timestamp on transition to IN_CONSULT');
  it.todo('sets completedAt timestamp on transition to DONE or NO_SHOW');
});
