# Phase 8: Scheduling & Calendar - Pattern Map

**Mapped:** 2026-08-13
**Files analyzed:** 43 new/modified files
**Analogs found:** 36 / 43 (7 with no analog)

> **Read this before writing plans.** Every excerpt below was read from the live codebase
> this session (not from RESEARCH.md's reconstructions). Where RESEARCH.md assumed a Phase 5/6/7
> file exists, § Cross-Phase Reality Check records what is actually on disk.

---

## Cross-Phase Reality Check (read first)

RESEARCH.md was written assuming Phase 7 would land before Phase 8. On this branch
(`breeyo/phase-04-emr-clinical-records`), it has not. Verified `ls` of
`apps/api/src/modules/` this session:

```
attachment  auth  billing  clinic  drug  emr  notifications  patient  queue  vaccination
```

| RESEARCH.md assumed | Actual state | Consequence for planning |
|---------------------|--------------|--------------------------|
| `apps/api/src/modules/whatsapp/` (Phase 7) | **Does not exist** | D-12/D-16/D-17 (booking formalization, KEEP/MOVE/CANCEL bridge, reminder template) have **no analog and no seam**. Must be a gated wave with an explicit dependency check, per RESEARCH.md Pitfall 2. |
| `apps/api/src/modules/whatsapp/booking/slot.service.ts` as the transplant source for `slot.service.ts` | **Does not exist** | `generateSlotsForVetDay` is genuinely greenfield. Closest structural analog is `apps/api/src/modules/emr/dosage.service.ts` (class-wrapped pure computation) — see § No Analog Found. |
| `apps/api/src/lib/ist-date.ts` | **Does not exist.** `apps/api/src/lib/` contains only `audit-log.ts`, `prisma-rls.ts` | IST date math must either extract `QueueRepository.getTodayIST()` (excerpt below) or call it directly. Do **not** import `ist-date.ts`. |
| `WhatsAppReminderTask` model to extend with `APPOINTMENT_REMINDER` | **Not in `schema.prisma`** (schema is 557 lines, ends at `ServiceCatalog`) | Pattern 5 of RESEARCH.md is unbuildable as written until Phase 7 lands. |
| `inventory` / invoice models (Phase 5/6) | Not present; `billing/` holds only `service-catalog-seed.ts` + `__tests__` | No dependency, just don't reference them. |

**Two good surprises** (already in the codebase, do not re-create):

```typescript
// packages/types/src/notification.ts:1-17 — already has the exact values Phase 8 needs
export enum NotificationType {
  ...
  QUEUE_CHANGE = 'QUEUE_CHANGE',
  APPOINTMENT_REMINDER = 'APPOINTMENT_REMINDER',   // <- already here
  ...
}
export enum NotificationModule {
  ...
  SCHEDULING = 'scheduling',                        // <- already here
  ...
}
```

```typescript
// apps/api/prisma/seed.ts:27-28 — permissions already seeded onto Admin/Clinician/FrontDesk (lines 54, 61)
{ code: 'VIEW_SCHEDULE',   description: 'View appointments',                  module: 'scheduling' },
{ code: 'MANAGE_SCHEDULE', description: 'Create/update/cancel appointments', module: 'scheduling' },
```

**One schema gap for D-02:** `ServiceCatalog` (`schema.prisma:537-557`) has **no duration field** —
`name, category, price, sacCode, hsnCode, gstRateOverride, isActive, isPreset, sortOrder`.
Per-service slot duration (D-02) requires adding `durationMinutes Int` to `ServiceCatalog`
**and** snapshotting it onto `Appointment`. Plan this explicitly; it is not a read-only dependency.

---

## File Classification

### API — new `scheduling` module

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `apps/api/src/modules/scheduling/availability.repository.ts` | repository | CRUD | `apps/api/src/modules/vaccination/vaccination.repository.ts` | exact |
| `apps/api/src/modules/scheduling/availability.service.ts` | service | CRUD | `apps/api/src/modules/queue/queue.service.ts` | role-match |
| `apps/api/src/modules/scheduling/slot.service.ts` | utility (pure) | transform | `apps/api/src/modules/emr/dosage.service.ts` | partial |
| `apps/api/src/modules/scheduling/appointment.repository.ts` | repository | CRUD | `apps/api/src/modules/queue/queue.repository.ts` | exact |
| `apps/api/src/modules/scheduling/appointment.service.ts` | service | CRUD + state machine | `apps/api/src/modules/queue/queue.service.ts` | exact |
| `apps/api/src/modules/scheduling/appointment.state.ts` | utility | transform | `packages/types/src/constants/queue-status.ts` | exact |
| `apps/api/src/modules/scheduling/queue-handoff.service.ts` | service | batch | `apps/api/src/modules/queue/queue.service.ts` + `queue.repository.ts:211-220` | role-match |
| `apps/api/src/modules/scheduling/reminder.service.ts` | service | batch | *(none — Phase 7 dependency)* | none |
| `apps/api/src/modules/scheduling/push-trigger.service.ts` | service | event-driven | `apps/api/src/modules/notifications/notification.worker.ts` | role-match |
| `apps/api/src/modules/scheduling/scheduling.sweep.worker.ts` | worker | batch/scheduled | `notification.worker.ts` + `apps/api/src/jobs/midnight-archive.ts` | partial |
| `apps/api/src/modules/scheduling/scheduling.schema.ts` | schema | request-response | `apps/api/src/modules/queue/queue.schema.ts` | exact |
| `apps/api/src/modules/scheduling/scheduling.controller.ts` | controller | request-response | `apps/api/src/modules/queue/queue.controller.ts` | exact |
| `apps/api/src/modules/scheduling/scheduling.routes.ts` | route | request-response | `apps/api/src/modules/queue/queue.routes.ts` + `clinic.routes.ts:26` | exact |
| `apps/api/src/modules/scheduling/scheduling.types.ts` | types | — | `apps/api/src/modules/queue/queue.types.ts` | exact |
| `apps/api/src/modules/scheduling/__tests__/slot.service.test.ts` | test (unit) | — | `apps/api/src/modules/queue/__tests__/queue.service.test.ts` | exact |
| `apps/api/src/modules/scheduling/__tests__/appointment.service.test.ts` | test (unit) | — | `apps/api/src/modules/queue/__tests__/queue.service.test.ts` | exact |

### API — modified

| Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------|------|-----------|----------------|---------------|
| `apps/api/prisma/schema.prisma` | model/migration | — | `QueueEntry` (lines 277-300), `Pet` (247-275) | exact |
| `apps/api/src/app.ts` | config | — | itself, lines 82-93 | exact |
| `apps/api/src/lib/audit-log.ts` | utility | — | itself, lines 25-32 (Phase 4 extension precedent) | exact |
| `apps/api/src/modules/queue/queue.repository.ts` | repository | CRUD | itself, lines 129-134 / 162-165 | exact |
| `apps/api/src/modules/queue/queue.service.ts` | service | CRUD | itself, lines 64-84 | exact |
| `apps/api/tests/helpers/factories.ts` | test util | — | itself, lines 35-51 + 103-137 | exact |
| `apps/api/tests/scheduling/*.test.ts` | test (integration) | request-response | `apps/api/tests/queue/queue-board.test.ts` | exact |

### Shared packages

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/validators/src/scheduling.ts` | schema | — | `packages/validators/src/emr.ts` + `queue.ts` | exact |
| `packages/validators/src/index.ts` | config | — | itself | exact |
| `packages/types/src/scheduling.ts` | types | — | `packages/types/src/queue.ts` | exact |
| `packages/types/src/constants/scheduling.constants.ts` | constants + state machine | — | `packages/types/src/constants/queue-status.ts` | exact |
| `packages/types/src/constants/queue-status.ts` (modified: `EXPECTED`) | constants | — | itself | exact |
| `packages/types/src/constants/socket-events.ts` (modified) | constants | — | itself | exact |
| `packages/types/src/index.ts` + `constants/index.ts` | config | — | themselves | exact |
| `packages/ui/src/atoms/StatusBadge/StatusBadge.ts` (modified: `expected` variant) | component | — | itself, lines 24-44 | exact |

### Mobile (Expo)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `apps/mobile/src/features/scheduling/screens/DayAgendaScreen.tsx` | screen | request-response | `apps/mobile/src/features/queue/screens/QueueScreen.tsx` | exact |
| `apps/mobile/src/features/scheduling/screens/AvailabilitySettingsScreen.tsx` | screen | CRUD form | `apps/mobile/app/setup-wizard/clinic-hours.tsx` | exact |
| `apps/mobile/src/features/scheduling/components/AppointmentQuickSheet.tsx` | component | request-response | `apps/mobile/src/features/queue/components/CheckInSheet.tsx` | exact |
| `apps/mobile/src/features/scheduling/components/AppointmentCardItem.tsx` | component | — | `apps/mobile/src/features/queue/components/QueueCardItem.tsx` | exact |
| `apps/mobile/src/features/scheduling/hooks/useSchedule.ts` | hook | request-response | `apps/mobile/src/features/queue/hooks/useQueue.ts` | exact |
| `apps/mobile/src/features/scheduling/hooks/useAppointmentActions.ts` | hook | CRUD (optimistic) | `apps/mobile/src/features/queue/hooks/useQueueActions.ts` | exact |
| `apps/mobile/src/features/scheduling/hooks/useScheduleSocket.ts` | hook | pub-sub | `apps/mobile/src/features/queue/hooks/useQueueSocket.ts` | exact |
| `apps/mobile/src/features/scheduling/store/scheduleUIStore.ts` | store | — | `apps/mobile/src/features/queue/store/queueUIStore.ts` | exact |
| `apps/mobile/app/(app)/(tabs)/schedule.tsx` | route | — | `apps/mobile/app/(app)/(tabs)/patients.tsx` + `_layout.tsx` | exact |
| `apps/mobile/src/features/queue/components/QueueCardItem.tsx` (modified) | component | — | itself, lines 20-25 | exact |

### Web (Next.js — first real screen)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `apps/web/app/schedule/page.tsx` | page/component | request-response | `apps/web/app/page.tsx` (8 lines, static) | partial |
| `apps/web/app/schedule/WeekGrid.tsx` | component | — | *(none in repo — RN-only design system)* | none |
| `apps/web/app/schedule/AppointmentDrawer.tsx` | component | request-response | *(none)* | none |
| `apps/web/app/schedule/lib/useScheduleSocket.ts` | hook | pub-sub | `apps/mobile/src/features/queue/hooks/useQueueSocket.ts` | role-match |
| `apps/web/src/lib/api.ts` (modified: auth token) | utility | request-response | `apps/mobile/src/lib/api.ts` | role-match |
| `apps/web/app/layout.tsx` (modified: import `portal.css`) | config | — | itself (16 lines) | partial |
| `apps/web/package.json` (modified: `socket.io-client`) | config | — | `apps/mobile/package.json` | exact |

---

## Pattern Assignments

### `apps/api/src/modules/scheduling/*` — module wiring

**Analog:** `apps/api/src/modules/queue/` (all 6 files read this session)

**Routes: DI-in-routes + preHandler array** — `queue.routes.ts:1-38` (full file is the template):

```typescript
import type { FastifyInstance } from 'fastify';
import { QueueRepository } from './queue.repository.js';
import { QueueService } from './queue.service.js';
import { createQueueController } from './queue.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantContext } from '../../middleware/tenant-context.js';

export default async function queueRoutes(fastify: FastifyInstance) {
  const repository = new QueueRepository(fastify.prisma);
  const service = new QueueService(repository, fastify.io);
  const controller = createQueueController(service);

  const preHandler = [authenticate, tenantContext];

  fastify.get('/queue', { preHandler, handler: controller.getQueueBoardHandler });
  fastify.post('/queue/check-in', { preHandler, handler: controller.checkInHandler });
  fastify.patch('/queue/:entryId/status', { preHandler, handler: controller.updateStatusHandler });
}
```

Note: `queue.routes.ts` does **not** use `requirePermission`. Only two files in the repo do
(`auth.routes.ts`, `clinic.routes.ts`). Since `VIEW_SCHEDULE`/`MANAGE_SCHEDULE` are already seeded,
copy the guard shape from `clinic.routes.ts:26`:

```typescript
import { requirePermission } from '../../middleware/authorize.js';
// ...
fastify.put('/clinics/current/hours', {
  preHandler: [authenticate, tenantContext, requirePermission('MANAGE_CLINIC_SETTINGS')],
  handler: controller.updateHoursHandler,
});
```

→ Scheduling reads: `[authenticate, tenantContext, requirePermission('VIEW_SCHEDULE')]`;
writes: `[..., requirePermission('MANAGE_SCHEDULE')]`.

**Controller: factory function + `safeParse` + `{ data }` envelope** — `queue.controller.ts:10-37`:

```typescript
function validationError(reply: FastifyReply, issues: { message: string }[]) {
  return reply.status(400).send({
    error: { code: 'VALIDATION_ERROR', message: issues.map((i) => i.message).join(', ') },
  });
}

export function createQueueController(queueService: QueueService) {
  return {
    async checkInHandler(request: FastifyRequest, reply: FastifyReply) {
      const body = checkInBodySchema.safeParse(request.body);
      if (!body.success) {
        return validationError(reply, body.error.errors);
      }

      const entry = await queueService.checkIn({
        clinicId: request.user.activeClinicId,   // clinicId ALWAYS from the JWT, never the body
        userId: request.user.id,
        petId: body.data.petId,
        ...
      });

      return reply.status(201).send({ data: entry });
    },
```

**Schema: module schema extends the shared validator** — `queue.schema.ts:1-21` (complete file):

```typescript
import { z } from 'zod';
import { checkInSchema, queueStatusUpdateSchema } from '@breeyo/validators';

export const checkInBodySchema = checkInSchema.extend({
  reCheckIn: z.boolean().default(false),
});
export { queueStatusUpdateSchema as statusUpdateBodySchema };
export const entryParamsSchema = z.object({ entryId: z.string().uuid() });
export const queueBoardQuerySchema = z.object({ date: z.coerce.date().optional() });
```

→ `scheduling.schema.ts` gets `appointmentParamsSchema`, and a range query
`z.object({ from: z.coerce.date(), to: z.coerce.date(), vetId: z.string().uuid().optional() })`
serving both mobile day and web week views (RESEARCH Pattern 4).

**Types file: params interfaces, not inline args** — `queue.types.ts:1-24` (complete file):

```typescript
import type { CheckInInput, QueueStatus } from '@breeyo/types';

export interface CheckInParams extends CheckInInput {
  clinicId: string;
  userId: string;
  reCheckIn?: boolean;
}
export interface UpdateStatusParams {
  clinicId: string;
  entryId: string;
  status: QueueStatus;
  userId: string;
}
```

**App registration** — `app.ts:80-93`:

```typescript
  // Socket.IO and queue (depends on prisma + redis + jwt being registered)
  await app.register(socketPlugin);
  await app.register(import('./modules/queue/queue.routes.js'), { prefix: '/api/v1' });
  ...
  // Midnight archive cron (skip in test environment)
  if (!isTest) {
    scheduleMidnightArchive(app.prisma, app.io);
  }
```

→ Register scheduling **after** `socketPlugin` (it needs `fastify.io`), and follow the
`if (!isTest)` gate for the sweep worker (RESEARCH Pitfall 4/A5).

---

### `apps/api/src/modules/scheduling/appointment.service.ts` (service, CRUD + state machine)

**Analog:** `apps/api/src/modules/queue/queue.service.ts`

**Constructor + broadcast** (lines 15-19, 192-199):

```typescript
export class QueueService {
  constructor(
    private readonly repository: QueueRepository,
    private readonly io: Server | null = null,     // nullable so unit tests pass null
  ) {}
  ...
  private broadcast(clinicId: string, event: string, data: unknown) {
    if (this.io) {
      this.io.to(`clinic:${clinicId}`).emit(event, data);
    }
  }
}
```

**Error throw shape — copy verbatim for `SLOT_TAKEN`, `BOOKING_HORIZON_EXCEEDED`, `INVALID_TRANSITION`** (lines 41-46):

```typescript
if (activeEntry) {
  const error = new Error('Pet is already in today\'s queue') as Error & { statusCode: number; code: string };
  error.statusCode = 409;
  error.code = 'ALREADY_IN_QUEUE';
  throw error;
}
```

`apps/api/src/middleware/error-handler.ts:45-55` is what turns that into the response body —
`{ error: { code, message } }`. Anything `>= 500` is masked to `INTERNAL_SERVER_ERROR`, so
domain errors **must** set a 4xx `statusCode` or they vanish.

**State-machine validation + status-derived field writes** (lines 101-133):

```typescript
if (!isValidTransition(fromStatus, toStatus)) {
  const error = new Error(`Cannot transition from ${entry.status} to ${parsed.status}`) as Error & { statusCode: number; code: string };
  error.statusCode = 400;
  error.code = 'INVALID_TRANSITION';
  throw error;
}

const updateData: Record<string, unknown> = { status: parsed.status };
if (parsed.status === QueueStatus.IN_CONSULT) {
  updateData.treatingVetId = params.userId;
  updateData.calledAt = new Date();
}
if (parsed.status === QueueStatus.DONE || parsed.status === QueueStatus.NO_SHOW) {
  updateData.completedAt = new Date();
}

const updated = await this.repository.updateEntry(params.entryId, updateData);

this.broadcast(entry.clinicId, SOCKET_EVENTS.QUEUE_UPDATED, {
  entry: updated, updatedBy: params.userId, timestamp: Date.now(),
});
```

→ `Appointment` lifecycle (D-20: `SCHEDULED → CHECKED_IN → COMPLETED`, `CANCELLED`/`NO_SHOW`)
maps 1:1 onto this: `assertAppointmentTransition` + a `updateData` switch
(`checkedInAt`, `cancelledAt`, `completedAt`) + broadcast.

**Service-level Zod re-parse** (line 26) — the service parses again even though the controller
already did. Keep this; it's how the module keeps unit tests honest without a controller:

```typescript
const parsed = checkInSchema.parse({ petId: params.petId, visitReason: params.visitReason, isEmergency: params.isEmergency });
```

---

### `apps/api/src/modules/scheduling/appointment.state.ts` (utility, transform)

**Analog:** `packages/types/src/constants/queue-status.ts` (complete file, 24 lines)

```typescript
export enum QueueStatus {
  WAITING = 'WAITING',
  IN_CONSULT = 'IN_CONSULT',
  DONE = 'DONE',
  NO_SHOW = 'NO_SHOW',
}

export const QUEUE_TRANSITIONS: Record<QueueStatus, QueueStatus[]> = {
  [QueueStatus.WAITING]: [QueueStatus.IN_CONSULT, QueueStatus.NO_SHOW],
  [QueueStatus.IN_CONSULT]: [QueueStatus.DONE, QueueStatus.NO_SHOW],
  [QueueStatus.DONE]: [],
  [QueueStatus.NO_SHOW]: [],
};

export function isValidTransition(from: QueueStatus, to: QueueStatus): boolean {
  return QUEUE_TRANSITIONS[from]?.includes(to) ?? false;
}

export const QUEUE_STATUS_LABELS: Record<QueueStatus, string> = {
  [QueueStatus.WAITING]: 'Waiting',
  ...
};
```

**Decision for the planner:** this transition table lives in `@breeyo/types`, **not** in the API
module. Put `AppointmentStatus` + `APPOINTMENT_TRANSITIONS` + `isValidAppointmentTransition` +
`APPOINTMENT_STATUS_LABELS` in `packages/types/src/constants/scheduling.constants.ts` so
mobile and web render from the same table (RESEARCH's "Architectural Responsibility Map" row for
appointment lifecycle says exactly this). `appointment.state.ts` in the API module should then be
a thin `assertAppointmentTransition()` that throws the `statusCode`/`code` error shape above.

**`EXPECTED` addition (D-08)** requires edits in three synchronized places:

```prisma
// apps/api/prisma/schema.prisma:220-225 (current)
enum QueueEntryStatus {
  WAITING
  IN_CONSULT
  DONE
  NO_SHOW
}
```

```typescript
// packages/validators/src/queue.ts:9-11 (current) — must also gain EXPECTED
export const queueStatusUpdateSchema = z.object({
  status: z.enum(['WAITING', 'IN_CONSULT', 'DONE', 'NO_SHOW']),
});
```

Plus `QUEUE_TRANSITIONS` above: `EXPECTED → [WAITING, NO_SHOW, ...]` (D-09/D-11) and
`WAITING`'s entry unchanged.

---

### `apps/api/src/modules/scheduling/appointment.repository.ts` + `availability.repository.ts`

**Analogs:** `queue.repository.ts` (shared-include const, IST helper, raw-SQL escape hatch)
and `vaccination.repository.ts` (explicit-`clinicId`-first-param signature).

**Shared include constant + constructor** — `queue.repository.ts:1-12`:

```typescript
import type { PrismaClient, QueueEntryStatus } from '@prisma/client';

const PET_OWNER_INCLUDE = {
  pet: { include: { owner: true } },
} as const;

export class QueueRepository {
  constructor(private readonly prisma: PrismaClient) {}
```

**Explicit `clinicId` as first parameter — the tenancy pattern for every method** —
`vaccination.repository.ts:58-63`:

```typescript
async getVaccinationRecords(clinicId: string, petId: string) {
  return this.prisma.vaccinationRecord.findMany({
    where: { clinicId, petId },
    orderBy: { administeredAt: 'desc' },
  });
}
```

Note `tenant-context.ts:12-23` decorates `request.db` with an RLS-scoped client, but
`queue.routes.ts:9` injects `fastify.prisma` (unscoped). **Follow the dominant pattern:**
`fastify.prisma` + explicit `clinicId` filters in every `where`. Do not mix.

**IST midnight helper — the only IST date math that exists in the repo** — `queue.repository.ts:14-25`:

```typescript
/** Gets start of today in IST (Asia/Kolkata, UTC+5:30). */
static getTodayIST(date?: Date): Date {
  const now = date ?? new Date();
  const istString = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const [year, month, day] = istString.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, -5, -30, 0, 0));
}
```

→ Scheduling needs `getTodayIST` plus `addDaysIST`/`istDateOnly`. Either extract this into
`apps/api/src/lib/ist-date.ts` (and update `queue.repository.ts` + `midnight-archive.ts:16` to
import it) or call `QueueRepository.getTodayIST()`. **Do not duplicate the arithmetic inline.**

**Bulk sweep update (the `updateMany` shape the no-show pass needs)** — `queue.repository.ts:211-220`:

```typescript
async archiveEntries(beforeDate: Date) {
  return this.prisma.queueEntry.updateMany({
    where: {
      archivedAt: null,
      status: { in: ['WAITING', 'DONE', 'NO_SHOW'] },
      checkedInAt: { lt: beforeDate },
    },
    data: { archivedAt: new Date() },
  });
}
```

---

### `apps/api/prisma/schema.prisma` (new models)

**Analog:** `QueueEntry` (lines 277-300) — copy the field/`@map`/index/`@@map` conventions exactly:

```prisma
model QueueEntry {
  id            String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  clinicId      String           @map("clinic_id") @db.Uuid
  petId         String           @map("pet_id") @db.Uuid
  checkedInBy   String           @map("checked_in_by") @db.Uuid
  treatingVetId String?          @map("treating_vet_id") @db.Uuid
  status        QueueEntryStatus @default(WAITING)
  position      Int
  isEmergency   Boolean          @default(false) @map("is_emergency")
  visitReason   String?          @map("visit_reason")
  checkedInAt   DateTime         @default(now()) @map("checked_in_at")
  calledAt      DateTime?        @map("called_at")
  completedAt   DateTime?        @map("completed_at")
  archivedAt    DateTime?        @map("archived_at")
  updatedAt     DateTime         @updatedAt @map("updated_at")

  clinic Clinic @relation(fields: [clinicId], references: [id])
  pet    Pet    @relation(fields: [petId], references: [id])

  @@index([clinicId, status])
  @@index([clinicId, checkedInAt])
  @@index([clinicId, petId, checkedInAt])
  @@map("queue_entries")
}
```

Conventions to carry over verbatim: `@default(dbgenerated("gen_random_uuid()")) @db.Uuid` for ids,
`@db.Uuid` on every FK, `snake_case` `@map()` on every multi-word column, `@@map()` to a plural
snake_case table, `[clinicId, ...]`-leading composite indexes, and a back-relation added to
`Clinic` (see `schema.prisma:55` `queueEntries QueueEntry[]`) and `Pet` (line 266).

**`queuePriorityAt` (RESEARCH Pattern 3)** — add to the model above, then flip the two `orderBy`
clauses. Current code, `queue.repository.ts:129-134` and `162-165`:

```typescript
      orderBy: [
        { isEmergency: 'desc' },
        { checkedInAt: 'asc' },     // -> { queuePriorityAt: 'asc' }
      ],
