# Phase 7: WhatsApp Communication - Pattern Map

**Mapped:** 2026-08-12
**Files analyzed:** 62 (48 new, 14 modified)
**Analogs found:** 55 / 62 (7 have no analog — see § No Analog Found)

> Every excerpt below is copied verbatim from the repo at the cited path and line range.
> Planner: reference the **analog path + line range**, not a paraphrase, in each plan action.

---

## File Classification

### API — WhatsApp module (`apps/api/src/modules/whatsapp/`)

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|-------------------|------|-----------|----------------|-------|
| `whatsapp.routes.ts` | route | request-response | `apps/api/src/modules/vaccination/vaccination.routes.ts` + `emr/emr.routes.ts` + `notifications/notification.routes.ts` | exact |
| `whatsapp.controller.ts` | controller | request-response | `apps/api/src/modules/emr/emr.controller.ts` (factory style) | exact |
| `whatsapp.schema.ts` | config (Fastify-level Zod) | request-response | `apps/api/src/modules/emr/emr.schema.ts` | exact |
| `whatsapp.repository.ts` | repository | CRUD | `apps/api/src/modules/vaccination/vaccination.repository.ts` | exact |
| `whatsapp.service.ts` | service | CRUD + read model | `apps/api/src/modules/vaccination/vaccination.service.ts` + `queue/queue.service.ts` | exact |
| `send-authorization.service.ts` | service (guard) | request-response | `apps/api/src/modules/emr/consultation-lock.service.ts` (single-purpose collaborator service) | role-match |
| `template-registry.ts` | config (in-code registry) | transform | `packages/types/src/constants/billing.constants.ts` (frozen preset table) | partial |
| `delivery-status.service.ts` | service | event-driven | `apps/api/src/modules/queue/queue.service.ts` (state transition + `broadcast`) | role-match |
| `inbound-router.service.ts` | service | event-driven | `apps/api/src/modules/notifications/notification.worker.ts` (event fan-out) | partial |
| `booking/booking.service.ts` | service | event-driven (state machine) | `apps/api/src/modules/queue/queue.service.ts` (`isValidTransition` + 409 conflicts) | role-match |
| `booking/slot.service.ts` | service (pure) | transform | `apps/api/src/modules/emr/dosage.service.ts` (pure calculation service) | role-match |
| `booking/booking.state.ts` | utility (transition table) | transform | `packages/types/src/constants/queue-status.ts` + `isValidTransition` in `packages/types` | exact |
| `reminders/reminder-sweep.job.ts` | job (scheduler) | batch | `apps/api/src/jobs/midnight-archive.ts` (cron precedent — **replace `node-cron` with BullMQ `upsertJobScheduler`**) | role-match |
| `reminders/reminder-task.service.ts` | service | batch + CRUD | `apps/api/src/modules/vaccination/vaccination.service.ts` | role-match |
| `reminders/reminder-source.repository.ts` | repository | batch read | `apps/api/src/modules/vaccination/vaccination.repository.ts:86-115` (`getOverdueVaccinations` / `getDueSoonVaccinations`) | exact |
| `providers/wa-provider.port.ts` | contract (interface) | — | *no analog* (no port/adapter boundary exists yet) — use RESEARCH.md § Pattern 1 |
| `providers/provider-registry.ts` | factory (config-driven) | — | `apps/api/src/modules/notifications/notification-bus.ts:34-37` (`createX(deps)` factory) | partial |
| `providers/simulator/simulator.provider.ts` | adapter | request-response + enqueue | `apps/api/src/modules/notifications/push.service.ts` (external-provider service) | role-match |
| `providers/simulator/simulator-reply.ts` | utility (pure) | transform | `apps/api/src/modules/emr/dosage.service.ts` | partial |
| `providers/cloud-api/cloud-api.provider.ts` | adapter | request-response (HTTP) | `apps/api/src/modules/notifications/push.service.ts` | role-match |
| `providers/cloud-api/cloud-api.mapper.ts` | utility (pure) | transform | *no analog* (no external-API mapper exists) — use RESEARCH.md § Anti-Pattern A1 |
| `providers/cloud-api/cloud-api.webhook.ts` | utility (security) | transform | *no analog* (no HMAC verification in repo) — use RESEARCH.md § Code Example 3 |
| `workers/outbound.worker.ts` | worker | queue consumer | `apps/api/src/modules/notifications/notification.worker.ts` | exact |
| `workers/simulator.worker.ts` | worker | queue consumer (delayed) | `apps/api/src/modules/notifications/notification.worker.ts` | exact |
| `whatsapp-queue.ts` *(recommended addition — not in RESEARCH.md tree)* | infrastructure (queue wrapper) | pub-sub | `apps/api/src/modules/notifications/notification-bus.ts` | exact |

### API — shared infra (modified/new outside the module)

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|-------------------|------|-----------|----------------|-------|
| `apps/api/src/lib/ist-date.ts` **(new)** | utility | transform | `apps/api/src/modules/queue/queue.repository.ts:14-25` (`getTodayIST` — extract verbatim) | exact |
| `apps/api/src/lib/audit-log.ts` **(modify)** | utility | append-only log | itself, lines 3-33 (extend `AuditEvent`) | exact |
| `apps/api/src/app.ts` **(modify)** | config | — | itself, lines 76-93 | exact |
| `apps/api/prisma/schema.prisma` **(modify)** | model | — | `schema.prisma:302-315` (`ConsentRecord`), `473-513` (`VaccinationRecord`/`DewormingRecord`) | exact |
| `apps/api/prisma/migrations/<ts>_add_phase_3_to_6_models/` **(new, Wave 0, D-19)** | migration | — | `apps/api/prisma/migrations/20260802162311_add_consent_records/` | exact |
| `apps/api/prisma/migrations/<ts>_add_whatsapp_communication/` **(new)** | migration | — | same | exact |
| `apps/api/prisma/post-migrate.sql` **(modify — verify only)** | config | — | itself, lines 1-21 | exact |
| `.env.example` **(modify)** | config | — | itself, lines 6-13 | exact |

### Shared packages

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|-------------------|------|-----------|----------------|-------|
| `packages/types/src/whatsapp.ts` **(new)** | types | — | `packages/types/src/queue.ts` | exact |
| `packages/types/src/constants/whatsapp.constants.ts` **(new)** | config | — | `packages/types/src/constants/socket-events.ts` + `billing.constants.ts` | exact |
| `packages/types/src/index.ts` **(modify)** | config (barrel) | — | itself, lines 1-13 | exact |
| `packages/types/src/constants/socket-events.ts` **(modify)** | config | — | itself, lines 1-7 | exact |
| `packages/validators/src/whatsapp.ts` **(new)** | validator | — | `packages/validators/src/queue.ts` + `emr.ts` | exact |
| `packages/validators/src/index.ts` **(modify)** | config (barrel) | — | itself, lines 1-8 | exact |

### Tests

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|-------------------|------|-----------|----------------|-------|
| `apps/api/tests/whatsapp/*.test.ts` **(new dir)** | test (integration) | request-response | `apps/api/tests/queue/queue-checkin.test.ts` | exact |
| `apps/api/src/modules/whatsapp/**/__tests__/*.test.ts` **(new)** | test (unit) | — | `apps/api/src/modules/emr/__tests__/emr.service.test.ts` | exact |
| `apps/api/tests/helpers/factories.ts` **(modify)** | test helper | — | itself, lines 35-77, 103-137 | exact |
| `apps/api/tests/tenant-isolation.test.ts` **(modify)** | test (integration) | — | itself | exact |
| `packages/validators/src/__tests__/whatsapp.test.ts` **(new)** | test (unit) | — | `packages/validators/src/__tests__/emr.validators.test.ts` | exact |

