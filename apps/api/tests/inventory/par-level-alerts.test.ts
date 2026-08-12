import { describe, it } from 'vitest';

// INV-06: Par-level, expiring, and expired alerts
describe('Par level and expiry alerts (INV-06)', () => {
  it.todo('detects items with currentStock below parLevel');
  it.todo('excludes items with no par level set (D-06)');
  it.todo('computes stock level status (healthy/warning/critical) from thresholds');
  it.todo('finds batches expiring within the configured lead time (D-21, D-55)');
  it.todo('finds batches that have already expired (isExpired = true)');
  it.todo('respects the clinic-configured expiry lead time (15/30/60/90 days, D-55)');
});