```

Both sites (`findNextWaiting` **and** `getQueueBoard`'s waiting branch) must change, or
"call next" and the visible board disagree.

**Set-once write site** — `queue.service.ts:64-75`:

```typescript
// Assign position: waiting count + 1
const waitingCount = await this.repository.countWaiting(params.clinicId, today);

const entry = await this.repository.createEntry({
  clinicId: params.clinicId,
  petId: parsed.petId,
  checkedInBy: params.userId,
  status: 'WAITING',
  position: waitingCount + 1,
  isEmergency: parsed.isEmergency,
  visitReason: parsed.visitReason,
});
```

→ Add `queuePriorityAt: new Date()` here and `queuePriorityAt: appointment.scheduledFor` in the
sweep's EXPECTED creation. `createEntry`'s explicit-field-list body (`queue.repository.ts:74-95`)
must gain the field too — it does **not** spread `data`.

**`EXPECTED` also affects existing queries.** These three currently enumerate statuses and will
silently exclude/mis-handle `EXPECTED` unless updated: `findTodayActiveEntryForPet`
(`:36` `status: { in: ['WAITING', 'IN_CONSULT'] }`), `getQueueBoard`'s done branch
(`:170` `{ in: ['DONE', 'NO_SHOW'] }`), and `archiveEntries` (`:215`).
D-13 requires `EXPECTED` to render on the board, so `getQueueBoard` needs a **fourth** returned
group (or `EXPECTED` merged into `waiting` with the badge distinguishing it) — that also means
`packages/types/src/queue.ts:33-37` `QueueBoard` gains a field, and every mobile consumer of it
(`useQueueActions.ts:35-51` rebuilds all three arrays by hand) must be updated in the same pass.

---

### `apps/api/src/modules/scheduling/scheduling.sweep.worker.ts` (worker, batch/scheduled)

**Analogs (both partial):** `notification.worker.ts` for `new Worker(...)` construction,
`notification-bus.ts` for the `Queue` wrapper, `midnight-archive.ts` for the recurring-job intent.
**Nothing in the repo uses `upsertJobScheduler` today** — this is the phase's one genuinely new
BullMQ API.

**Queue construction + JOB_OPTIONS** — `notification-bus.ts:1-37` (complete file):

```typescript
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';

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
  async close(): Promise<void> { await this.queue.close(); }
}