### Mobile (`apps/mobile/src/features/whatsapp/`)

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|-------------------|------|-----------|----------------|-------|
| `hooks/useWhatsAppThreads.ts`, `useWhatsAppThread.ts` | hook (query) | request-response | `apps/mobile/src/features/queue/hooks/useQueue.ts` | exact |
| `hooks/useSendTemplate.ts`, `useRetryMessage.ts`, `useBookingActions.ts`, `useOwnerPreference.ts`, `useSimulatorConfig.ts` | hook (mutation) | request-response | `apps/mobile/src/features/queue/hooks/useQueueActions.ts` | exact |
| `hooks/useWhatsAppSocket.ts` | hook (realtime) | event-driven | `apps/mobile/src/features/queue/hooks/useQueueSocket.ts` | exact |
| `store/whatsappUIStore.ts` | store | — | `apps/mobile/src/features/queue/store/queueUIStore.ts` | exact |
| `screens/WhatsAppInboxScreen.tsx` | component (screen) | request-response | `apps/mobile/src/features/queue/screens/QueueScreen.tsx` | exact |
| `screens/WhatsAppThreadScreen.tsx` | component (screen) | request-response | `QueueScreen.tsx` + `apps/mobile/src/features/consultation/screens/ConsultationDetailScreen.tsx` | role-match |
| `screens/WhatsAppConfigScreen.tsx` | component (screen) | CRUD form | `apps/mobile/src/features/patient/screens/EditPetForm.tsx` | role-match |
| `components/ThreadListItem.tsx` | component (list item) | — | `apps/mobile/src/features/queue/components/QueueCardItem.tsx` | exact |
| `components/MessageBubble.tsx`, `MessageStatusBadge.tsx`, `QuickReplyChip.tsx` | component (presentational) | — | `QueueCardItem.tsx` (+ `StatusBadge` from `@breeyo/ui`) | role-match |
| `components/FailureFilterBar.tsx` | component (filter chips) | — | `apps/mobile/src/features/consultation/components/QuickPickChips.tsx` | role-match |
| `components/ConversationActionCard.tsx` | component (action card) | — | `apps/mobile/src/features/queue/components/ResumeBanner.tsx` | role-match |
| `components/TemplateSendSheet.tsx` | component (bottom sheet) | request-response | `apps/mobile/src/features/queue/components/CheckInSheet.tsx` | exact |
| `components/SimulatorControlCard.tsx` | component (admin control) | CRUD | `apps/mobile/src/features/queue/components/VisitReasonPicker.tsx` | partial |
| `apps/mobile/app/(app)/whatsapp/index.tsx`, `[threadId].tsx`, `config.tsx` | route (Expo Router) | — | `apps/mobile/app/(app)/patient/[petId].tsx` | exact |
| `apps/mobile/package.json` **(modify — D-17 spike)** | config | — | itself | exact |

---

## Pattern Assignments

### A. API module skeleton — `whatsapp.routes.ts`, `.controller.ts`, `.service.ts`, `.repository.ts`, `.schema.ts`

**Analog:** `apps/api/src/modules/vaccination/*` (thinnest complete example) and `apps/api/src/modules/emr/*` (factory-controller + Zod-schema example).

**Route registration + DI wiring** (`vaccination.routes.ts:1-28` — copy this shape exactly, adding `requirePermission`):
```typescript
import type { FastifyInstance } from 'fastify';
import { VaccinationRepository } from './vaccination.repository.js';
import { VaccinationService } from './vaccination.service.js';
import { VaccinationController } from './vaccination.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantContext } from '../../middleware/tenant-context.js';

export default async function vaccinationRoutes(fastify: FastifyInstance) {
  const repository = new VaccinationRepository(fastify.prisma);
  const service = new VaccinationService(repository, fastify.prisma);
  const controller = new VaccinationController(service);

  const preHandler = [authenticate, tenantContext];

  fastify.post('/pets/:petId/vaccinations', { preHandler, handler: controller.addVaccination });
  fastify.get('/pets/:petId/vaccinations', { preHandler, handler: controller.getVaccinationHistory });
}
```
Note: repositories are constructed with **`fastify.prisma` (admin role)**, never `request.db`. Confirmed across every Phase 3/4 module. Follow it (RESEARCH.md § Pitfall 5).

**Permission gate** (`apps/api/src/modules/clinic/clinic.routes.ts:26` — the exact form for `SEND_WHATSAPP`, D-20):
```typescript
preHandler: [authenticate, tenantContext, requirePermission('MANAGE_CLINIC_SETTINGS')],
```
Import from `'../../middleware/authorize.js'` (`clinic.routes.ts:6`). The export is `requirePermission(...codes)`, **not** `authorize` (`apps/api/src/middleware/authorize.ts:13`). 403 body shape is produced by the middleware itself (`authorize.ts:29-35`).

**BullMQ bus/worker wiring inside a routes plugin, with `onClose` cleanup** (`emr/emr.routes.ts:17-24` — the pattern to copy, but see § D for the test guard):
```typescript
  // D-72: bus for lock takeover push notifications (same BullMQ queue/worker
  // pattern already used by the notifications module).
  const notificationBus = createNotificationBus(fastify.redis);
  fastify.addHook('onClose', async () => {
    await notificationBus.close();
  });
```

**Controller — factory style with Zod safeParse** (`emr/emr.controller.ts:19-52`). Use this rather than the class style in `vaccination.controller.ts`; it is the newer convention and it validates:
```typescript
function validationError(reply: FastifyReply, issues: { message: string }[]) {
  return reply.status(400).send({
    error: {
      code: 'VALIDATION_ERROR',
      message: issues.map((i) => i.message).join(', '),
    },
  });
}

export function createEmrController(
  emrService: EmrService,
  lockService: ConsultationLockService,
  notificationBus?: NotificationBus,
) {
  return {
    async createHandler(request: FastifyRequest, reply: FastifyReply) {
      const body = createConsultationSchema.safeParse(request.body);
      if (!body.success) {
        return validationError(reply, body.error.errors);
      }

      const consultation = await emrService.createConsultation(
        request.user.activeClinicId,
        body.data.petId,
        request.user.id,
        (request as any).userName ?? 'Unknown',
        body.data,
      );

      return reply.status(201).send({ data: consultation });
    },
```
Key conventions visible here: `clinicId` always from `request.user.activeClinicId` (never the body), actor from `request.user.id`, success envelope `{ data: ... }`, 201 on create. For WhatsApp send, return **202** with `{ data: { messageId } }` (RESEARCH.md § Pattern 2, UI-SPEC toast `Message queued`).

**Not-found / cross-tenant 404** (`vaccination.service.ts:181-193` — the throw form the centralized handler expects):
```typescript
    if (!record) {
      const error = new Error('Vaccination record not found') as Error & { statusCode: number; code: string };
      error.statusCode = 404;
      error.code = 'VACCINATION_NOT_FOUND';
      throw error;
    }

    if (record.clinicId !== clinicId || record.petId !== petId) {
      const error = new Error('Vaccination record not found') as Error & { statusCode: number; code: string };
      error.statusCode = 404;
      error.code = 'VACCINATION_NOT_FOUND';
      throw error;
    }
```
Copy the **404-on-cross-tenant** behavior verbatim for `threadId`/`messageId`/`bookingId` lookups (RESEARCH.md § Security: avoid existence disclosure).

**Conflict throw for `SLOT_TAKEN` / `ALREADY_IN_QUEUE`-shaped errors** (`queue/queue.service.ts:42-46`):
```typescript
      const error = new Error('Pet is already in today\'s queue') as Error & { statusCode: number; code: string };
      error.statusCode = 409;
      error.code = 'ALREADY_IN_QUEUE';
      throw error;
```

**Fastify-level param/query schemas** (`emr/emr.schema.ts:1-20` — copy file shape into `whatsapp.schema.ts`):
```typescript
import { z } from 'zod';

export const consultationParamsSchema = z.object({
  consultationId: z.string().min(1),
});

export const historyQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
});
```

**Repository — explicit `clinicId` on every method** (`vaccination.repository.ts:1-4, 58-70`):
```typescript
import type { PrismaClient } from '@prisma/client';

export class VaccinationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getVaccinationRecords(clinicId: string, petId: string) {
    return this.prisma.vaccinationRecord.findMany({
      where: { clinicId, petId },
      orderBy: { administeredAt: 'desc' },
    });
  }
```

