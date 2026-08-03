import { describe, it } from 'vitest';

describe('Midnight Queue Archive (D-23)', () => {
  it.todo('archives WAITING entries from previous day');
  it.todo('archives DONE entries from previous day');
  it.todo('archives NO_SHOW entries from previous day');
  it.todo('preserves IN_CONSULT entries past midnight (D-39)');
  it.todo('does not archive entries from current day');
  it.todo('sets archivedAt timestamp on archived entries');
});
