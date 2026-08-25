// Plan 10-07 (PLT-07): API p95 response-time benchmark.
//
// Boots the REAL Fastify app (`buildTestApp`, same helper every integration
// suite uses) bound to a real ephemeral TCP port on 127.0.0.1, then drives it
// with real `fetch()` calls over the wire -- not `app.inject()` -- so the
// measured duration includes real HTTP/socket overhead, not just in-process
// handler time. That is deliberate: PLT-07's 500ms p95 target is a
// user-facing budget, and `app.inject()` skips exactly the layer (actual
// network I/O) that separates "the handler is fast" from "the request is
// fast."
//
// Covers 6 endpoint groups, one per major API module, using routes that
// exist today (verified against each module's routes.ts, not guessed):
//   - auth:      POST /api/v1/auth/login
//   - queue:     GET  /api/v1/queue                        (board read)
//   - emr:       GET  /api/v1/consultations/:consultationId
//   - inventory: POST /api/v1/inventory/items/:itemId/dispense
//   - billing:   GET  /api/v1/billing/invoices
//   - sync:      POST /api/v1/sync/replay                   (empty batch)
//
// Each group fires >=100 sequential requests, sorts durations, and computes
// p95 at index `Math.ceil(0.95 * count) - 1` per the plan's methodology.
// Sequential (not concurrent) by design: p95 under load-free conditions is
// the floor PLT-07 cares about here -- concurrent-load behavior is a
// different, not-yet-specified benchmark.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildTestApp, closeTestApp } from '../helpers/app.js';
import {
  cleanupTestData,
  createTestUser,
  createTestClinic,
  createTestClinicMember,
  createTestTokens,
  createTestPetOwner,
  createTestPet,
  createTestConsultation,
  createTestInventoryItem,
  createTestStockBatch,
  createTestInvoice,
} from '../helpers/factories.js';
import type { FastifyInstance } from 'fastify';

const REQUESTS_PER_GROUP = 100;
const P95_TARGET_MS = 500;
const BENCH_PASSWORD = 'BenchPassword123!';

interface GroupResult {
  group: string;
  p95Ms: number;
  count: number;
  pass: boolean;
}

/** `Math.ceil(0.95 * count) - 1` per the plan's exact methodology. */
export function computeP95(durationsMs: number[]): number {
  if (durationsMs.length === 0) return 0;
  const sorted = [...durationsMs].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(0.95 * sorted.length) - 1));
  return sorted[idx];
}

function toResult(group: string, durationsMs: number[]): GroupResult {
  const p95Ms = computeP95(durationsMs);
  return { group, p95Ms, count: durationsMs.length, pass: p95Ms < P95_TARGET_MS };
}

async function timedFetch(url: string, init?: RequestInit): Promise<{ ms: number; status: number; body: unknown }> {
  const start = performance.now();
  const res = await fetch(url, init);
  const body = await res.json().catch(() => undefined);
  const ms = performance.now() - start;
  return { ms, status: res.status, body };
}

async function runGroup(
  group: string,
  count: number,
  request: (i: number) => Promise<{ ms: number; status: number; body: unknown }>,
): Promise<GroupResult> {
  const durations: number[] = [];
  for (let i = 0; i < count; i++) {
    const { ms, status, body } = await request(i);
    if (status < 200 || status >= 300) {
      throw new Error(`[${group}] request ${i} returned status ${status}: ${JSON.stringify(body)}`);
    }
    durations.push(ms);
  }
  return toResult(group, durations);
}

let app: FastifyInstance;
let baseUrl: string;

beforeAll(async () => {
  app = await buildTestApp();
  const address = app.server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
}, 60_000);

afterAll(async () => {
  await cleanupTestData();
  await closeTestApp();
});