**Service — audit write after a domain mutation** (`vaccination.service.ts:1-11, 48-57`):
```typescript
import { writeAuditLog, AuditEvent } from '../../lib/audit-log.js';

export class VaccinationService {
  constructor(
    private readonly repository: VaccinationRepository,
    private readonly prisma: PrismaClient,
  ) {}
  ...
    // EMR-07 / D-62: Audit trail for vaccination records
    await writeAuditLog(this.prisma, AuditEvent.VACCINATION_RECORDED, {
      userId: data.administeredBy,
      clinicId,
      metadata: {
        petId,
        vaccineName: data.vaccineName,
        recordId: record.id,
      },
    });
```
Note the `// <REQ-ID> / <D-XX>:` comment convention on every non-obvious line — the `breeyo-build` skill requires this traceability, and Phase 4 code already does it. Apply `// WHA-0X / D-XX:` in Phase 7.

---

### B. Reminder source queries — `reminders/reminder-source.repository.ts`

**Analog:** `apps/api/src/modules/vaccination/vaccination.repository.ts:72-115`

**Latest-record-per-key query** (`vaccination.repository.ts:72-84`) — this is the precedent that fixes RESEARCH.md § Pitfall 3 (superseded due dates); the sweep must use `findFirst` + `orderBy administeredAt desc` per `(petId, vaccineName)`, **not** a flat `findMany` on `nextDueDate`:
```typescript
  async getLatestVaccinationByName(clinicId: string, petId: string, vaccineName: string) {
    return this.prisma.vaccinationRecord.findFirst({
      where: { clinicId, petId, vaccineName },
      orderBy: { administeredAt: 'desc' },
    });
  }

  async getLatestDeworming(clinicId: string, petId: string) {
    return this.prisma.dewormingRecord.findFirst({
      where: { clinicId, petId },
      orderBy: { administeredAt: 'desc' },
    });
  }
```

**Due-window query** (`vaccination.repository.ts:100-115`) — the shape for `findFollowUpsDue` / `findLatestVaccinationsDue`:
```typescript
  async getDueSoonVaccinations(clinicId: string, petId: string, withinDays = 7) {
    const now = new Date();
    const threshold = new Date(now);
    threshold.setDate(threshold.getDate() + withinDays);

    const records = await this.prisma.vaccinationRecord.findMany({
      where: {
        clinicId,
        petId,
        nextDueDate: { gte: now, lte: threshold },
      },
      select: { vaccineName: true, nextDueDate: true },
      orderBy: { nextDueDate: 'asc' },
    });
    return records;
  }
```

**Follow-up source field** — `Consultation.followUpDate` / `followUpReason` already exist (`apps/api/prisma/schema.prisma:337-338`), so D-01's source needs no schema change:
```prisma
  followUpDate     DateTime? @map("follow_up_date")
  followUpReason   String?   @map("follow_up_reason")
```

---

### C. IST date arithmetic — `apps/api/src/lib/ist-date.ts` (new)

**Analog:** `apps/api/src/modules/queue/queue.repository.ts:14-25` — **extract verbatim**, then have `QueueRepository.getTodayIST` and `midnight-archive.ts` delegate to it (RESEARCH.md § Pattern 4). Do not import `QueueRepository` into the WhatsApp module.

```typescript
  /**
   * Gets start of today in IST (Asia/Kolkata, UTC+5:30).
   */
  static getTodayIST(date?: Date): Date {
    const now = date ?? new Date();
    // Convert to IST string, then parse back to get midnight IST
    const istString = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    // istString is "YYYY-MM-DD"
    const [year, month, day] = istString.split('-').map(Number);
    // Create UTC date that represents midnight IST (IST = UTC + 5:30)
    return new Date(Date.UTC(year, month - 1, day, -5, -30, 0, 0));
  }
```
Existing call sites to keep green: `apps/api/src/jobs/midnight-archive.ts:16`, `queue.service.ts:32,143,166`.

---

### D. BullMQ queues + workers — `whatsapp-queue.ts`, `workers/outbound.worker.ts`, `workers/simulator.worker.ts`

**Analog:** `apps/api/src/modules/notifications/notification-bus.ts` (whole file, 37 lines) and `notification.worker.ts:1-16, 60-68`.

**Queue wrapper + job options (retry/backoff)** (`notification-bus.ts:1-37`) — copy wholesale; `JOB_OPTIONS` is the exact retry/backoff policy RESEARCH.md § "Don't Hand-Roll" points to for provider failures:
```typescript
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import type { NotificationEvent } from '@breeyo/types';

const JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 1000 },
  removeOnComplete: 100,
  removeOnFail: 500,
};

export class NotificationBus {
  constructor(private queue: Queue) {}

  async emit(event: NotificationEvent): Promise<void> {
    await this.queue.add('send-notification', event, JOB_OPTIONS);
  }

  async emitBulk(events: NotificationEvent[]): Promise<void> {
    await this.queue.addBulk(
      events.map((e) => ({ name: 'send-notification', data: e, opts: JOB_OPTIONS })),
    );
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

export function createNotificationBus(redis: Redis): NotificationBus {
  const queue = new Queue('notifications', { connection: redis });
  return new NotificationBus(queue);
}
```
For WhatsApp: two queues — `whatsapp-outbound` and `whatsapp-simulator` — and job data must be **only the row id** (`{ messageId }`), per RESEARCH.md § Pattern 2, not the whole payload as `NotificationEvent` does.

**Worker construction** (`notification.worker.ts:1-16, 60-68`):
```typescript
import { Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import type { PrismaClient, Prisma } from '@prisma/client';

export function createNotificationWorker(
  redis: Redis,
  prisma: PrismaClient,
): Worker {
  const worker = new Worker<NotificationEvent>(
    'notifications',
    async (job: Job<NotificationEvent>) => { /* handler body */ },
    {
      connection: redis,
      concurrency: 5,
    },
  );

  return worker;
}
```

**Anti-pattern to NOT copy** (`notification.routes.ts:13-26`) — this is RESEARCH.md § Pitfall 7 / A9 in the wild. The worker is created unconditionally at route-registration time, so it runs under `vitest`:
```typescript
  // Initialize notification bus and worker
  const bus = createNotificationBus(fastify.redis);
  const worker = createNotificationWorker(fastify.redis, fastify.prisma);

  // Decorate the bus on fastify so other modules can use it
  if (!fastify.hasDecorator('notificationBus')) {
    fastify.decorate('notificationBus', bus);
  }

  // Clean up on close
  fastify.addHook('onClose', async () => {
    await worker.close();
    await bus.close();
  });
```
**Copy the decorate + `onClose` half; gate the `new Worker(...)` half.** The existing precedent for a test guard is `apps/api/src/app.ts:47` and `:90-93`:
```typescript
  const isTest = process.env.NODE_ENV === 'test';
  ...
  // Midnight archive cron (skip in test environment)
  if (!isTest) {
    scheduleMidnightArchive(app.prisma, app.io);
  }
```
Export the job handler as a plain function (`processOutboundJob(deps, jobData)`) so unit tests call it directly without a live worker.

---

### E. Scheduled sweep — `reminders/reminder-sweep.job.ts`

**Analog (structure only):** `apps/api/src/jobs/midnight-archive.ts:1-32`. Copy the file layout, the doc-comment-with-`D-XX` convention, the `timezone: 'Asia/Kolkata'` anchoring, and the try/catch-log-don't-throw handler. **Replace `cron.schedule` with BullMQ `upsertJobScheduler`** (RESEARCH.md § Pitfall 2 — `node-cron` fires once per ECS task).