export function createNotificationBus(redis: Redis): NotificationBus {
  const queue = new Queue('notifications', { connection: redis });
  return new NotificationBus(queue);
}
```

**Worker construction + factory signature** — `notification.worker.ts:7-16, 61-67`:

```typescript
export function createNotificationWorker(redis: Redis, prisma: PrismaClient): Worker {
  const pushService = new PushService();
  const worker = new Worker<NotificationEvent>(
    'notifications',
    async (job: Job<NotificationEvent>) => { /* handler body */ },
    { connection: redis, concurrency: 5 },
  );
  return worker;
}
```

**Recurring-schedule intent + `Asia/Kolkata` tz + error isolation** — `midnight-archive.ts:12-32`
(complete file). **Copy the shape, not the `node-cron` transport** (RESEARCH Pitfall 1 / A-list):

```typescript
export function scheduleMidnightArchive(prisma: PrismaClient, io: Server) {
  cron.schedule(
    '0 0 * * *',
    async () => {
      const today = QueueRepository.getTodayIST();
      try {
        const repository = new QueueRepository(prisma);
        const result = await repository.archiveEntries(today);
        console.log(`Midnight archive: ${result.count} entries archived`);
        io.emit(SOCKET_EVENTS.QUEUE_ARCHIVED, { timestamp: Date.now() });
      } catch (error) {
        console.error('Midnight archive failed:', error);
      }
    },
    { timezone: 'Asia/Kolkata' },
  );
}
```

**The anti-pattern to NOT copy** — `notification.routes.ts:13-26`. This is the exact
worker-in-routes-plugin problem RESEARCH Pitfall 4 flags; the scheduling module must gate
`new Worker(...)` behind `process.env.NODE_ENV !== 'test'` while still constructing the `Queue`:

```typescript
  // Initialize notification bus and worker
  const bus = createNotificationBus(fastify.redis);
  const worker = createNotificationWorker(fastify.redis, fastify.prisma);   // <- unconditional, fires during vitest

  if (!fastify.hasDecorator('notificationBus')) {
    fastify.decorate('notificationBus', bus);
  }

  fastify.addHook('onClose', async () => {
    await worker.close();
    await bus.close();
  });
