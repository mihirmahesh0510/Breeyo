import { describe, it } from 'vitest';

describe('Queue Board', () => {
  describe('get queue board', () => {
    it.todo('returns entries grouped by status: inConsult, waiting, done');
    it.todo('waiting entries ordered by isEmergency desc, checkedInAt asc');
    it.todo('excludes archived entries');
    it.todo('includes pet and owner info on each entry');
  });

  describe('queue position and estimated wait (QUE-03)', () => {
    it.todo('computes position dynamically based on WAITING entries ahead');
    it.todo('emergency patients are position 1 regardless of check-in time');
    it.todo('estimated wait = position x rolling 7-day average consultation time');
    it.todo('defaults to 15 min per consultation when fewer than 5 data points');
  });

  describe('call next (QUE-05)', () => {
    it.todo('selects oldest WAITING entry');
    it.todo('selects emergency patients before non-emergency (FIFO within each group)');
    it.todo('transitions selected entry to IN_CONSULT');
    it.todo('assigns treating vet to the entry (D-37)');
    it.todo('returns 404 when no patients waiting');
  });
});