```typescript
import cron from 'node-cron';
import type { PrismaClient } from '@prisma/client';
import type { Server } from 'socket.io';
import { SOCKET_EVENTS } from '@breeyo/types';
import { QueueRepository } from '../modules/queue/queue.repository.js';

/**
 * Schedules midnight auto-archive of queue entries.
 * D-23: Queue resets at midnight IST.
 * D-39: IN_CONSULT entries persist past midnight.
 */
export function scheduleMidnightArchive(prisma: PrismaClient, io: Server) {
  cron.schedule(
    '0 0 * * *',
    async () => {
      const today = QueueRepository.getTodayIST();

      try {
        const repository = new QueueRepository(prisma);
        const result = await repository.archiveEntries(today);

        console.log(`Midnight archive: ${result.count} entries archived`);

        // Notify all connected clients to refresh their queue
        io.emit(SOCKET_EVENTS.QUEUE_ARCHIVED, { timestamp: Date.now() });
      } catch (error) {
        console.error('Midnight archive failed:', error);
      }
    },
    { timezone: 'Asia/Kolkata' },
  );
}
```
Registration call site to mirror: `apps/api/src/app.ts:90-93` (`if (!isTest) { ... }`).

---

### F. Realtime broadcast — `delivery-status.service.ts`, `whatsapp.service.ts`

**Analog:** `apps/api/src/modules/queue/queue.service.ts:15-19, 192-199` + `apps/api/src/realtime/socket.ts:54-67`.

**Nullable-`io` injection + private broadcast helper** (`queue.service.ts:15-19` and `192-199`) — copy exactly; the nullable `io` is what makes the service unit-testable:
```typescript
export class QueueService {
  constructor(
    private readonly repository: QueueRepository,
    private readonly io: Server | null = null,
  ) {}
  ...
  /**
   * Broadcasts an event to all clients in a clinic room.
   */
  private broadcast(clinicId: string, event: string, data: unknown) {
    if (this.io) {
      this.io.to(`clinic:${clinicId}`).emit(event, data);
    }
  }
}
```
Call sites to mirror: `queue.service.ts:78` and `:129` (`this.broadcast(clinicId, SOCKET_EVENTS.QUEUE_UPDATED, {...})`).

**Room name is already established** — `apps/api/src/realtime/socket.ts:55, 67` joins `clinic:${decoded.clinicId}` on handshake and re-joins on reconnect. No socket-plugin changes needed for Phase 7; only new event names.

**Socket event constants** (`packages/types/src/constants/socket-events.ts:1-7` — extend this exact object; the value convention is `'<domain>:<kebab-event>'`):
```typescript
export const SOCKET_EVENTS = {
  PATIENT_CHECKED_IN: 'patient:checked-in',
  QUEUE_UPDATED: 'queue:updated',
  QUEUE_ARCHIVED: 'queue:archived',
  PATIENT_REGISTERED: 'patient:registered',
  PATIENT_UPDATED: 'patient:updated',
} as const;
```
Add: `WHATSAPP_MESSAGE_CREATED: 'whatsapp:message-created'`, `WHATSAPP_MESSAGE_STATUS_CHANGED: 'whatsapp:message-status-changed'`, `WHATSAPP_THREAD_UPDATED: 'whatsapp:thread-updated'`.

---

### G. Provider adapters — `providers/simulator/simulator.provider.ts`, `providers/cloud-api/cloud-api.provider.ts`

**Analog:** `apps/api/src/modules/notifications/push.service.ts:1-31, 45-71` — the only existing external-provider wrapper. It gives the class shape, the typed result object, the normalize-failures-into-the-result idiom, and the early-return-on-empty guard. It does **not** give a port/interface boundary (that is new — RESEARCH.md § Pattern 1).

```typescript
import Expo, { type ExpoPushMessage, type ExpoPushTicket } from 'expo-server-sdk';

export interface PushResult {
  sent: number;
  invalidTokens: string[];
}

export class PushService {
  private expo: Expo;

  constructor() {
    this.expo = new Expo();
  }

  async send(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<PushResult> {
    if (tokens.length === 0) {
      return { sent: 0, invalidTokens: [] };
    }
    ...
      for (let i = 0; i < tickets.length; i++) {
        const ticket = tickets[i];
        if (ticket.status === 'ok') {
          sent++;
        } else if (
          ticket.status === 'error' &&
          ticket.details?.error === 'DeviceNotRegistered'
        ) {
          // The token at position i in this chunk is invalid
```
**Deviate from this analog in one way:** `PushService` swallows provider errors into the result. `WaProvider` must **throw `WaSendError(code, providerCode, retryable, message)`** so BullMQ retry/backoff can act on `retryable` (RESEARCH.md § Pattern 1, Example 2).

**Provider-selection factory** — mirror `notification-bus.ts:34-37`'s `createX(deps): X` free-function factory rather than a class registry:
```typescript
export function createNotificationBus(redis: Redis): NotificationBus {
  const queue = new Queue('notifications', { connection: redis });
  return new NotificationBus(queue);
}
```

**Dev-vs-prod branch for a not-yet-real integration** (`apps/api/src/modules/attachment/attachment.service.ts:49-53`) — the existing precedent for "stubbed in dev, real in prod", relevant to `uploadMedia` and D-18:
```typescript
    // In development, return a mock presigned URL
    // In production, this would use AWS S3 SDK
    const uploadUrl = process.env.NODE_ENV === 'production'
      ? `https://s3.ap-south-1.amazonaws.com/breeyo-uploads/${s3Key}`
      : `http://localhost:9000/breeyo-uploads/${s3Key}`;
```
Phase 7 must **not** copy this env-branch into the provider itself — provider choice belongs in `provider-registry.ts` driven by `WHATSAPP_PROVIDER` + `WhatsAppClinicConfig.provider` (RESEARCH.md § Example 1). Cited here only because it is the code D-18/§ Pattern 6 has to interoperate with.

---

### H. Prisma models + migration — `schema.prisma`, `migrations/`

**Analog:** `apps/api/prisma/schema.prisma:302-315` (`ConsentRecord` — the exact model Phase 7 reuses for D-12) and `:473-513` (`VaccinationRecord`/`DewormingRecord` — the field/`@map`/index conventions).

```prisma
model ConsentRecord {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  ownerId     String?   @map("owner_id") @db.Uuid
  consentType String    @map("consent_type")
  purposeText String    @map("purpose_text")
  grantedAt   DateTime  @default(now()) @map("granted_at")
  withdrawnAt DateTime? @map("withdrawn_at")
  ipAddress   String?   @map("ip_address")
  actorId     String?   @map("actor_id") @db.Uuid
  createdAt   DateTime  @default(now()) @map("created_at")

  @@index([ownerId])
  @@map("consent_records")
}
```
Confirms RESEARCH.md: **no `clinicId`, no unique constraint** → D-12 "current consent" = latest row with `consentType='whatsapp_communication'` and `withdrawnAt IS NULL`; grant = append, withdraw = stamp. Never `upsert`.

```prisma
model VaccinationRecord {
  id              String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  clinicId        String    @map("clinic_id") @db.Uuid
  petId           String    @map("pet_id") @db.Uuid
  consultationId  String?   @map("consultation_id") @db.Uuid
  ...
  createdAt       DateTime  @default(now()) @map("created_at")

  clinic       Clinic        @relation(fields: [clinicId], references: [id])
  pet          Pet           @relation(fields: [petId], references: [id])
  consultation Consultation? @relation(fields: [consultationId], references: [id])

  @@index([clinicId, petId])
  @@index([clinicId, petId, vaccineName])
  @@map("vaccination_records")
}
```
Conventions to copy on all nine new WhatsApp models: `@id @default(dbgenerated("gen_random_uuid()")) @db.Uuid`, `snake_case @map()` on every field and `@@map()` on the table, `clinicId`-leading composite indexes, `@relation` to `Clinic`/`Pet` — but **no `@relation` to `Invoice`** (RESEARCH.md § Pitfall 8; use `contextType`/`contextId`).

**Migration directory naming** — `apps/api/prisma/migrations/20260802162311_add_consent_records/` (timestamp + snake_case description; `migration.sql` inside). Only 2 migrations exist for 29 models → D-19's Wave 0 migration is mandatory.

**post-migrate.sql** (`apps/api/prisma/post-migrate.sql:1-21`) — the blanket grant at line 7 already covers new tables, so **verify, don't duplicate**. Do **not** add `FORCE ROW LEVEL SECURITY` for WhatsApp tables (RESEARCH.md § Pitfall 5):
```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO breeyo_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO breeyo_app;
...
ALTER TABLE clinic_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_members FORCE ROW LEVEL SECURITY;
```

---

### I. Shared types — `packages/types/src/whatsapp.ts`, `constants/whatsapp.constants.ts`

**Analog:** `packages/types/src/queue.ts` (whole file, 53 lines) — plain `interface` + `type` only, no Zod, no runtime code, `Date` for timestamps, a `XWithY` variant for joined reads, and separate `Input` interfaces:
```typescript
import type { QueueStatus } from './constants/queue-status.js';