```

Keep the `hasDecorator` guard and the `onClose` cleanup hook — both are correct and needed.
Export `runSchedulingSweep(deps)` as a plain function so tests can call it directly.

---

### `apps/api/src/modules/scheduling/push-trigger.service.ts` (service, event-driven)

**Analog:** `notification.worker.ts:17-58` — the full in-app-row + push + token-cleanup sequence
already exists. D-26/D-27 need **new call sites**, not new infrastructure:

```typescript
for (const userId of event.recipientUserIds) {
  // 1. Create in-app notification record
  await prisma.notification.create({
    data: {
      recipientUserId: userId,
      clinicId: event.clinicId,
      type: event.type,
      module: event.module,
      title: event.title,
      body: event.body,
      data: (event.data ?? {}) as Prisma.InputJsonValue,
    },
  });

  // 2. Send push notification if enabled
  if (sendPush) {
    const deviceTokens = await prisma.deviceToken.findMany({ where: { userId } });
    if (deviceTokens.length > 0) {
      const tokens = deviceTokens.map((dt) => dt.token);
      const result = await pushService.send(tokens, event.title, event.body, event.data);

      // 3. Clean up invalid tokens
      if (result.invalidTokens.length > 0) {
        await prisma.deviceToken.deleteMany({ where: { userId, token: { in: result.invalidTokens } } });
      }
    }
  }
}
```

→ The Phase 8 path is: build a `NotificationEvent` and `await fastify.notificationBus.emit(event)`
(decorated at `notification.routes.ts:19`). `PushService.send()` (`push.service.ts:18-71`) already
handles `Expo.isExpoPushToken` filtering, `chunkPushNotifications`, and `DeviceNotRegistered`
detection — do not touch it.

The event payload contract is fixed by `packages/types/src/notification.ts:19-29`, and
`sendPush?: boolean` gives D-26's "staff-only, extensible to owners later" for free — an owner
recipient is a new `recipientUserIds` entry plus a token registration, exactly as D-26 requires.

**D-16 MOVE staff task:** RESEARCH Open Question 3 recommends reusing `Notification`.
`NotificationType` has no `MOVE_REQUEST` value — either add one to
`packages/types/src/notification.ts:1-8` or reuse `APPOINTMENT_REMINDER`/`QUEUE_CHANGE`.
Prefer adding an explicit value; the enum is a shared type with no DB enum backing it
(`Notification.type` is a plain `String` per `schema.prisma:179+`), so it's a cheap edit.

---

### `apps/api/src/lib/audit-log.ts` (utility — extend, don't cast)

**Analog:** itself. Phase 4 already set the extension precedent at lines 25-32:

```typescript
  // EMR & Clinical Records (Phase 4) — EMR-07 / D-62
  CONSULTATION_FINALIZED = 'CONSULTATION_FINALIZED',
  ADDENDUM_ADDED = 'ADDENDUM_ADDED',
  PRESCRIPTION_DOSAGE_OVERRIDDEN = 'PRESCRIPTION_DOSAGE_OVERRIDDEN',
  VACCINATION_RECORDED = 'VACCINATION_RECORDED',
  DEWORMING_RECORDED = 'DEWORMING_RECORDED',
  ATTACHMENT_UPLOADED = 'ATTACHMENT_UPLOADED',
  ATTACHMENT_DELETED = 'ATTACHMENT_DELETED',
