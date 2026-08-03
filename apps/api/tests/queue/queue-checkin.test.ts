import { describe, it } from 'vitest';

describe('Queue Check-in (QUE-01)', () => {
  it.todo('creates queue entry for a pet');
  it.todo('assigns correct position based on waiting count');
  it.todo('sets emergency flag when isEmergency is true (D-15)');
  it.todo('records visit reason if provided (D-14)');
  it.todo('records checkedInBy user ID');
  it.todo('rejects check-in if pet is already in todays queue with WAITING or IN_CONSULT status');
  it.todo('allows re-check-in if pet was already DONE today with confirmation flag (D-40)');
});