export interface QueueEntry {
  id: string;
  clinicId: string;
  petId: string;
  status: QueueStatus;
  ...
}

export interface QueueEntryWithPet extends QueueEntry {
  pet: { id: string; name: string; species: string; owner: { id: string; name: string; mobile: string } };
}

export interface QueueBoard {
  inConsult: QueueEntryWithPet[];
  waiting: QueueEntryWithPet[];
  done: QueueEntryWithPet[];
}

export interface CheckInInput {
  petId: string;
  visitReason?: string;
  isEmergency?: boolean;
}
```
Map to Phase 7: `WhatsAppThread`, `WhatsAppThreadWithOwner`, `WhatsAppMessage`, `WhatsAppInbox`, `SendTemplateInput`. Union/literal types (`WaTemplateKey`, `WaFailureCode`, `WaCapabilities`) go here too — RESEARCH.md § Pattern 1 has the exact declarations.

**Constants file** (`packages/types/src/constants/billing.constants.ts:1-3, 15-21`) — `readonly` + `as const`, with a comment recording the cross-package constraint:
```typescript
import type { ServiceCategory } from '../billing.js';

export const SERVICE_CATEGORIES: readonly ServiceCategory[] = [ 'consultation', ... ] as const;

/**
 * 20 preset service entries shipped with Breeyo.
 * Defined inline to avoid cross-package dependency (packages/types cannot import from apps/api).
 * Phase 6 06-01 may extend or replace this constant.
 */
export const PRESET_SERVICES: readonly { name: string; price: number }[] = [ ... ] as const;
```
Use for `WA_TEMPLATE_KEYS`, `WA_TEMPLATE_STAFF_NAMES` (the six exact UI-SPEC strings), `WA_REMINDER_LEAD_DAYS`, `WA_ESCALATION`, `WA_STATUS_RANK`, `WA_CAPABILITY_LIMITS`.

**Barrel exports** — `packages/types/src/index.ts:1-13` (add `export * from './whatsapp.js';`) and `packages/validators/src/index.ts:1-8` (add `export * from './whatsapp.js';`). Note `constants/index.js` is already re-exported from the types barrel (line 7), so a new constants file must be added to `packages/types/src/constants/index.ts` too.

---

### J. Shared validators — `packages/validators/src/whatsapp.ts`

**Analog:** `packages/validators/src/queue.ts` (whole file, 15 lines) — schema + inferred type per export:
```typescript
import { z } from 'zod';

export const checkInSchema = z.object({
  petId: z.string().uuid(),
  visitReason: z.string().max(100).optional(),
  isEmergency: z.boolean().default(false),
});

export const queueStatusUpdateSchema = z.object({
  status: z.enum(['WAITING', 'IN_CONSULT', 'DONE', 'NO_SHOW']),
});

export type CheckInInput = z.infer<typeof checkInSchema>;
export type QueueStatusUpdateInput = z.infer<typeof queueStatusUpdateSchema>;
```
And `packages/validators/src/emr.ts:4-8, 46-58` for nested objects, `z.enum` on domain literals, `.max()` length caps everywhere, and the trailing `z.infer` block:
```typescript
export const createConsultationSchema = z.object({
  petId: z.string().min(1, 'Pet ID is required'),
  queueEntryId: z.string().optional(),
  visitType: z.enum(['general', 'surgery', 'vaccination']),
});

export const finalizeConsultationSchema = z.object({
  followUpDate: z.string().datetime().optional(),
  followUpReason: z.string().max(500).optional(),
});
```
Per-template variable schemas (RESEARCH.md § Pattern 3) follow this exact shape; **every string variable needs a `.max()`** (RESEARCH.md § Security: template variable injection).

**Working-hours contract for `slot.service.ts`** — `apps/api/src/modules/clinic/clinic.schema.ts:11-19` is the *only* contract for `Clinic.workingHours` (`Json?`). Parse through it at read time; handle `null` (RESEARCH.md § Pitfall 15):
```typescript
const dayHoursSchema = z.object({
  open: z.string(),
  close: z.string(),
  closed: z.boolean(),
});

export const workingHoursBodySchema = z.object({
  hours: z.record(z.string(), dayHoursSchema),
});
```

---

### K. Audit logging — `apps/api/src/lib/audit-log.ts` (modify)

**Analog:** the file itself. Extend the enum with a phase-commented block exactly as Phase 4 did at lines 25-32:
```typescript
  ACTIVE_CLINIC_SWITCH = 'ACTIVE_CLINIC_SWITCH',
  // EMR & Clinical Records (Phase 4) — EMR-07 / D-62
  CONSULTATION_FINALIZED = 'CONSULTATION_FINALIZED',
  ADDENDUM_ADDED = 'ADDENDUM_ADDED',
  PRESCRIPTION_DOSAGE_OVERRIDDEN = 'PRESCRIPTION_DOSAGE_OVERRIDDEN',
  VACCINATION_RECORDED = 'VACCINATION_RECORDED',
  DEWORMING_RECORDED = 'DEWORMING_RECORDED',
  ATTACHMENT_UPLOADED = 'ATTACHMENT_UPLOADED',
  ATTACHMENT_DELETED = 'ATTACHMENT_DELETED',
}
```
Add `// WhatsApp Communication (Phase 7) — WHA-02/WHA-05 / D-11, D-12, D-13`: `WHATSAPP_CONSENT_GRANTED`, `WHATSAPP_CONSENT_WITHDRAWN`, `WHATSAPP_SENT_WITHOUT_CONSENT`, `WHATSAPP_OPT_OUT`, `WHATSAPP_NUMBER_MARKED_INVALID`, `WHATSAPP_BOOKING_CANCELLED`, `WHATSAPP_BOOKING_MOVED`.

`writeAuditLog` itself (lines 44-62) needs **no change** — it writes to `prisma.authAuditLog` with a `metadata` JSON blob. Per RESEARCH.md § Pitfall 6, use it only for consent/opt-out/booking-action compliance events; message-flow logging goes to `WhatsAppMessageStatusEvent`. `auth_audit_log` has `FORCE ROW LEVEL SECURITY` (`post-migrate.sql:16-17`) — cover the write with an integration test.

---

### L. App registration — `apps/api/src/app.ts` (modify)

**Analog:** itself, lines 76-93. Append after the Phase 4 block, keeping the phase comment convention:
```typescript
  // Socket.IO and queue (depends on prisma + redis + jwt being registered)
  await app.register(socketPlugin);
  await app.register(import('./modules/queue/queue.routes.js'), { prefix: '/api/v1' });

  // Phase 4: EMR & Clinical Records
  await app.register(import('./modules/emr/emr.routes.js'), { prefix: '/api/v1' });
  await app.register(import('./modules/drug/drug.routes.js'), { prefix: '/api/v1' });
  await app.register(import('./modules/attachment/attachment.routes.js'), { prefix: '/api/v1' });
  await app.register(import('./modules/vaccination/vaccination.routes.js'), { prefix: '/api/v1' });

  // Midnight archive cron (skip in test environment)
  if (!isTest) {
    scheduleMidnightArchive(app.prisma, app.io);
  }
```
Register WhatsApp **after** `socketPlugin` (it needs `app.io`). Route-scoped rate limit precedent for the webhook is the auth block at lines 72-75:
```typescript
  await app.register(import('./modules/auth/auth.routes.js'), {
    prefix: '/api/v1',
    config: { rateLimit: { max: isTest ? 10000 : 20, timeWindow: '1 minute' } },
  });
```