```

→ Append a `// Scheduling & Calendar (Phase 8) — SCH-0X / D-XX` block with
`APPOINTMENT_CREATED`, `APPOINTMENT_RESCHEDULED`, `APPOINTMENT_CANCELLED`, `APPOINTMENT_NO_SHOW`,
`AVAILABILITY_UPDATED`. A string cast is the tell that this wasn't done (RESEARCH Pitfall 3).

**Call-site pattern** — `emr.service.ts:180-189`:

```typescript
// EMR-07 / D-62: Audit trail for consultation finalization
await writeAuditLog(this.prisma, AuditEvent.CONSULTATION_FINALIZED, {
  userId: vetId,
  clinicId,
  metadata: {
    consultationId,
    petId: consultation.petId,
    visitType: consultation.visitType,
  },
});
```

Note `writeAuditLog` writes to `prisma.authAuditLog` (`audit-log.ts:49`) — the table name is
auth-flavoured but is the project-wide audit sink. Domain ids go in `metadata`, not new columns.

---

### `packages/validators/src/scheduling.ts` + `packages/types/src/scheduling.ts`

**Analogs:** `packages/validators/src/emr.ts` (rich nested schemas + inferred type exports),
`packages/validators/src/queue.ts` (minimal), `packages/types/src/queue.ts` (entity + `WithX` +
input interfaces).

**Validator conventions** — `validators/queue.ts:1-15` (complete) and `validators/emr.ts:46-58`:

```typescript
import { z } from 'zod';

export const checkInSchema = z.object({
  petId: z.string().uuid(),
  visitReason: z.string().max(100).optional(),
  isEmergency: z.boolean().default(false),
});

export type CheckInInput = z.infer<typeof checkInSchema>;
```

```typescript
export const finalizeConsultationSchema = z.object({
  followUpDate: z.string().datetime().optional(),
  followUpReason: z.string().max(500).optional(),
});
export type FinalizeConsultationInput = z.infer<typeof finalizeConsultationSchema>;
```

Every schema file ends with `z.infer` type exports; every file is re-exported from
`packages/validators/src/index.ts` (8 lines, `export * from './queue.js';` — ESM `.js` extension
required). Same for `packages/types/src/index.ts` (12 lines) and
`packages/types/src/constants/index.ts` (14 lines).

For minutes-from-midnight fields (RESEARCH Pattern 1), the bounded-int idiom from `emr.ts:11-16`
applies: `z.number().int().min(0).max(1439)`; weekday `z.number().int().min(0).max(6)`.

**Types conventions** — `types/queue.ts:1-43`:

```typescript
import type { QueueStatus } from './constants/queue-status.js';

export interface QueueEntry {
  id: string;
  clinicId: string;
  petId: string;
  ...
  checkedInAt: Date;
  calledAt: Date | null;      // nullables as `| null`, not `?`
  ...
}

export interface QueueEntryWithPet extends QueueEntry {
  pet: { id: string; name: string; species: string; owner: { id: string; name: string; mobile: string } };
}

export interface QueueBoard { inConsult: QueueEntryWithPet[]; waiting: QueueEntryWithPet[]; done: QueueEntryWithPet[] }

export interface CheckInInput { petId: string; visitReason?: string; isEmergency?: boolean }
```

---

### `apps/mobile/src/features/scheduling/hooks/*` (hooks)

**Analogs:** `useQueue.ts` (query), `useQueueActions.ts` (optimistic mutations),
`useQueueSocket.ts` (pub-sub). All three read in full this session.

**Query hook — complete file, `useQueue.ts:1-29`:**

```typescript
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api';
import { useAuth } from '../../../providers/AuthProvider';
import type { QueueBoard } from '@breeyo/types';

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function useQueue() {
  const { accessToken, activeClinicId } = useAuth();
  const today = formatDate(new Date());

  return useQuery({
    queryKey: ['queue', activeClinicId, today],
    queryFn: () => apiClient<{ data: QueueBoard }>(`/api/v1/queue?date=${today}`, { token: accessToken! }),
    enabled: !!accessToken && !!activeClinicId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    select: (response) => response.data,
  });
}
```

→ `useSchedule(date)` becomes `queryKey: ['schedule', activeClinicId, from, to, vetId]` with the
same `enabled`/`staleTime`/`select` block. The key's clinic-then-date shape matters because
invalidation is done by prefix (see socket hook below).

**Socket hook — `useQueueSocket.ts:9-31, 48-66`:**

```typescript
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

export function useQueueSocket() {
  const { accessToken, activeClinicId } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const queryClient = useQueryClient();
  const setOffline = useQueueUIStore((s) => s.setOffline);

  useEffect(() => {
    if (!accessToken || !activeClinicId) return;

    const socket = io(API_URL, {
      auth: { token: accessToken },              // matches socket.ts:37 handshake.auth.token
      transports: ['websocket'],                 // matches socket.ts:18 server config
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });

    socket.on(SOCKET_EVENTS.QUEUE_UPDATED, () => {
      queryClient.invalidateQueries({ queryKey: ['queue', activeClinicId] });   // prefix invalidation
    });

    socket.on('connect', () => {
      setOffline(false);
      queryClient.invalidateQueries({ queryKey: ['queue', activeClinicId] });
    });
    socket.on('connect_error', () => { setOffline(true); });
    socket.on('disconnect', () => { setOffline(true); });

    socketRef.current = socket;
    return () => { socket.disconnect(); };
  }, [accessToken, activeClinicId, queryClient, soundEnabled, setOffline]);

  return socketRef;
}
```

Import style is worth copying exactly — the deep subpath avoids pulling the barrel into RN:
`import { SOCKET_EVENTS } from '@breeyo/types/constants/socket-events';` (line 4).

**Server side of that contract** — `apps/api/src/realtime/socket.ts:34-60`: JWT from
`socket.handshake.auth.token`, rejects non-`access` tokens, and `socket.join('clinic:' + clinicId)`
on both `io.use` and the `connection` handler (re-join on reconnect). New scheduling events need
new keys in `packages/types/src/constants/socket-events.ts` (complete file, 7 lines):

```typescript
export const SOCKET_EVENTS = {
  PATIENT_CHECKED_IN: 'patient:checked-in',
  QUEUE_UPDATED: 'queue:updated',
  QUEUE_ARCHIVED: 'queue:archived',
  PATIENT_REGISTERED: 'patient:registered',
  PATIENT_UPDATED: 'patient:updated',
} as const;
```

→ add `APPOINTMENT_CREATED: 'appointment:created'`, `APPOINTMENT_UPDATED: 'appointment:updated'`,
`APPOINTMENT_CANCELLED: 'appointment:cancelled'`, `AVAILABILITY_UPDATED: 'availability:updated'`.

**Optimistic mutation + the Socket.IO flicker workaround** — `useQueueActions.ts:26-32, 66-78`:

```typescript
    onMutate: async ({ entryId, status }) => {
      const today = new Date().toISOString().split('T')[0];
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
```

The 300 ms `onSettled` delay is a real, hard-won detail — carry it into appointment mutations,
which have the same optimistic-write-then-broadcast race.

**Zustand UI store — complete file, `queueUIStore.ts:1-19`:**

```typescript
import { create } from 'zustand';

interface QueueUIState {
  isOffline: boolean;
  soundEnabled: boolean;
  showDoneSection: boolean;
  setOffline: (offline: boolean) => void;
  ...
}

export const useQueueUIStore = create<QueueUIState>((set) => ({
  isOffline: false,
  soundEnabled: true,
  showDoneSection: false,
  setOffline: (isOffline) => set({ isOffline }),
  toggleDoneSection: () => set((state) => ({ showDoneSection: !state.showDoneSection })),
}));
```

→ `scheduleUIStore.ts`: `isOffline`, `selectedDate`, `vetFilter` (D-23), `viewMode`.
Server data never goes in Zustand — React Query owns it.

---

### `apps/mobile/src/features/scheduling/screens/DayAgendaScreen.tsx` (screen)

**Analog:** `QueueScreen.tsx` (230 lines, read in full)

**Screen skeleton — hooks, then three explicit render states** (lines 23-46, 116-152):

