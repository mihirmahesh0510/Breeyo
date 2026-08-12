import { describe, it } from 'vitest';

// D-45/D-46: Stock movement logging and chronological timeline
describe('Stock movement history (D-45, D-46)', () => {
  it.todo('records a "received" movement with the correct running total');
  it.todo('records a "dispensed" movement with the correct running total');
  it.todo('records an "adjusted" movement with reason attached');
  it.todo('records a "disposed" movement for expired stock disposal');
  it.todo('records a "stock_take" movement for count corrections');
  it.todo('records a "returned" movement for return-to-stock (D-51, D-57)');
  it.todo('returns movements in chronological order, newest first (D-46)');
  it.todo('computes a monotonically consistent running total across movements');
  it.todo('exports movement history as CSV (D-47)');
});