---

### M. API tests

**Integration analog:** `apps/api/tests/queue/queue-checkin.test.ts:1-86` — copy the harness boilerplate, local `setupAuthenticatedUser()` helper, per-test cleanup order, and `app.inject()` request helpers:
```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildTestApp, closeTestApp } from '../helpers/app.js';
import {
  cleanupTestData, createTestUser, createTestClinic,
  createTestClinicMember, createTestTokens, prisma,
} from '../helpers/factories.js';
import type { FastifyInstance } from 'fastify';

beforeAll(async () => { app = await buildTestApp(); });
afterAll(async () => { await cleanupTestData(); await closeTestApp(); });

async function setupAuthenticatedUser() {
  const user = await createTestUser();
  const clinic = await createTestClinic(user.id);
  await createTestClinicMember(user.id, clinic.id);
  const tokens = await createTestTokens(app, user.id, clinic.id);
  return { user, clinic, token: tokens.accessToken };
}

function checkIn(authToken: string, payload: {...}) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/queue/check-in',
    headers: { authorization: `Bearer ${authToken}` },
    payload,
  });
}
```
Note: `app.inject()` — **not supertest**, despite CLAUDE.md. `buildTestApp()` is a singleton (`tests/helpers/app.ts:4-15`). Role-specific tokens for the D-20 authz tests come from `createTestClinicMember(userId, clinicId, 'FrontDesk' | 'Clinician' | 'Admin')` (`factories.ts:53-56`).

**Factory analog:** `apps/api/tests/helpers/factories.ts:35-51` for new `createTestPetOwner` / `createTestPet` / `createTestConsultation` / `createTestWhatsAppThread`:
```typescript
export async function createTestClinic(
  ownerId: string,
  overrides: Partial<{ name: string; address: string; contactPhone: string }> = {},
) {
  return prisma.clinic.create({
    data: {
      name: overrides.name || `Test Clinic ${randomUUID().slice(0, 6)}`,
      address: overrides.address || '123 Test Street, Mumbai 400001',
      contactPhone: overrides.contactPhone || `+91${Math.floor(7000000000 + Math.random() * 2999999999)}`,
      ownerId,
    },
  });
}
```
**`cleanupTestData` must be extended** — `factories.ts:103-137` deletes in reverse-dependency order inside `$transaction`, with an explicit comment about FK ordering. Add the WhatsApp tables **before** `tx.pet.deleteMany()` / `tx.petOwner.deleteMany()` / `tx.clinic.deleteMany()`:
```typescript
    await tx.consultation.deleteMany();
    await tx.queueEntry.deleteMany();
    await tx.consentRecord.deleteMany();
    await tx.serviceCatalog.deleteMany();
    await tx.pet.deleteMany();
    await tx.petOwner.deleteMany();

    await tx.clinic.deleteMany();
    await tx.user.deleteMany();
```
(Note `queue-checkin.test.ts:77` calls `prisma.owner.deleteMany()` — a stale name; use `petOwner`.)

**Unit-test analog:** `apps/api/src/modules/emr/__tests__/emr.service.test.ts:1-80` — mapped-type mock factories per collaborator, a fixtures module, and a mock-prisma object exposing only the models touched. This is the shape for `simulator.provider.test.ts`, `delivery-status.service.test.ts`, `reminder-task.service.test.ts`, `slot.service.test.ts`:
```typescript
function createMockRepository(): { [K in keyof EmrRepository]: ReturnType<typeof vi.fn> } {
  return {
    createConsultation: vi.fn(),
    findActiveConsultation: vi.fn(),
    ...
  } as any;
}

function createMockPrisma() {
  return {
    speciesDosage: { findFirst: vi.fn() },
    authAuditLog: { create: vi.fn().mockResolvedValue({}) },
  } as any;
}

describe('EmrService', () => {
  beforeEach(() => {
    repository = createMockRepository();
    service = new EmrService(repository as any, lockService as any, dosageService as any, prisma);
  });
```
Colocation convention: `apps/api/src/modules/<name>/__tests__/<name>.service.test.ts` (see `vaccination/__tests__/`, `queue/__tests__/`, `emr/__tests__/` incl. `emr.fixtures.ts`).

**Validator-test analog:** `packages/validators/src/__tests__/emr.validators.test.ts:1-10` — file naming is `<domain>.validators.test.ts` (not `whatsapp.test.ts` as RESEARCH.md § Wave 0 Gaps says); prefer `whatsapp.validators.test.ts` for consistency:
```typescript
import { describe, it, expect } from 'vitest';
import { createConsultationSchema, saveDraftSchema, addendumSchema } from '../emr.js';

describe('createConsultationSchema', () => {
  it('accepts valid general consultation input', () => {
    const result = createConsultationSchema.safeParse({ petId: 'pet-123', visitType: 'general' });
    expect(result.success).toBe(true);
  });
```

---

### N. Mobile data hooks — `useWhatsAppThreads`, `useWhatsAppThread`

**Analog:** `apps/mobile/src/features/queue/hooks/useQueue.ts` (whole file, 29 lines):
```typescript
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';
import type { QueueBoard } from '@breeyo/types';

export function useQueue() {
  const { accessToken, activeClinicId } = useAuth();
  const today = formatDate(new Date());

  return useQuery({
    queryKey: ['queue', activeClinicId, today],
    queryFn: () =>
      apiClient<{ data: QueueBoard }>(`/api/v1/queue?date=${today}`, { token: accessToken! }),
    enabled: !!accessToken && !!activeClinicId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    select: (response) => response.data,
  });
}
```
Copy: `useAuth()` for token + clinic, `apiClient<{ data: T }>`, `queryKey: ['whatsapp-threads', activeClinicId, filter]`, `enabled` guard, `select` unwrapping `.data`. `apiClient` (`apps/mobile/src/lib/api.ts:6-37`) already throws `ApiClientError` carrying `code`/`status`/`details` from the `{ error: { code, message } }` envelope — use `err.code` to render UI-SPEC's failure copy.

---

### O. Mobile mutation hooks — `useSendTemplate`, `useRetryMessage`, `useBookingActions`, `useOwnerPreference`, `useSimulatorConfig`

