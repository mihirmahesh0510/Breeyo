import { describe, it } from 'vitest';

// INV-05: FIFO dispensing with manual override and expired-batch blocking
describe('FIFO dispense (INV-05)', () => {
  it.todo('dispenses from the oldest non-expired batch first (FIFO, D-22)');
  it.todo('cascades to the next batch when the oldest batch is insufficient');
  it.todo('blocks dispensing from an expired batch (D-25)');
  it.todo('allows a manual batch override even if it is not the oldest (D-22)');
  it.todo('returns an insufficient stock error when total stock is below requested quantity');
  it.todo('records a "dispensed" stock movement per batch deducted');
  it.todo('links a dispense to a consultationId when called from EMR (D-35)');
  it.todo('allows a standalone counter-sale dispense with no consultationId (D-52)');
  it.todo('snapshots unitPrice from item.sellingPrice at dispense time (D-60)');
  it.todo('accepts an optional ownerId for counter-sale attribution (D-60)');
});
