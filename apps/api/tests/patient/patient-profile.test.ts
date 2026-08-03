import { describe, it } from 'vitest';

describe('Pet Profile (PAT-05)', () => {
  it.todo('returns pet with owner info and visit history');
  it.todo('visit history sorted newest first (D-31)');
  it.todo('visit history scoped to current clinic only (D-29)');
  it.todo('returns empty visit history for new pet');
});

describe('Update Pet Profile (D-30)', () => {
  it.todo('updates pet optional fields');
  it.todo('does not allow changing pet to different owner');
});

describe('Lookup by Mobile (QUE-06)', () => {
  it.todo('finds owner and all pets by mobile number');
  it.todo('returns 404 for unregistered mobile');
});
