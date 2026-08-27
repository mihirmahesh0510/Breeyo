// Plan 10-07 (PLT-07): queue real-time update latency benchmark.
//
// Connects a REAL `socket.io-client` (not a spy on `app.io.to()`, unlike
// `tests/queue/queue-realtime.test.ts` -- that suite proves the server emits
// the right room/event/payload, this one proves how long it actually takes a
// connected client to receive it) to the `clinic:<id>` room, then drives >=10
// real queue status mutations through the real HTTP API and measures the
// wall-clock delta between "mutation request sent" and "client received the
// `queue:updated` socket event for that mutation" (see the in-loop comment
// below for why the anchor is request-send time rather than
// response-received time). Asserts p95 < 2000ms per PLT-07 / the plan's
// <interfaces> methodology.
//
// Auth handshake matches `apps/api/src/realtime/socket.ts`'s `io.use(...)`
// exactly: the same access-token JWT used for `Authorization: Bearer` is
// passed as `socket.handshake.auth.token`. The server auto-joins
// `clinic:<clinicId>` off that token -- no explicit `socket.emit('join', ...)`
// call exists or is needed.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { io as ioClient, type Socket } from 'socket.io-client';
import { buildTestApp, closeTestApp } from '../helpers/app.js';
import {
  cleanupTestData,
  createTestUser,
  createTestClinic,
  createTestClinicMember,
  createTestTokens,
  createTestPetOwner,
  createTestPet,
} from '../helpers/factories.js';
import type { FastifyInstance } from 'fastify';

const MUTATION_COUNT = 12;
const LATENCY_TARGET_MS = 2000;
const CONNECT_TIMEOUT_MS = 10_000;
const EVENT_WAIT_TIMEOUT_MS = 5_000;

/** `Math.ceil(0.95 * count) - 1`, same methodology as api-p95.bench.ts. */
function computeP95(durationsMs: number[]): number {
  if (durationsMs.length === 0) return 0;
  const sorted = [...durationsMs].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(0.95 * sorted.length) - 1));
  return sorted[idx];
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

describe('Queue real-time update latency benchmark (PLT-07)', () => {
  it(
    'measures p95 round-trip latency from queue status mutation to client Socket.IO receipt, and asserts under 2000ms',
    async () => {
      const user = await createTestUser({ isEmailVerified: true });
      const clinic = await createTestClinic(user.id);
      await createTestClinicMember(user.id, clinic.id, 'Admin');
      const { accessToken } = await createTestTokens(app, user.id, clinic.id);
      const authHeaders = {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      };

      // Seed MUTATION_COUNT checked-in queue entries up front (one per
      // mutation) -- WAITING -> IN_CONSULT is a valid transition per the
      // queue state machine, and a distinct entry per mutation avoids
      // needing to model further transitions out of IN_CONSULT.
      const entryIds: string[] = [];
      for (let i = 0; i < MUTATION_COUNT; i++) {
        const owner = await createTestPetOwner(clinic.id);
        const pet = await createTestPet(clinic.id, owner.id);
        const res = await fetch(`${baseUrl}/api/v1/queue/check-in`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ petId: pet.id }),
        });
        if (res.status !== 201 && res.status !== 200) {
          throw new Error(`seed check-in failed: ${res.status} ${await res.text()}`);
        }
        const body = (await res.json()) as { data: { id: string } };
        entryIds.push(body.data.id);
      }

      // Connect a real Socket.IO client the same way a mobile/web client
      // does: `auth.token` carries the access JWT, server auto-joins
      // `clinic:<clinicId>` from its `clinicId` claim.
      const socket: Socket = ioClient(baseUrl, {
        auth: { token: accessToken },
        transports: ['websocket'],
        reconnection: false,
      });

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('socket.io client failed to connect within timeout')), CONNECT_TIMEOUT_MS);
        socket.on('connect', () => {
          clearTimeout(timer);
          resolve();
        });
        socket.on('connect_error', (err) => {
          clearTimeout(timer);
          reject(new Error(`socket.io connect_error: ${err.message}`));
        });
      });

      try {
        const durationsMs: number[] = [];

        for (let i = 0; i < MUTATION_COUNT; i++) {
          const entryId = entryIds[i];

          // Arm the listener BEFORE firing the mutation so no emit can race
          // ahead of the listener being attached.
          const eventReceived = new Promise<number>((resolve, reject) => {
            const timer = setTimeout(
              () => reject(new Error(`queue:updated for entry ${entryId} not received within ${EVENT_WAIT_TIMEOUT_MS}ms`)),
              EVENT_WAIT_TIMEOUT_MS,
            );
            const handler = (payload: { entry?: { id?: string } }) => {
              if (payload?.entry?.id !== entryId) return; // a different mutation's broadcast
              clearTimeout(timer);
              socket.off('queue:updated', handler);
              resolve(performance.now());
            };
            socket.on('queue:updated', handler);
          });

          const apiStart = performance.now();
          const res = await fetch(`${baseUrl}/api/v1/queue/${entryId}/status`, {
            method: 'PATCH',
            headers: authHeaders,
            body: JSON.stringify({ status: 'IN_CONSULT' }),
          });
          if (res.status !== 200) {
            throw new Error(`status update failed for ${entryId}: ${res.status} ${await res.text()}`);
          }
          await res.json();

          // Anchored to `apiStart` (request sent), not to "HTTP response
          // received": the server calls `this.broadcast(...)` and returns
          // the HTTP response from the same handler, so the socket push and
          // the HTTP response race each other as two independent deliveries
          // over two different connections -- there is no guarantee the
          // fetch()'s `res.json()` resolves before the client's `on()`
          // handler fires. An early trial run measured this and got a
          // small *negative* delta (event observed to arrive fractionally
          // before our own await on the HTTP response settled), which is a
          // real ordering artifact, not a bug, but useless as a reported
          // number. `apiStart` is guaranteed to precede both deliveries, so
          // `receivedAt - apiStart` is always >= 0 and matches what a real
          // user experiences: the clock that matters is "I tapped the
          // button" to "the other screen updated," not the HTTP round trip.
          const receivedAt = await eventReceived;
          durationsMs.push(receivedAt - apiStart);
        }

        const p95Ms = computeP95(durationsMs);
        const pass = p95Ms < LATENCY_TARGET_MS;

        // eslint-disable-next-line no-console
        console.log(
          JSON.stringify({
            metric: 'queue_realtime_p95',
            p95Ms: Math.round(p95Ms * 100) / 100,
            count: durationsMs.length,
            pass,
          }),
        );

        expect(
          p95Ms,
          `queue real-time p95 over ${durationsMs.length} mutations was ${p95Ms.toFixed(1)}ms, target is <${LATENCY_TARGET_MS}ms`,
        ).toBeLessThan(LATENCY_TARGET_MS);
      } finally {
        socket.disconnect();
      }
    },
    60_000,
  );
});