**Analog:** `apps/mobile/src/features/queue/hooks/useQueueActions.ts:1-99` — optimistic `onMutate` + rollback + haptics + delayed invalidation. `useSendTemplate` needs exactly this (UI-SPEC's immediate `Queued` bubble):
```typescript
export function useUpdateQueueStatus() {
  const { accessToken, activeClinicId } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ entryId, status }: StatusUpdateParams) =>
      apiClient<{ data: QueueEntryWithPet }>(`/api/v1/queue/${entryId}/status`, {
        method: 'PATCH',
        token: accessToken!,
        body: JSON.stringify({ status }),
      }),
    onMutate: async ({ entryId, status }) => {
      const queryKey = ['queue', activeClinicId, today];
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<QueueBoard>(queryKey);
      ...
      return { previous, queryKey };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(context.queryKey, context.previous);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
    onSettled: () => {
      // Pitfall 3: Small delay to avoid flicker with Socket.IO broadcast
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['queue', activeClinicId] });
      }, 300);
    },
  });
}
```
The `onSettled` 300 ms delay comment is a real, already-learned lesson about Socket.IO/React-Query races — carry it into every WhatsApp mutation, since the thread is also socket-driven.

---

### P. Mobile realtime — `useWhatsAppSocket.ts`

**Analog:** `apps/mobile/src/features/queue/hooks/useQueueSocket.ts` (whole file, 69 lines) — copy verbatim and swap the event names + query keys:
```typescript
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { SOCKET_EVENTS } from '@breeyo/types/constants/socket-events';
import { useQueueUIStore } from '../store/queueUIStore';
import { useAuth } from '../../../providers/AuthProvider';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

export function useQueueSocket() {
  const { accessToken, activeClinicId } = useAuth();
  ...
    const socket = io(API_URL, {
      auth: { token: accessToken },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });

    socket.on(SOCKET_EVENTS.QUEUE_UPDATED, () => {
      queryClient.invalidateQueries({ queryKey: ['queue', activeClinicId] });
      if (soundEnabled) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }
    });

    socket.on('connect', () => {
      setOffline(false);
      queryClient.invalidateQueries({ queryKey: ['queue', activeClinicId] });
    });
    socket.on('connect_error', () => { setOffline(true); });
    socket.on('disconnect', () => { setOffline(true); });

    return () => { socket.disconnect(); };
  }, [accessToken, activeClinicId, queryClient, soundEnabled, setOffline]);
```
The `connect`/`connect_error`/`disconnect` → `setOffline` triad is what drives UI-SPEC's offline banner. Note the deep import path `'@breeyo/types/constants/socket-events'` used on mobile.

---

### Q. Mobile UI store — `store/whatsappUIStore.ts`

**Analog:** `apps/mobile/src/features/queue/store/queueUIStore.ts` (whole file) — plain `create<T>()`, no middleware, no persistence:
```typescript
import { create } from 'zustand';

interface QueueUIState {
  isOffline: boolean;
  soundEnabled: boolean;
  showDoneSection: boolean;
  setOffline: (offline: boolean) => void;
  setSoundEnabled: (enabled: boolean) => void;
  toggleDoneSection: () => void;
}

export const useQueueUIStore = create<QueueUIState>((set) => ({
  isOffline: false,
  soundEnabled: true,
  showDoneSection: false,
  setOffline: (isOffline) => set({ isOffline }),
  setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
  toggleDoneSection: () => set((state) => ({ showDoneSection: !state.showDoneSection })),
}));
```
Phase 7 state: `activeFilter` (All/Invoices/Reminders/Bookings/Failed/Needs action), `isOffline`, `searchQuery`.

---

### R. Mobile screens — `WhatsAppInboxScreen`, `WhatsAppThreadScreen`, `WhatsAppConfigScreen`

**Analog:** `apps/mobile/src/features/queue/screens/QueueScreen.tsx` (whole file, 230 lines) — it already implements all four UI-SPEC states in one file, which is exactly what the inbox needs.

Loading / error / populated branching (`QueueScreen.tsx:116-172`):
```typescript
  // Loading state
  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text variant="headlineLarge" style={styles.title}>Walk-in Queue</Text>
        <View style={styles.loadingContainer}><ActivityIndicator size="large" /></View>
      </View>
    );
  }

  // Error state
  if (isError) {
    return (
      <View style={styles.container}>
        <Text variant="headlineLarge" style={styles.title}>Walk-in Queue</Text>
        <View style={styles.errorContainer}>
          <Text variant="bodyLarge" style={styles.errorText}>
            Could not load queue. Pull down to try again.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text variant="headlineLarge" style={styles.title}>Walk-in Queue</Text>
      <OfflineBanner />
      <ResumeBanner />
      ...
```
Hook composition + toast + inline token styles (`QueueScreen.tsx:1-46, 109-114, 194-229`):
```typescript
import { Text, FAB, ActivityIndicator } from 'react-native-paper';
import { showToast } from '@breeyo/ui';
...
  useQueueSocket();                                  // side-effect hook, no return used
  const { data: queueData, isLoading, isError, refetch, isRefetching } = useQueue();
  const updateStatus = useUpdateQueueStatus();
...
      showToast('success', `${petName} checked in — Position #${position}`);
...
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFBF5' },
  title: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, color: '#1C1B1F' },
  fab: { position: 'absolute', right: 16, bottom: 16, backgroundColor: '#2E7D32', borderRadius: 16 },
  fabDisabled: { backgroundColor: '#CAC4D0' },
});
```
`showToast('success', ...)` from `@breeyo/ui` is the mechanism for UI-SPEC's `Message queued` / `Retry queued` / `Action marked resolved` toasts.

**⚠ D-17 blocker, verified:** this analog imports `react-native-paper` and `@breeyo/ui`, but **neither is in `apps/mobile/package.json`** (dependencies list confirmed: `@breeyo/types`, `@breeyo/validators`, `@expo/vector-icons`, `@tanstack/react-query`, `expo*`, `react`, `react-native`, `socket.io-client`, `zustand`). 19 Phase 3 files import `react-native-paper` and 15 import `@breeyo/ui` — all currently unresolvable. Phase 4's `ConsultationScreen.tsx:1-11` is the plain-RN fallback precedent (imports `View, Text, ScrollView, Pressable, Animated, Alert, ActivityIndicator, StyleSheet` from `react-native` only). **The Wave 0 spike (D-17) must resolve which of these two analogs Phase 7 screens copy.** Both are listed so the planner can branch.

---

### S. Mobile components

**List item — `ThreadListItem.tsx`** ← `apps/mobile/src/features/queue/components/QueueCardItem.tsx:1-66`:
```typescript
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBadge } from '@breeyo/ui';
import { SPECIES_ICONS } from '@breeyo/types/constants/species';
import { QUEUE_STATUS_LABELS, type QueueStatus } from '@breeyo/types/constants/queue-status';

const STATUS_TO_VARIANT: Record<string, 'waiting' | 'inConsult' | 'done' | 'noShow'> = {
  WAITING: 'waiting', IN_CONSULT: 'inConsult', DONE: 'done', NO_SHOW: 'noShow',
};