```typescript
export function QueueScreen() {
  const router = useRouter();
  const { activeClinicId } = useAuth();
  const isOffline = useQueueUIStore((s) => s.isOffline);
  const [checkInVisible, setCheckInVisible] = useState(false);

  useQueueSocket();                                   // socket first, no return value used

  const { data: queueData, isLoading, isError, refetch, isRefetching } = useQueue();
  const updateStatus = useUpdateQueueStatus();
  const callNext = useCallNext();
  ...
  if (isLoading) { /* title + <ActivityIndicator size="large" /> */ }
  if (isError)   { /* title + "Could not load queue. Pull down to try again." */ }

  return (
    <View style={styles.container}>
      <Text variant="headlineLarge" style={styles.title}>Walk-in Queue</Text>
      <OfflineBanner />
      ...
      <FAB icon="plus" label="Check In" onPress={() => setCheckInVisible(true)}
        style={[styles.fab, isOffline && styles.fabDisabled]}
        disabled={isOffline} color="#FFFFFF" customSize={56} testID="check-in-fab" />
      <CheckInSheet visible={checkInVisible} onDismiss={() => setCheckInVisible(false)}
        onCheckInSuccess={handleCheckInSuccess} />
    </View>
  );
}
```

**Every handler is `useCallback`-wrapped** (lines 48-114). **Every destructive action goes through
`Alert.alert` with a `destructive`-styled confirm** (lines 59-80) — reuse verbatim for
appointment cancel:

```typescript
  const handleNoShow = useCallback((entryId: string) => {
    Alert.alert('Mark as No-show?', 'This patient will be removed from the active queue.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Mark No-show', style: 'destructive', onPress: () => { updateStatus.mutate({ entryId, status: QueueStatus.NO_SHOW }); } },
    ]);
  }, [updateStatus]);
```

**Success feedback:** `showToast('success', \`${petName} checked in — Position #${position}\`)`
from `@breeyo/ui` (line 111).

**Colors are hard-coded hex in mobile screens**, not theme lookups: `#FFFBF5` background,
`#2E7D32` FAB, `#1C1B1F` title, `#49454F` secondary text, `#CAC4D0` disabled (lines 194-229).
Match this — do not introduce a different theming approach in one new screen.

**New tab registration** — `apps/mobile/app/(app)/(tabs)/_layout.tsx` (complete file, 2 tabs today):

```typescript
      <Tabs.Screen
        name="patients"
        options={{
          title: 'Patients',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="paw" size={size} color={color} />
          ),
        }}
      />
```

→ Add a `schedule` tab (`calendar-month` icon) plus `apps/mobile/app/(app)/(tabs)/schedule.tsx`
that just renders `<DayAgendaScreen />`, mirroring `patients.tsx`.

---

### `apps/mobile/src/features/scheduling/components/AppointmentQuickSheet.tsx`

**Analog:** `CheckInSheet.tsx` (304 lines) — this **is** the D-19 mobile-lookup flow
(Phase 3 D-05/D-13) that booking must reuse. Copy it, don't re-derive it.

**Mobile formatting + validation + lookup-query wiring** (lines 19-49):

```typescript
function formatMobile(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 10);
  if (digits.length > 5) return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  return digits;
}
function extractDigits(formatted: string): string { return formatted.replace(/\D/g, ''); }

const mobile = extractDigits(mobileDisplay);
const isValidMobile = /^[6-9]\d{9}$/.test(mobile);

const lookupQuery = useLookupOwner(mobile);          // apps/mobile/src/features/patient/hooks/usePatientRegister
const ownerData = lookupQuery.data?.data as OwnerWithPets | undefined;
const isLooking = lookupQuery.isFetching;
const ownerNotFound = isValidMobile && !isLooking && !ownerData;
```

**Sheet container + reset-on-close + nested second sheet** (lines 51-58, 153-159, 232-238):

```typescript
  useEffect(() => {
    if (!visible) { setMobileDisplay(''); setSelectedPet(null); setShowReasonPicker(false); }
  }, [visible]);

  return (
    <>
      <BottomSheet visible={visible && !showReasonPicker} onDismiss={onDismiss} title="Check In Patient">
        <TextInput label="Mobile Number" value={mobileDisplay} onChangeText={handleMobileChange}
          keyboardType="phone-pad" maxLength={11} left={<TextInput.Icon icon="phone" />}
          testID="check-in-mobile-input" />
        ...
      </BottomSheet>
      <VisitReasonPicker visible={showReasonPicker} onDismiss={...} onSelect={handleReasonSelected} />
    </>
  );
```

The `visible={visible && !showReasonPicker}` + sibling-sheet trick is exactly how a booking sheet
should chain mobile → pet(s) → service → slot → confirm. **D-21 divergence:** `handlePetTap`
(lines 64-67) selects a single pet; multi-pet appointments need multi-select
(`Set<petId>`), which is the one real deviation from this analog.

**Business-error handling by `error.code`** (lines 83-114) — the shape appointment booking needs
for the D-14 double-book warning override:

```typescript
      } catch (error: any) {
        if (error?.code === 'SAME_DAY_RECHECK') {
          Alert.alert('Check in again?', `${selectedPet.name} was already seen today. Check in for another visit?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Check In Again', onPress: async () => {
                await checkInMutation.mutateAsync({ petId: selectedPet.id, ..., reCheckIn: true });   // retry with override flag
              } },
          ]);
        } else if (error?.status === 409) { ... }
      }
```

→ D-14: server returns `409 SLOT_DOUBLE_BOOKED` (unless `allowDoubleBook: true`), client shows the
warning Alert and retries with `allowDoubleBook: true`. This is a direct structural copy of
`reCheckIn`. `error.code` / `error.status` come from `ApiClientError`
(`apps/mobile/src/lib/api.ts:36-46`).

---

### `apps/mobile/src/features/scheduling/components/AppointmentCardItem.tsx` + `QueueCardItem.tsx` (modified for D-13)

**Analog:** `QueueCardItem.tsx` (178 lines, read in full)

**Status→badge-variant map** (lines 20-25) — the exact spot D-13's `EXPECTED` badge plugs into:

```typescript
const STATUS_TO_VARIANT: Record<string, 'waiting' | 'inConsult' | 'done' | 'noShow'> = {
  WAITING: 'waiting',
  IN_CONSULT: 'inConsult',
  DONE: 'done',
  NO_SHOW: 'noShow',
};
```

**Blocker:** `packages/ui/src/atoms/StatusBadge/StatusBadge.ts:8-16` has a closed variant union —
`waiting | inConsult | done | noShow | paid | unpaid | overdue | processing`. Add `expected`:

```typescript
export const STATUS_CONFIG: Record<StatusVariant, StatusConfigEntry> = {
  waiting:   { defaultLabel: 'Waiting',   bgColor: 'tertiaryContainer',  textColor: 'onTertiaryContainer' },
  inConsult: { defaultLabel: 'In Consult', bgColor: 'primaryContainer',  textColor: 'onPrimaryContainer' },
  done:      { defaultLabel: 'Done',      bgColor: 'surfaceVariant',    textColor: 'onSurfaceVariant' },
  noShow:    { defaultLabel: 'No Show',   bgColor: 'errorContainer',    textColor: 'onErrorContainer' },
  ...
};
```

`bgColor`/`textColor` are **theme-token key names** resolved at render
(`colors[config.bgColor] || config.bgColor`, line 90) — use a token name like
`secondaryContainer`, not a hex value. `StatusBadge.test.ts` exists next to it, so a
`Record<StatusVariant, ...>` addition will surface in tests immediately.

**Card layout to mirror** (lines 47-111): 44 px species avatar (`SPECIES_ICONS[speciesKey]`),
flex-1 info column (`titleMedium` pet name → `bodySmall` reason → owner → timestamp),
right-side rail with position/wait + pressable `StatusBadge`, `minHeight: 80`, left border
accent for emergencies (`borderLeftWidth: 4`, `#BA1A1A`), full `accessibilityLabel` string, and:

```typescript
function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}
```

`en-IN` + `hour12: true` is the project's time format — the day agenda and week grid must match.

---

### `apps/mobile/src/features/scheduling/screens/AvailabilitySettingsScreen.tsx`

**Analog:** `apps/mobile/app/setup-wizard/clinic-hours.tsx` (206 lines) + `src/lib/wizard-utils.ts`
(66 lines). This is the closest thing to a weekly-hours editor and it already exists — a strong
match for D-01's weekly template UI (per-vet instead of per-clinic).

**Weekday-loop editor with per-day closed toggle** — `clinic-hours.tsx:24-33, 66-80`:

```typescript
  const [hours, setHours] = useState<WeekHours>(getDefaultHours);

  const updateDay = (day: DayOfWeek, updates: Partial<DayHours>) => {
    setHours((prev) => ({ ...prev, [day]: { ...prev[day], ...updates } }));
  };
  ...
      {DAYS_OF_WEEK.map((day) => (
        <View key={day} style={styles.dayRow}>
          <View style={styles.dayHeader}>
            <Text style={styles.dayLabel}>{day}</Text>
            <View style={styles.closedToggle}>
              <Text style={styles.closedLabel}>Closed</Text>
              <Switch value={hours[day].isClosed}
                onValueChange={(value) => updateDay(day, { isClosed: value })}
                testID={`closed-toggle-${day}`} />
```

**Pure, RN-free shape helpers extracted for testability** — `wizard-utils.ts:1-52`:

```typescript
// Utility functions for the setup wizard flow
// Extracted for testability without React Native dependencies
export const DAYS_OF_WEEK = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'] as const;
export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];
export interface DayHours { isClosed: boolean; openTime: string; closeTime: string }
export type WeekHours = Record<DayOfWeek, DayHours>;

export function getDefaultHours(): WeekHours {
  const hours = {} as WeekHours;
  for (const day of DAYS_OF_WEEK) {
    hours[day] = day === 'Sunday'
      ? { isClosed: true,  openTime: '09:00', closeTime: '18:00' }
      : { isClosed: false, openTime: '09:00', closeTime: '18:00' };
  }
  return hours;
}

export function formatHoursForApi(hours: WeekHours) {
  return DAYS_OF_WEEK.map((day) => ({
    day, isClosed: hours[day].isClosed,
    openTime:  hours[day].isClosed ? null : hours[day].openTime,
    closeTime: hours[day].isClosed ? null : hours[day].closeTime,
  }));
}
```

**Caution — two conflicting conventions.** This file indexes weekdays as
`Monday..Sunday` strings while RESEARCH Pattern 1's `VetAvailabilityTemplate.weekday` is
`0=Sunday..6=Saturday` ints, and the display format is `"09:00"` strings while the new models use
minutes-from-midnight ints. Put the `"HH:MM"` ↔ minutes and label ↔ index conversions in **one**
place (`packages/types/src/constants/scheduling.constants.ts`, next to the transition table) and
have both the settings screen and the API use it. Do not scatter `parseInt(t.split(':'))`.

Also note this screen writes via bare `apiClient` + `getAccessToken()` + `Alert` (lines 36-60)
rather than React Query. The Phase 8 settings screen should use a React Query mutation
(`useQueueActions.ts` shape) — it lives inside the authenticated app, not the pre-auth wizard.

---

### `apps/web/app/schedule/*` (Next.js — first real screen, D-25)

**Analog:** essentially none. Verified full inventory of `apps/web`:
`next-env.d.ts`, `package.json`, `tsconfig.json`, `app/layout.tsx` (16 lines),
`app/page.tsx` (8 lines), `src/lib/api.ts` (23 lines).

**Existing web API client — complete file, `apps/web/src/lib/api.ts:1-23`:**

```typescript
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export async function apiClient<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    credentials: 'include',
    ...options,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'Request failed');
  return data as T;
}
```

**Gap:** it has no `token` option and relies on `credentials: 'include'`, but the API's
`authenticate` middleware + Socket.IO handshake both expect a **Bearer/`auth.token` access token**
(`socket.ts:37-49`). The richer mobile client is the better analog —
`apps/mobile/src/lib/api.ts:1-46`:

```typescript
interface RequestOptions extends RequestInit { token?: string }

export async function apiClient<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { token, headers, ...rest } = options;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...rest,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new ApiClientError(data.error?.message || 'Request failed', data.error?.code || 'UNKNOWN_ERROR', response.status, data.error?.details);
  }
  return data as T;
}

export class ApiClientError extends Error {
  constructor(message: string, public code: string, public status: number, public details?: Record<string, unknown>) {
    super(message); this.name = 'ApiClientError';
  }
}
```

→ Port the `token` + `ApiClientError` shape into `apps/web/src/lib/api.ts` (keeping
`NEXT_PUBLIC_API_URL`). **Web has no auth flow at all today** — how the week grid obtains an
access token is an unresolved gap the planner must scope explicitly (it is not in CONTEXT.md's
decisions and is a prerequisite for both the API reads and the Socket.IO handshake).

**Design tokens for D-25** — `packages/ui/src/theme/portal.css` (97 lines, auto-generated):

```css
/* Auto-generated by @breeyo/ui — do not edit manually */
:root {
  --color-primary: #2E7D32;
  --color-on-primary: #FFFFFF;
  --color-background: #FFFBF5;
  --color-surface-variant: #F5F0EB;
  --color-outline: #79747E;
  --color-outline-variant: #CAC4D0;
  ...
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
```

Regenerate with `pnpm --filter @breeyo/ui generate:css-tokens`; import once in
`apps/web/app/layout.tsx` (which currently imports nothing). `@breeyo/ui` itself is React
Native-only — **do not** import components from it into `apps/web`, only this stylesheet.
`apps/web/package.json` deps today are exactly `next`, `react`, `react-dom`, `@breeyo/types`
(so `@breeyo/ui` must be added as a workspace dep for the CSS import, alongside
`socket.io-client@^4.8.3` at the same version `apps/mobile` pins).

**Socket hook for web** — port `useQueueSocket.ts` (excerpt above) with three changes:
`process.env.NEXT_PUBLIC_API_URL`, drop `expo-haptics`, and add `'use client'` at the top.
`transports: ['websocket']` and `auth: { token }` must stay — the server sets
`transports: ['websocket']` at `socket.ts:18` and requires the handshake token at `socket.ts:37`.
CORS is already permissive for sockets (`socket.ts:15` `CORS_ORIGIN || '*'`) and
`app.ts:39-45` already allows `WEB_URL || 'http://localhost:3001'` for HTTP —
matching web's `next dev -p 3001`.

---

### Tests

**Unit test analog** — `apps/api/src/modules/queue/__tests__/queue.service.test.ts:1-34`
(hand-rolled `vi.fn()` repository mock; no DB):

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueueService } from '../queue.service.js';
import type { QueueRepository } from '../queue.repository.js';
import type { Server } from 'socket.io';

function createMockRepository(): QueueRepository {
  return {
    findTodayActiveEntryForPet: vi.fn(),
    countWaiting: vi.fn(),
    createEntry: vi.fn(),
    ...
  } as unknown as QueueRepository;
}

function createMockIO(): Server {
  const emitFn = vi.fn();
  return { to: vi.fn().mockReturnValue({ emit: emitFn }) } as unknown as Server;
}

const CLINIC_ID = '00000000-0000-0000-0000-000000000001';
const USER_ID   = '00000000-0000-0000-0000-000000000010';
const PET_ID    = '00000000-0000-0000-0000-000000000003';
```

Fixed sequential UUID constants + full mock entity literals (lines 36-83) — copy that style for
appointment fixtures. `slot.service.ts` needs no mocks at all if kept pure.

**Integration test analog** — `apps/api/tests/queue/queue-board.test.ts:1-88`
(`app.inject`, not supertest; local per-file setup helpers):

```typescript
import { buildTestApp, closeTestApp } from '../helpers/app.js';
import { cleanupTestData, createTestUser, createTestClinic, createTestClinicMember, createTestTokens, prisma } from '../helpers/factories.js';

async function setupTestContext() {
  const user = await createTestUser();
  const clinic = await createTestClinic(user.id);
  await createTestClinicMember(user.id, clinic.id);       // defaults to 'Admin' role
  const { accessToken } = await createTestTokens(app, user.id, clinic.id);
  return { user, clinic, accessToken };
}

const res = await app.inject({
  method: 'POST',
  url: '/api/v1/queue/check-in',
  headers: { authorization: `Bearer ${token}` },
  payload: { petId: pet.id, ...overrides },
});

