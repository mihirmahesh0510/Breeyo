import { describe, it } from 'vitest';

describe('Patient Search (PAT-04)', () => {
  it.todo('finds owner by exact mobile number');
  it.todo('finds owner by partial name (trigram match)');
  it.todo('finds pet by name');
  it.todo('returns grouped results: owner with their pets');
  it.todo('limits results to 20 by default');
  it.todo('scopes search to current clinic only (RLS)');
  it.todo('handles Hindi/Devanagari names (D-41)');
  it.todo('ranks results by relevance score');
  it.todo('rejects search query shorter than 2 characters');
});