describe('API p95 latency benchmark (PLT-07)', () => {
  it(
    'measures p95 across 6 endpoint groups (auth, queue, emr, inventory, billing, sync) and asserts each is under 500ms',
    async () => {
      const results: GroupResult[] = [];

      // --- shared seed: one clinic, one Admin user, one JWT ---
      const user = await createTestUser({ password: BENCH_PASSWORD, isEmailVerified: true });
      const clinic = await createTestClinic(user.id);
      await createTestClinicMember(user.id, clinic.id, 'Admin');
      const { accessToken } = await createTestTokens(app, user.id, clinic.id);
      const authHeaders = {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      };

      // ---- auth: POST /api/v1/auth/login ----
      results.push(
        await runGroup('auth', REQUESTS_PER_GROUP, () =>
          timedFetch(`${baseUrl}/api/v1/auth/login`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email: user.email, password: BENCH_PASSWORD }),
          }),
        ),
      );

      // ---- queue: GET /api/v1/queue (board read) ----
      // Seed a handful of checked-in patients so the board read is
      // representative of a real clinic's in-progress queue, not an empty table.
      for (let i = 0; i < 5; i++) {
        const owner = await createTestPetOwner(clinic.id);
        const pet = await createTestPet(clinic.id, owner.id);
        const res = await fetch(`${baseUrl}/api/v1/queue/check-in`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ petId: pet.id }),
        });
        if (res.status !== 201 && res.status !== 200) {
          throw new Error(`queue seed check-in failed: ${res.status} ${await res.text()}`);
        }
      }
      results.push(
        await runGroup('queue', REQUESTS_PER_GROUP, () =>
          timedFetch(`${baseUrl}/api/v1/queue`, { headers: authHeaders }),
        ),
      );

      // ---- emr: GET /api/v1/consultations/:consultationId ----
      {
        const owner = await createTestPetOwner(clinic.id);
        const pet = await createTestPet(clinic.id, owner.id);
        const consultation = await createTestConsultation(clinic.id, pet.id, user.id);
        results.push(
          await runGroup('emr', REQUESTS_PER_GROUP, () =>
            timedFetch(`${baseUrl}/api/v1/consultations/${consultation.id}`, { headers: authHeaders }),
          ),
        );
      }

      // ---- inventory: POST /api/v1/inventory/items/:itemId/dispense ----
      {
        const item = await createTestInventoryItem(clinic.id, { currentStock: 0 });
        // FIFO dispense decrements real stock; stock the batch generously so
        // REQUESTS_PER_GROUP sequential dispenses of qty 1 never run out.
        await createTestStockBatch(clinic.id, item.id, {
          initialQty: REQUESTS_PER_GROUP + 50,
          currentQty: REQUESTS_PER_GROUP + 50,
        });
        results.push(
          await runGroup('inventory', REQUESTS_PER_GROUP, () =>
            timedFetch(`${baseUrl}/api/v1/inventory/items/${item.id}/dispense`, {
              method: 'POST',
              headers: authHeaders,
              body: JSON.stringify({ quantity: 1 }),
            }),
          ),
        );
      }

      // ---- billing: GET /api/v1/billing/invoices ----
      for (let i = 0; i < 5; i++) {
        await createTestInvoice(clinic.id, user.id);
      }
      results.push(
        await runGroup('billing', REQUESTS_PER_GROUP, () =>
          timedFetch(`${baseUrl}/api/v1/billing/invoices`, { headers: authHeaders }),
        ),
      );

      // ---- sync: POST /api/v1/sync/replay (empty batch: side-effect-free) ----
      results.push(
        await runGroup('sync', REQUESTS_PER_GROUP, (i) =>
          timedFetch(`${baseUrl}/api/v1/sync/replay`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({ deviceId: `bench-device-${i}` }),
          }),
        ),
      );

      // Structured JSON-line output for scripts/perf-report.ts to consume.
      for (const r of results) {
        // eslint-disable-next-line no-console
        console.log(
          JSON.stringify({
            group: r.group,
            p95Ms: Math.round(r.p95Ms * 100) / 100,
            count: r.count,
            pass: r.pass,
          }),
        );
      }

      for (const r of results) {
        expect(
          r.p95Ms,
          `[${r.group}] p95 over ${r.count} requests was ${r.p95Ms.toFixed(1)}ms, target is <${P95_TARGET_MS}ms`,
        ).toBeLessThan(P95_TARGET_MS);
      }
    },
    300_000,
  );
});
