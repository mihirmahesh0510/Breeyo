import { describe, it } from 'vitest';

// INV-02: Manual stock adjustments (add/remove) with required reason
describe('Stock adjustment (INV-02)', () => {
  it.todo('adds stock via manual adjustment with a valid reason');
  it.todo('removes stock via manual adjustment with a valid reason');
  it.todo('requires a reason for every adjustment (D-04)');
  it.todo('rejects an adjustment without a reason');
  it.todo('rejects an adjustment with an unknown reason value');
  it.todo('accepts every preset reason (damage, theft, correction, expired_disposal, stock_take, other)');
  it.todo('records an "adjusted" stock movement including the reason');
  it.todo('recalculates the item currentStock after adjustment');
});