function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export function QueueCardItem({ entry, position, disabled, onPress, onStatusPress }: QueueCardItemProps) {
  ...
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={[styles.container, isEmergency && styles.emergencyBorder, disabled && styles.disabled]}
      accessibilityLabel={`${entry.pet.name}, ${entry.pet.owner.name}, ${QUEUE_STATUS_LABELS[entry.status as QueueStatus]}`}
      accessibilityRole="button"
    >
```
Copy: `Pressable` + `disabled ? undefined : onPress`, explicit `accessibilityLabel` composed from data (UI-SPEC accessibility contract), `en-IN` time formatting, a `STATUS_TO_VARIANT` map for `StatusBadge` (reuse for `MessageStatusBadge`: Queued/Sent/Delivered/Read/Failed), a local `formatX` pure helper.

**Bottom sheet — `TemplateSendSheet.tsx`** ← `apps/mobile/src/features/queue/components/CheckInSheet.tsx:1-80`:
```typescript
import { BottomSheet } from '@breeyo/ui';
import { useLookupOwner } from '../../patient/hooks/usePatientRegister';
import { useCheckIn } from '../hooks/useCheckIn';

interface CheckInSheetProps {
  visible: boolean;
  onDismiss: () => void;
  onCheckInSuccess?: (petName: string, position: number) => void;
}

export function CheckInSheet({ visible, onDismiss, onCheckInSuccess }: CheckInSheetProps) {
  const [mobileDisplay, setMobileDisplay] = useState('');
  const mobile = extractDigits(mobileDisplay);
  const isValidMobile = /^[6-9]\d{9}$/.test(mobile);
  ...
  // Reset state when sheet closes
  useEffect(() => {
    if (!visible) {
      setMobileDisplay('');
      setSelectedPet(null);
      setShowReasonPicker(false);
    }
  }, [visible]);
```
Copy: the `{ visible, onDismiss, onSuccess? }` prop contract, `BottomSheet` from `@breeyo/ui`, the reset-on-close `useEffect`, and the Indian-mobile validation regex `/^[6-9]\d{9}$/` (reuse for the invalid-number correction flow) plus `formatMobile`/`extractDigits` (lines 19-29) for phone display/normalization.

**Banner / action card — `ConversationActionCard.tsx`** ← `apps/mobile/src/features/queue/components/ResumeBanner.tsx` and `OfflineBanner.tsx` (both already used at `QueueScreen.tsx:152-154`).

**Filter chips — `FailureFilterBar.tsx`** ← `apps/mobile/src/features/consultation/components/QuickPickChips.tsx`.

---

### T. Mobile routes — `apps/mobile/app/(app)/whatsapp/{index,[threadId],config}.tsx`

**Analog:** `apps/mobile/app/(app)/patient/[petId].tsx` (whole file) — route files are thin adapters that only unwrap params:
```typescript
import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { PatientDetailScreen } from '../../../src/features/patient/screens/PatientDetailScreen';

export default function PetDetailRoute() {
  const { petId } = useLocalSearchParams<{ petId: string }>();

  if (!petId) return null;

  return <PatientDetailScreen petId={petId} />;
}
```
Tab/nav registration analog if the inbox gets a tab: `apps/mobile/app/(app)/(tabs)/_layout.tsx` (`<Tabs.Screen name="..." options={{ title, tabBarIcon }} />`, active tint `#2E7D32`). D-20 role gating (Front Desk + Admin) belongs at the screen/route level — no existing analog for role-gated navigation, so this is new code.

---

## Shared Patterns

### Authentication + authorization
**Source:** `apps/api/src/middleware/authorize.ts:13-39`, usage at `apps/api/src/modules/clinic/clinic.routes.ts:26`
**Apply to:** every WhatsApp route except `GET|POST /whatsapp/webhook`
```typescript
preHandler: [authenticate, tenantContext, requirePermission('SEND_WHATSAPP')],
```
- `SEND_WHATSAPP` already exists in `apps/api/prisma/seed.ts` (Admin + Clinician + FrontDesk) — leave unchanged per D-20.
- Config endpoints use `requirePermission('MANAGE_CLINIC_SETTINGS')` (Admin-only), matching `clinic.routes.ts:26,31`.
- Read endpoints (inbox/thread) use `[authenticate, tenantContext]`; the Front-Desk/Admin restriction is a *screen* gate (D-20).
- `clinicId` **always** from `request.user.activeClinicId` (`emr.controller.ts:45`, `vaccination.controller.ts:9`), never from body/params.

### Error handling
**Source:** `apps/api/src/middleware/error-handler.ts:1-56` (registered once at `app.ts:25`)
**Apply to:** all services and controllers
- Throw `Error & { statusCode, code }` (`vaccination.service.ts:182-185`); the handler renders `{ error: { code, message, details? } }`.
- `ZodError` is auto-mapped to 400 `VALIDATION_ERROR` (`error-handler.ts:10-19`), so `schema.parse()` in a service is a legitimate 400 path.
- `statusCode >= 500` is scrubbed to a generic message — never rely on a 500 body to convey a WhatsApp failure reason; use explicit 4xx codes.
- Controllers that pre-validate use the local `validationError()` helper (`emr.controller.ts:19-26`) rather than throwing.

### Response envelope
**Source:** `vaccination.controller.ts:42, 50`; `emr.controller.ts:51`
**Apply to:** all controllers
`reply.status(201).send(result)` for create, `reply.send({ data: ... })` for reads, `{ data: [...] }` for lists. Phase 7 send returns **202** `{ data: { messageId } }`.

### Audit logging
**Source:** `apps/api/src/lib/audit-log.ts:44-62`; call-site pattern `vaccination.service.ts:48-57`
**Apply to:** consent grant/withdraw, opt-out, number-marked-invalid, booking cancel/move, send-without-consent (D-13)
Requires `prisma` injected into the service constructor (`vaccination.service.ts:8-11`).

### Tenant scoping
**Source:** `vaccination.repository.ts` (every method), `apps/api/prisma/post-migrate.sql:13-21`
**Apply to:** every WhatsApp repository method
Explicit `clinicId: string` first parameter + `where: { clinicId, ... }`. Repositories get `fastify.prisma`, **not** `request.db`. No `FORCE ROW LEVEL SECURITY` on new tables (RESEARCH.md § Pitfall 5). Never use `$queryRawUnsafe` for inbox search (see `apps/api/src/lib/prisma-rls.ts:19-21` for the pattern **not** to copy).

### Traceability comments
**Source:** `vaccination.service.ts:48`, `midnight-archive.ts:7-11`, `useQueueActions.ts:73`
**Apply to:** every non-obvious line in Phase 7
```typescript
    // EMR-07 / D-62: Audit trail for vaccination records
```
Phase 7 form: `// WHA-0X / D-XX: <why>`. Required by `.claude/skills/breeyo-build`.

### Test harness
**Source:** `apps/api/tests/helpers/app.ts:1-22`, `tests/queue/queue-checkin.test.ts:1-36`
**Apply to:** every integration test
`buildTestApp()` (singleton) + `app.inject()` + `cleanupTestData()` in `afterAll` and targeted `deleteMany()` in `beforeEach`. `apps/api/vitest.config.ts` runs with `fileParallelism: false`, so tests share one database serially.

---

## No Analog Found

Planner should use RESEARCH.md's code examples verbatim for these — there is nothing in the repo to copy.

| File | Role | Data Flow | Reason | Use instead |
|------|------|-----------|--------|-------------|
| `providers/wa-provider.port.ts` | contract | — | No ports-and-adapters boundary exists anywhere in the repo; `push.service.ts` is a concrete class with no interface | RESEARCH.md § Pattern 1 (full interface listing) |
| `providers/cloud-api/cloud-api.mapper.ts` | utility | transform | No external-API request/response mapper exists | RESEARCH.md § Anti-Pattern A1 + § Cloud API Reference |
| `providers/cloud-api/cloud-api.webhook.ts` | utility (crypto) | transform | No HMAC/signature verification anywhere; `node:crypto` is used only via argon2/randomUUID | RESEARCH.md § Code Example 3 |
| Webhook route (inside `whatsapp.routes.ts`) | route | event-driven | No unauthenticated route + no `addContentTypeParser` raw-body usage in the repo | RESEARCH.md § Pattern 11 + § Pitfall 10 (encapsulated child plugin) |
| `booking/slot.service.ts` slot generation | service | transform | Nothing reads `Clinic.workingHours` after the setup wizard writes it (`clinic.service.ts:29`) | `clinic.schema.ts:11-19` for the JSON contract + RESEARCH.md § Pitfall 15 |
| `WhatsAppSlotHold` P2002 conflict handling | repository/service | CRUD (concurrency) | No `@@unique`-violation-as-business-outcome pattern exists; conflicts today are pre-checked in application code (`queue.service.ts:34-46`) | RESEARCH.md § Pattern 8 + § Code Example 5 |
| BullMQ `upsertJobScheduler` registration | job | batch | Only `node-cron` precedent exists (`midnight-archive.ts`), which RESEARCH.md explicitly rules out for reminders | RESEARCH.md § Code Example 6 |
| Role-gated mobile navigation (D-20 screen gate) | route | — | No screen is role-gated today; `(app)/_layout.tsx` gates on auth only | New code; derive from `useAuth()` + UI-SPEC line 28 |
| `packages/ui/src/wireframes/whatsapp/MessageLogScreen.stories.ts` | wireframe | — | Verified to be a 4-state stub with `React.createElement(Text, null, 'Message Log Screen - ...')` and **no reusable layout** | Ignore; use 07-UI-SPEC.md |

---

## Metadata

**Analog search scope:**
`apps/api/src/modules/{vaccination,emr,notifications,queue,clinic,attachment,auth}/`, `apps/api/src/{lib,jobs,realtime,middleware,plugins}/`, `apps/api/prisma/{schema.prisma,migrations,post-migrate.sql}`, `apps/api/tests/{helpers,queue}/`, `apps/mobile/src/features/{queue,consultation,patient}/`, `apps/mobile/app/`, `apps/mobile/src/lib/`, `packages/types/src/`, `packages/validators/src/`, `packages/ui/src/wireframes/whatsapp/`

**Files read in full or in targeted ranges:** 38
**Project skills detected:** `.claude/skills/breeyo-build` (TDD-first tasks, `D-XX`/`WHA-0X` traceability, exact monorepo paths) — reflected in § Traceability comments and § M
**Pattern extraction date:** 2026-08-12