beforeAll(async () => { app = await buildTestApp(); });
afterAll(async () => { await closeTestApp(); });
```

`buildTestApp()` (`tests/helpers/app.ts`) memoizes a single app instance and calls
`buildApp({ logger: false })` — so **every route file registers during tests**, which is why the
sweep `Worker` must be env-gated.

**Factory + cleanup extension** — `tests/helpers/factories.ts:35-51` for the factory style
(`overrides` object, `randomUUID().slice()` uniqueness, direct `prisma.X.create`) and
`103-137` for cleanup, which is a **hand-maintained reverse-FK-order delete list**:

```typescript
export async function cleanupTestData() {
  await prisma.$transaction(async (tx) => {
    ...
    await tx.consultation.deleteMany();
    await tx.queueEntry.deleteMany();
    await tx.consentRecord.deleteMany();
    await tx.serviceCatalog.deleteMany();
    await tx.pet.deleteMany();
    await tx.petOwner.deleteMany();
    await tx.clinic.deleteMany();
    await tx.user.deleteMany();
  });
}
```

→ New tables must be deleted **before** `queueEntry`/`pet`/`clinic`: `appointmentPet` (if a join
table for D-21), `appointment`, `blockedPeriod`, `availabilityOverride`, `vetAvailabilityTemplate`.
The comment at lines 115-119 documents exactly this failure mode from Phase 3/4 — don't repeat it.

---

## Shared Patterns

### Multi-tenancy (applies to every repository + controller)
**Sources:** `apps/api/src/modules/vaccination/vaccination.repository.ts:58-63`,
`apps/api/src/modules/queue/queue.controller.ts:28-29`
**Apply to:** all scheduling repositories, services, controllers
- `clinicId` is **always** the first parameter of a repository method and always in the `where`.
- `clinicId` comes from `request.user.activeClinicId` — never from a request body or query.
- Cross-tenant miss returns 404 (`ENTRY_NOT_FOUND` style), not 403.
- Inject `fastify.prisma` in routes (`queue.routes.ts:9`), not `request.db`.

### Error handling
**Source:** `apps/api/src/modules/queue/queue.service.ts:41-46` + `apps/api/src/middleware/error-handler.ts:45-55`
**Apply to:** all scheduling services
```typescript
const error = new Error('<human message>') as Error & { statusCode: number; code: string };
error.statusCode = 409;
error.code = 'SLOT_DOUBLE_BOOKED';
throw error;
```
Anything without a 4xx `statusCode` becomes an opaque `INTERNAL_SERVER_ERROR`.
Bare `ZodError`s are auto-converted to `400 VALIDATION_ERROR` (`error-handler.ts:10-19`).

### Validation (three layers, all present today)
**Sources:** `packages/validators/src/queue.ts` → `apps/api/src/modules/queue/queue.schema.ts`
→ `queue.controller.ts:22-25` (`safeParse` + `validationError`) → `queue.service.ts:26` (`.parse`)
**Apply to:** every scheduling write endpoint. Shared schema in `@breeyo/validators` (so mobile
forms reuse it), module-local `.extend()` for API-only fields, `safeParse` in the controller,
`.parse` again in the service.

### Real-time broadcast
**Source:** `apps/api/src/modules/queue/queue.service.ts:192-199` + `apps/api/src/realtime/socket.ts:34-60`
**Apply to:** appointment create/reschedule/cancel, availability update, EXPECTED creation
```typescript
this.io.to(`clinic:${clinicId}`).emit(event, { entry: updated, updatedBy: userId, timestamp: Date.now() });
```
Room is `clinic:{clinicId}`, joined automatically from the JWT. Payload convention:
`{ <entity>, updatedBy?, timestamp: Date.now() }`. Event name constants live in
`packages/types/src/constants/socket-events.ts`.

### Notifications + push
**Source:** `apps/api/src/modules/notifications/notification.worker.ts:17-58`,
`push.service.ts:18-71`, `notification-bus.ts:15-17`
**Apply to:** all three D-27 triggers and the D-16 MOVE staff task
Emit a `NotificationEvent` on `fastify.notificationBus`; the existing worker creates the in-app
`Notification` row, sends Expo push to all of that user's `DeviceToken`s, and prunes
`DeviceNotRegistered` tokens. `sendPush: false` suppresses push for in-app-only events.

### Audit logging
**Source:** `apps/api/src/lib/audit-log.ts:44-62`, call site `emr.service.ts:180-189`
**Apply to:** appointment create/reschedule/cancel/no-show, availability update
Extend the `AuditEvent` enum (never cast a string), pass `{ userId, clinicId, metadata }`.

### IST date handling
**Source:** `apps/api/src/modules/queue/queue.repository.ts:14-25` (`static getTodayIST`),
`apps/api/src/jobs/midnight-archive.ts:30` (`{ timezone: 'Asia/Kolkata' }`),
`QueueCardItem.tsx:27-30` (`toLocaleTimeString('en-IN', { hour12: true })`)
**Apply to:** slot generation, sweep windows, day/week range queries, all calendar rendering
No date library is installed anywhere in the monorepo — keep it that way (RESEARCH § Alternatives).

### ESM import discipline
**Source:** every API file, e.g. `queue.routes.ts:2-6`
**Apply to:** all new API and shared-package files
Relative imports carry `.js` (`'./queue.repository.js'`, `'../../middleware/authenticate.js'`)
even though sources are `.ts`. Mobile/web imports do **not** use extensions.
Mobile uses deep subpaths for constants: `'@breeyo/types/constants/socket-events'`.

---

## No Analog Found

Planner should use RESEARCH.md patterns (and flag the added risk) for these:

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `apps/api/src/modules/scheduling/slot.service.ts` | utility (pure) | transform | No pure slot/interval-math module exists. RESEARCH's transplant source (Phase 7 `slot.service.ts`) is unbuilt. Closest structural precedent: `apps/api/src/modules/emr/dosage.service.ts` (a `DosageService` class doing range computation) — but Phase 8's should be **exported plain functions**, not a class, so it is DB-free unit-testable per RESEARCH's Validation Architecture. |
| `apps/api/src/modules/scheduling/scheduling.sweep.worker.ts` | worker | batch/scheduled | `upsertJobScheduler` is used nowhere in the repo. Only precedents are an event-driven `Worker` (`notification.worker.ts`) and in-process `node-cron` (`midnight-archive.ts`) — the latter is an explicit anti-pattern here (RESEARCH Pitfall 1). Idempotency marker columns + Redis-coordinated scheduling are both new. |
| `apps/api/src/modules/scheduling/reminder.service.ts` | service | batch | Depends on Phase 7's `WhatsAppReminderTask` model + `kind` enum + consent pipeline, **none of which exist**. No reminder machinery of any kind is in the repo. |
| D-12 / D-16 owner-action bridge (`appointment:keep|move|cancel:<id>`) | service | event-driven | Depends on Phase 7's `InboundRouterService` and payload namespace. Does not exist. Must be a gated wave. |
| `apps/web/app/schedule/WeekGrid.tsx` | component | — | `apps/web` has zero components. `@breeyo/ui` is React Native-only. No CSS-grid/time-grid precedent anywhere. |
| `apps/web/app/schedule/AppointmentDrawer.tsx` | component | request-response | Same. Mobile's `BottomSheet` (`@breeyo/ui`) cannot be reused on web. |
| Web authentication / token acquisition | middleware | request-response | No auth flow, provider, or session handling exists in `apps/web` (`src/lib/api.ts` assumes cookies the API doesn't issue for this path). Prerequisite for both the calendar reads and the Socket.IO handshake; not covered by any D-XX decision. |

---

## Metadata

**Analog search scope:**
`apps/api/src/modules/{queue,vaccination,notifications,emr,clinic,auth}`,
`apps/api/src/{lib,middleware,jobs,realtime,app.ts}`, `apps/api/prisma/{schema.prisma,seed.ts}`,
`apps/api/tests/{helpers,queue}`, `apps/mobile/src/features/queue/**`, `apps/mobile/src/lib`,
`apps/mobile/app/(app)/(tabs)`, `apps/mobile/app/setup-wizard`, `apps/web/**`,
`packages/types/src/**`, `packages/validators/src/**`, `packages/ui/src/{atoms,theme}`

**Files read this session (analog sources):** 38
**Pattern extraction date:** 2026-08-13
**Project skills consulted:** `.claude/skills/breeyo-build/SKILL.md` (TDD iron law: failing test
first; every task cites its `D-XX` + `SCH-0X`; exact monorepo paths; 2-5 minute tasks)
