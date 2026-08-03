import { describe, it } from 'vitest';

describe('Queue Real-time (QUE-02)', () => {
  describe('broadcast on check-in', () => {
    it.todo('emits PATIENT_CHECKED_IN event to clinic room on check-in');
    it.todo('event payload includes queue entry with pet and owner');
  });

  describe('broadcast on status change', () => {
    it.todo('emits QUEUE_UPDATED event to clinic room on status transition');
    it.todo('event payload includes updated entry and updatedBy user');
  });

  describe('broadcast on call next', () => {
    it.todo('emits QUEUE_UPDATED event when call-next transitions entry');
  });

  describe('room scoping', () => {
    it.todo('only broadcasts to clients in the same clinic room');
    it.todo('does not leak events to other clinic rooms');
  });
});
