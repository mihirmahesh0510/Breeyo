import { describe, it } from 'vitest';

// INV-04: Stock receipt (always creates a new batch, per D-11)
describe('Stock receipt (INV-04)', () => {
  it.todo('receiving stock creates a new batch');
  it.todo('receiving stock never merges into an existing batch (D-11)');
  it.todo('requires expiry date for medicine category (D-27)');
  it.todo('requires expiry date for vaccine category (D-27)');
  it.todo('requires expiry date for lab_consumable category (D-27)');
  it.todo('does not require expiry date for equipment category (D-27)');
  it.todo('lot number is optional on receipt (D-01)');
  it.todo('purchase price is recorded per-batch, not per-item (D-03)');
  it.todo('supplier is optional free text (D-02)');
  it.todo('rejects a receipt with quantity 0 or negative');
  it.todo('increments currentStock on the item after receipt');
  it.todo('records a "received" stock movement with running total');
});
