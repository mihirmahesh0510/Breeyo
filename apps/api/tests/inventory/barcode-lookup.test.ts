import { describe, it } from 'vitest';

// INV-03: Barcode scanning and lookup
describe('Barcode lookup (INV-03)', () => {
  it.todo('lookup by a known barcode returns the linked item');
  it.todo('lookup by an unknown barcode returns not found (D-14)');
  it.todo('multiple barcodes linked to the same item all resolve to that item (D-16)');
  it.todo('lookup by a barcode already linked to a different item returns a structured conflict, not the wrong item (D-63)');
  it.todo('adding a barcode already linked elsewhere does not relink it (D-63)');
});
