# Phase 6: Invoicing & Payments - Pattern Map

**Mapped:** 2026-08-12
**Files analyzed:** 71 (new or modified)
**Analogs found:** 63 / 71 (8 have no in-repo analog — see `## No Analog Found`)

> **How to read this document.** Every excerpt below is verbatim from a file that is *shipped and running today*. Where the codebase contradicts a planning document, the codebase wins and the contradiction is flagged in `## Convention Warnings`. Line numbers are current as of 2026-08-12 on branch `breeyo/phase-04-emr-clinical-records`.

---

## File Classification

### Wave 0 — Infrastructure Remediation (D-30, plan 06-00)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `apps/api/src/lib/prisma-rls.ts` | MODIFY · lib/infra | request-response | itself (lines 10–26) + `apps/api/tests/tenant-isolation.test.ts:141–146` (correct txn form) | exact |
| `apps/api/src/middleware/tenant-context.ts` | MODIFY · middleware | request-response | itself (lines 12–23) | exact |
| `apps/api/prisma/migrations/<ts>_baseline_phase_3_4_5/migration.sql` | CREATE · migration | batch | `apps/api/prisma/migrations/20260802111747_init/migration.sql` | exact |
| `apps/api/prisma/post-migrate.sql` | MODIFY · config/SQL | batch | itself (lines 13–39) | exact |
| `apps/api/prisma/rls/phase-03-patient-queue-rls.sql` | MODIFY or DELETE · config/SQL | batch | `post-migrate.sql:13–39` (correct GUC) | exact — ⚠️ see Warning 1 |
| `apps/mobile/package.json` | MODIFY · config | — | `apps/api/package.json` | role-match |
| `apps/api/package.json` | MODIFY · config | — | itself | exact |
| `apps/api/prisma/seed.ts` | MODIFY · seed | batch | itself (lines 45–68, `DEFAULT_ROLE_PERMISSIONS`) | exact |
| `apps/api/tests/tenant-isolation.test.ts` | MODIFY · test | — | itself (Test 2, lines 126–174) | exact |

### Shared Contracts (`packages/*`)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/types/src/billing.ts` | MODIFY · types | — | itself (26 lines, `ServiceCatalog`) + `packages/types/src/emr.ts` | exact |
| `packages/validators/src/billing.ts` | MODIFY · validators | — | itself (`serviceCatalogSchema`) | exact |
| `packages/types/src/constants/billing.constants.ts` | MODIFY · constants | — | itself + `constants/queue-status.ts` | exact |
| `packages/types/src/constants/gst.ts` | CREATE · constants | — | `packages/types/src/constants/billing.constants.ts` | exact |
| `packages/types/src/constants/invoice-status.ts` | CREATE · constants | — | `packages/types/src/constants/queue-status.ts` | exact |
| `packages/types/src/constants/socket-events.ts` | MODIFY · constants | pub-sub | itself (6 lines) | exact |
| `packages/types/src/constants/index.ts` · `packages/types/src/index.ts` · `packages/validators/src/index.ts` | MODIFY · barrel | — | themselves | exact |

### Database

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `apps/api/prisma/schema.prisma` (8 billing models) | MODIFY · model | CRUD | `ServiceCatalog` (lines 537–557) + `Consultation` (319–357) | exact |
| `apps/api/prisma/schema.prisma` (Clinic billing settings, D-29) | MODIFY · model | CRUD | `Clinic` (lines 37–64) | exact |
| `apps/api/prisma/migrations/<ts>_add_billing_models/migration.sql` | CREATE · migration | batch | `migrations/20260802111747_init/migration.sql` | exact |

### API — Billing Module (`apps/api/src/modules/billing/`)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `billing.routes.ts` | CREATE · route | request-response | `apps/api/src/modules/emr/emr.routes.ts` | exact |
| `webhook.routes.ts` | CREATE · route | event-driven | `emr.routes.ts` (registration shape only) | partial — ⚠️ no unauthenticated-route analog exists |
| `invoice.controller.ts` | CREATE · controller | request-response | `apps/api/src/modules/emr/emr.controller.ts` | exact |
| `invoice.service.ts` | CREATE · service | CRUD + state machine | `apps/api/src/modules/emr/emr.service.ts` | exact |
| `invoice.repository.ts` | CREATE · repository | CRUD | `apps/api/src/modules/emr/emr.repository.ts` | exact |
| `payment.service.ts` | CREATE · service | request-response (external API) | `apps/api/src/modules/notifications/push.service.ts` | role-match |
| `refund.service.ts` | CREATE · service | request-response (external API) | `payment.service.ts` (sibling, same phase) | role-match |
| `credit-note.service.ts` | CREATE · service | CRUD | `emr.service.ts` | role-match |
| `gst.service.ts` | CREATE · service (pure) | transform | `apps/api/src/modules/emr/dosage.service.ts` | exact |
| `numbering.service.ts` | CREATE · service | transform + DB lock | `apps/api/src/modules/queue/queue.repository.ts:186–205` (`$queryRaw`) | role-match |
| `stock-validator.service.ts` | CREATE · service | CRUD (row locks) | `emr.repository.ts:79–160` (`$transaction`) | partial |
| `razorpay.client.ts` | CREATE · client factory | request-response | `apps/api/src/modules/notifications/push.service.ts` | role-match |
| `webhook.service.ts` | CREATE · service | event-driven | `apps/api/src/modules/notifications/notification-bus.ts` | role-match |
| `webhook.worker.ts` | CREATE · worker | event-driven | `apps/api/src/modules/notifications/notification.worker.ts` | exact |
| `quick-sale.service.ts` | CREATE · service | CRUD | `emr.service.ts` | role-match |
| `dashboard.service.ts` | CREATE · service | transform (aggregate) | `queue.repository.ts:143–205` | exact |
| `billing.schema.ts` | CREATE · schema | — | `apps/api/src/modules/queue/queue.schema.ts` | exact |
| `invoice-state.ts` | CREATE · utility (pure) | transform | `packages/types/src/constants/queue-status.ts` (`isValidTransition`) | exact |
| `money.ts` (`toPaise()`, D-31) | CREATE · utility (pure) | transform | `apps/api/src/modules/emr/dosage.service.ts` | role-match |
| `service-catalog.controller.ts` / `.service.ts` (D-02 CRUD) | CREATE · controller/service | CRUD | `apps/api/src/modules/drug/drug.controller.ts` + `drug.service.ts` | exact |

### API — Cross-cutting

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `apps/api/src/lib/billing-audit-log.ts` (D-32) | CREATE · lib | event-driven | `apps/api/src/lib/audit-log.ts` | exact |
| `apps/api/src/lib/crypto.ts` (AES-256-GCM for Razorpay secrets) | CREATE · lib | transform | — | **none** |
| `apps/api/src/jobs/overdue-invoices.ts` (D-23) | CREATE · job/cron | batch | `apps/api/src/jobs/midnight-archive.ts` | exact |
| `apps/api/src/jobs/expire-payment-links.ts` (D-11) | CREATE · job/cron | batch | `apps/api/src/jobs/midnight-archive.ts` | exact |
| `apps/api/src/app.ts` | MODIFY · config | — | itself (lines 72–93) | exact |
| `apps/api/src/modules/emr/emr.service.ts` (draft-invoice hook, D-03) | MODIFY · service | CRUD | itself (`finalize`, lines 118–192) | exact |

### API — Tests

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/modules/billing/__tests__/gst.service.test.ts` | CREATE · unit test | — | `src/modules/billing/__tests__/service-catalog-seed.test.ts` | exact |
| `src/modules/billing/__tests__/invoice-state.test.ts` | CREATE · unit test | — | `src/modules/queue/__tests__/queue.service.test.ts` | exact |
| `src/modules/billing/__tests__/numbering.test.ts` | CREATE · unit test | — | `service-catalog-seed.test.ts` | exact |
| `src/modules/billing/__tests__/payment.service.test.ts` | CREATE · unit test (mocked SDK) | — | `src/modules/emr/emr.service.test.ts` | exact |
| `tests/billing/invoice-create.test.ts` · `finalize-stock.test.ts` · `invoice-lock.test.ts` · `webhook.test.ts` · `dashboard.test.ts` | CREATE · integration test | — | `apps/api/tests/queue/queue-checkin.test.ts` + `tests/helpers/app.ts` | exact |
| `tests/helpers/factories.ts` (invoice/payment factories) | MODIFY · test helper | — | itself (lines 9–52) | exact |
| `tests/helpers/razorpay-mock.ts` | CREATE · test helper | — | `tests/helpers/factories.ts` | role-match |

### Mobile — Navigation & Routes

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `app/(app)/(tabs)/_layout.tsx` (add Billing, D-28) | MODIFY · route | — | itself (lines 5–42) | exact |
| `app/(app)/(tabs)/billing.tsx` | CREATE · route | — | `app/(app)/(tabs)/patients.tsx` | exact |
| `app/(app)/billing/invoice/[invoiceId].tsx` | CREATE · route | — | `app/(app)/patient/[petId].tsx` | exact |
| `app/(app)/billing/new.tsx` · `quick-sale.tsx` · `credit-note/[invoiceId].tsx` · `settings.tsx` | CREATE · route | — | `app/(app)/patient/register.tsx` | exact |

### Mobile — Billing Feature (`apps/mobile/src/features/billing/`)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `screens/BillingDashboardScreen.tsx` | CREATE · screen | request-response | `src/features/patient/screens/PatientListScreen.tsx` | exact |
| `screens/InvoiceBuilderScreen.tsx` | CREATE · screen | request-response | `src/features/patient/screens/RegisterPatientScreen.tsx` | exact |
| `screens/InvoiceDetailScreen.tsx` | CREATE · screen | request-response | `src/features/patient/screens/PatientDetailScreen.tsx` | exact |
| `screens/QuickSaleScreen.tsx` · `CreditNoteScreen.tsx` · `BillingSettingsScreen.tsx` | CREATE · screen | request-response | `PatientDetailScreen.tsx` / `RegisterPatientScreen.tsx` | exact |
| `hooks/useInvoices.ts` · `useInvoice.ts` · `useCreateInvoice.ts` · `useFinalizeInvoice.ts` | CREATE · hook | CRUD | `src/features/patient/hooks/usePatientProfile.ts` | exact |
| `hooks/useBillingDashboard.ts` | CREATE · hook | request-response | `usePatientProfile.ts:80–97` (`useRecentPatients`) | exact |
| `hooks/useInvoiceSocket.ts` (`invoice:updated`) | CREATE · hook | pub-sub | `src/features/queue/hooks/useQueueSocket.ts` | exact |
| `hooks/useServiceCatalogSearch.ts` | CREATE · hook | request-response | `src/features/patient/hooks/usePatientSearch.ts` | exact |
| `stores/invoiceBuilderStore.ts` · `quickSaleCartStore.ts` | CREATE · store | — | `src/features/queue/store/queueUIStore.ts` | exact |
| `components/*` (≈40 per UI-SPEC lines 379–470) | CREATE · component | — | `src/features/patient/components/PetProfileCard.tsx`, `src/features/pdf/components/ShareOptionsSheet.tsx` | exact |
| `components/QRCodeDisplay.tsx` | CREATE · component | — | — | **none** (new dep `react-native-qrcode-svg`) |

### Mobile — PDF & Pet Profile

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/features/pdf/templates/invoice.ts` | CREATE · template | transform | `src/features/pdf/templates/consultation-summary.ts` | exact |
| `src/features/pdf/templates/payment-receipt.ts` | CREATE · template | transform | `src/features/pdf/templates/prescription-pad.ts` (compact) | exact |
| `src/features/pdf/templates/credit-note.ts` | CREATE · template | transform | `src/features/pdf/templates/invoice.ts` (sibling) | exact |
| `src/features/pdf/hooks/useGeneratePdf.ts` | MODIFY · hook | file-I/O | itself (lines 46–128) | exact |
| `src/features/pdf/__tests__/invoice-template.test.ts` | CREATE · unit test | — | `apps/api/src/modules/billing/__tests__/service-catalog-seed.test.ts` | role-match |
| `src/features/patient/screens/PatientDetailScreen.tsx` (Invoices tab, D-25) | MODIFY · screen | request-response | itself (lines 160–188, section composition) | exact |

---

## Pattern Assignments

### 1. `apps/api/src/lib/prisma-rls.ts` (MODIFY · lib/infra, request-response)

**Analog:** itself — the planner must see the *exact current code* it is replacing (D-30 / RESEARCH Pitfall 3).

**Current form, verbatim** (`apps/api/src/lib/prisma-rls.ts:10–40`):
```ts
export function createTenantClient(clinicId: string): PrismaClient {
  const client = new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL_APP,
  });

  return client.$extends({
    query: {
      $allOperations: async ({ args, query, operation }) => {
        // SET LOCAL scopes the setting to the current transaction
        await (client as any).$executeRawUnsafe(
          `SET LOCAL app.clinic_id = '${clinicId}'`,
        );
        return query(args);
      },
    },
  }) as unknown as PrismaClient;
}

let basePrisma: PrismaClient | null = null;

export function getBasePrisma(): PrismaClient {
  if (!basePrisma) {
    basePrisma = new PrismaClient();
  }
  return basePrisma;
}
```

Three defects the remediation must fix, all visible above:
1. `new PrismaClient(...)` per call, never `$disconnect`ed → pool exhaustion under billing + webhook traffic.
2. `$executeRawUnsafe` + `query(args)` are two separate operations outside an explicit transaction → `SET LOCAL` may not apply to the connection that runs the query.
3. `clinicId` string-interpolated into `$executeRawUnsafe`.

**The correct shape already exists in the repo** — the test file does it right (`apps/api/tests/tenant-isolation.test.ts:141–146`):
```ts
const membersA = await appClient.$transaction(async (tx) => {
  await tx.$executeRawUnsafe(`SET LOCAL app.clinic_id = '${clinicA.id}'`);
  return tx.clinicMember.findMany();
});
```
Copy the `$transaction`-wrapping, but replace `$executeRawUnsafe` with parameterized `$executeRaw` + `set_config`:
```ts
await tx.$executeRaw`SELECT set_config('app.clinic_id', ${clinicId}, true)`;
```

**Consumer to update in lockstep** (`apps/api/src/middleware/tenant-context.ts:12–23`):
```ts
export async function tenantContext(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const clinicId = request.user?.activeClinicId;

  if (!clinicId) {
    return reply.status(400).send({ error: AUTH_ERRORS.CLINIC_NOT_SELECTED });
  }

  request.db = createTenantClient(clinicId);
}
```

> ⚠️ **Blast radius the planner must size.** `request.db` is the documented tenant handle, but **every shipped module actually uses `fastify.prisma` (the admin/base client) instead** — see `emr.routes.ts:12`, `queue.routes.ts:9`, and `emr.controller.ts:263` (`request.server.prisma.speciesDosage`). Changing `createTenantClient` alone therefore changes nothing at runtime for Phases 3–4. Wave 0 must decide whether billing routes adopt `request.db` (and thus become the first real RLS consumers) or follow the shipped `fastify.prisma` convention with explicit `clinicId` in every `WHERE`. RESEARCH's "defence in depth" recommendation implies **both**.

---

### 2. `apps/api/prisma/post-migrate.sql` (MODIFY · config/SQL, batch)

**Analog:** itself, lines 13–39. This is the only RLS mechanism actually wired into CI (`.github/workflows/ci.yml:74–76`).

**Enable + FORCE pattern** (`post-migrate.sql:13–20`):
```sql
ALTER TABLE clinic_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_members FORCE ROW LEVEL SECURITY;

ALTER TABLE auth_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_audit_log FORCE ROW LEVEL SECURITY;
```

**Per-operation policy pattern** (`post-migrate.sql:25–39`) — copy this shape for all 8 billing tables plus `billing_audit_log` and `invoice_number_counters`:
```sql
DROP POLICY IF EXISTS clinic_members_select ON clinic_members;
CREATE POLICY clinic_members_select ON clinic_members
  FOR SELECT USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS clinic_members_insert ON clinic_members;
CREATE POLICY clinic_members_insert ON clinic_members
  FOR INSERT WITH CHECK (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS clinic_members_update ON clinic_members;
CREATE POLICY clinic_members_update ON clinic_members
  FOR UPDATE USING (clinic_id = current_setting('app.clinic_id', true)::uuid);

DROP POLICY IF EXISTS clinic_members_delete ON clinic_members;
CREATE POLICY clinic_members_delete ON clinic_members
  FOR DELETE USING (clinic_id = current_setting('app.clinic_id', true)::uuid);
```

Note the exact conventions to copy: GUC name `app.clinic_id`; `::uuid` cast on the *setting*, not `::text` on the column; `DROP POLICY IF EXISTS` before every `CREATE` (idempotent re-runs); separate policies per operation; `FORCE` in addition to `ENABLE`.

**Grants come first** (`post-migrate.sql:7–8`) — new tables are covered automatically only if these run *after* the migration, which CI does:
```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO breeyo_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO breeyo_app;
```

---

### 3. `apps/api/prisma/schema.prisma` — 8 billing models (MODIFY · model, CRUD)

**Analog:** `ServiceCatalog` (lines 537–557) — the newest tenant-scoped model, shipped by Phase 4 plan 04-08, already carrying the paise + HSN/SAC conventions Phase 6 extends.

**Verbatim** (`apps/api/prisma/schema.prisma:535–557`):
```prisma
// ─── Phase 4: Service Catalog (Pre-Phase 6 Billing) ────────────────

model ServiceCatalog {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  clinicId        String   @map("clinic_id") @db.Uuid
  name            String
  category        String   @default("other")
  price           Int      // price in paise
  sacCode         String?  @map("sac_code")
  hsnCode         String?  @map("hsn_code")
  gstRateOverride Decimal? @map("gst_rate_override") @db.Decimal(5, 2)
  isActive        Boolean  @default(true) @map("is_active")
  isPreset        Boolean  @default(false) @map("is_preset")
  sortOrder       Int      @default(0) @map("sort_order")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  clinic Clinic @relation(fields: [clinicId], references: [id])

  @@index([clinicId, isActive])
  @@index([clinicId, category])
  @@map("service_catalog")
}
```

Conventions every new billing model must copy exactly:
- `@id @default(dbgenerated("gen_random_uuid()")) @db.Uuid` — **not** `cuid()`
- every FK column `@db.Uuid`, `@map("snake_case")`
- money as `Int` with a `// paise` comment
- rates as `Decimal? @db.Decimal(5, 2)`
- `createdAt @default(now())` + `updatedAt @updatedAt`
- back-relation to `Clinic` + a matching entry in the `Clinic` model's relation block
- composite `@@index([clinicId, …])` leading with `clinicId`
- `@@map("snake_case_plural")`
- section banner comment (`// ─── Phase 6: … ───`) before the block

**`Clinic` model — where D-29 billing settings attach** (`schema.prisma:37–64`, abridged to the parts being changed):
```prisma
model Clinic {
  id               String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name             String
  address          String
  contactPhone     String    @map("contact_phone")
  city             String?
  gstin            String?
  logoUrl          String?   @map("logo_url")
  ...
  owner              User                @relation(fields: [ownerId], references: [id])
  ...
  serviceCatalog     ServiceCatalog[]

  @@map("clinics")
}
```
`gstin` and `logoUrl` already exist — D-29 adds `gstEnabled`, `stateCode`, `defaultDueDays`, `invoiceFooterText`, `bankDetails`, `razorpayKeyId`, `razorpayKeySecretEnc`, `razorpayWebhookSecretEnc`, `razorpayWebhookToken` alongside them, plus back-relations `invoices Invoice[]`, `payments Payment[]`, etc.

**BIL-01 join source — `Prescription`** (`schema.prisma:446–471`, the dispensed-item flags):
```prisma
model Prescription {
  id                   String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  consultationId       String   @map("consultation_id") @db.Uuid
  drugName             String   @map("drug_name")
  ...
  dispensed            Boolean  @default(false)
  inventoryItemId      String?  @map("inventory_item_id") @db.Uuid
  sortOrder            Int      @default(0) @map("sort_order")
  createdAt            DateTime @default(now()) @map("created_at")

  consultation Consultation @relation(fields: [consultationId], references: [id])

  @@index([consultationId])
  @@map("prescriptions")
}
```
**Confirmed: `Prescription` has no quantity column.** Quantity must come from Phase 5's `StockMovement` — see `## Cross-Phase Join Points` below (RESEARCH assumption A8 is now **resolved: the link exists**).

---

### 4. `apps/api/src/modules/billing/billing.routes.ts` (CREATE · route, request-response)

**Analog:** `apps/api/src/modules/emr/emr.routes.ts` (47 lines, newest module).

**Verbatim** (`emr.routes.ts:1–47`, abridged):
```ts
import type { FastifyInstance } from 'fastify';
import { EmrRepository } from './emr.repository.js';
import { EmrService } from './emr.service.js';
import { createEmrController } from './emr.controller.js';
import { createNotificationBus } from '../notifications/notification-bus.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantContext } from '../../middleware/tenant-context.js';

export default async function emrRoutes(fastify: FastifyInstance) {
  const repository = new EmrRepository(fastify.prisma);
  const lockService = new ConsultationLockService(fastify.prisma);
  const service = new EmrService(repository, lockService, dosageService, fastify.prisma);

  const notificationBus = createNotificationBus(fastify.redis);
  fastify.addHook('onClose', async () => {
    await notificationBus.close();
  });

  const controller = createEmrController(service, lockService, notificationBus);

  const preHandler = [authenticate, tenantContext];

  fastify.post('/consultations', { preHandler, handler: controller.createHandler });
  fastify.get('/consultations/:consultationId', { preHandler, handler: controller.getConsultationHandler });
  fastify.patch('/consultations/:consultationId/draft', { preHandler, handler: controller.saveDraftHandler });
  fastify.post('/consultations/:consultationId/finalize', { preHandler, handler: controller.finalizeHandler });
}
```

Copy: default-export async plugin taking `FastifyInstance`; manual DI wiring at the top (repository → service → controller); `const preHandler = [authenticate, tenantContext]` reused on every route; `.js` extensions on all relative imports (ESM/NodeNext); BullMQ queue created here and closed on `onClose`; no `/api/v1` in the path (prefix comes from `app.ts`).

**Difference Phase 6 must add — permission gating.** No shipped module uses `requirePermission` in its route file yet; the middleware exists and is unused outside auth. Billing is the first consumer:
```ts
const preHandler = [authenticate, tenantContext];
const writeHandler = [authenticate, tenantContext, requirePermission('CREATE_INVOICES')];
const payHandler   = [authenticate, tenantContext, requirePermission('MANAGE_PAYMENTS')];
```
(`requirePermission` source is quoted in `## Shared Patterns → Authorization`.)

**Registration** (`apps/api/src/app.ts:84–93`):
```ts
  // Phase 4: EMR & Clinical Records
  await app.register(import('./modules/emr/emr.routes.js'), { prefix: '/api/v1' });
  await app.register(import('./modules/drug/drug.routes.js'), { prefix: '/api/v1' });
  ...
  // Midnight archive cron (skip in test environment)
  if (!isTest) {
    scheduleMidnightArchive(app.prisma, app.io);
  }
```
Phase 6 appends a `// Phase 6: Invoicing & Payments` block in the same place, plus `scheduleOverdueInvoices(...)` / `scheduleExpirePaymentLinks(...)` inside the same `if (!isTest)` guard.

---

### 5. `apps/api/src/modules/billing/webhook.routes.ts` (CREATE · route, event-driven)

**Analog:** `emr.routes.ts` for the plugin shell only. **There is no unauthenticated, rate-limit-exempt, raw-body route anywhere in the codebase** — this is genuinely new. Use RESEARCH `## Code Examples → Webhook raw body` verbatim as the source pattern.

What *is* copyable from the repo:
- Route-level config override — `app.ts:72–75` shows the only existing per-route `config` usage:
  ```ts
  await app.register(import('./modules/auth/auth.routes.js'), {
    prefix: '/api/v1',
    config: { rateLimit: { max: isTest ? 10000 : 20, timeWindow: '1 minute' } },
  });
  ```
  Phase 6's inverse is `config: { rateLimit: false }` on the webhook route.
- Base (non-tenant) client access — `getBasePrisma()` from `apps/api/src/lib/prisma-rls.ts:35–40`, already used this way in `tenant-isolation.test.ts:181`.
- Structured logging on the request object — `emr.controller.ts:232`:
  ```ts
  request.log.error(err, 'Failed to send D-72 lock takeover notification');
  ```

---

### 6. `apps/api/src/modules/billing/invoice.controller.ts` (CREATE · controller, request-response)

**Analog:** `apps/api/src/modules/emr/emr.controller.ts`.

**Factory + shared validation helper** (`emr.controller.ts:19–32`):
```ts
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
```

**Per-handler shape — parse params, parse body, call service, wrap in `{ data }`** (`emr.controller.ts:37–52` and `97–116`):
```ts
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
```ts
    async saveDraftHandler(request: FastifyRequest, reply: FastifyReply) {
      const params = consultationParamsSchema.safeParse(request.params);
      if (!params.success) {
        return validationError(reply, params.error.errors);
      }

      const body = saveDraftSchema.safeParse(request.body);
      if (!body.success) {
        return validationError(reply, body.error.errors);
      }
      ...
      return reply.status(200).send({ data: { saved: true } });
    },
```

**Not-found shape** (`emr.controller.ts:68–72`):
```ts
      if (!consultation) {
        return reply.status(404).send({
          error: { code: 'CONSULTATION_NOT_FOUND', message: 'Consultation not found' },
        });
      }
```

Copy exactly: `safeParse` (never `.parse`) in controllers; validators imported from `@breeyo/validators`, param/query schemas from the local `*.schema.ts`; every success response is `{ data: … }`; every error is `{ error: { code, message } }`; `request.user.activeClinicId` is the tenant source; `201` on create, `200` elsewhere.

---

### 7. `apps/api/src/modules/billing/invoice.service.ts` (CREATE · service, CRUD + state machine)

**Analog:** `apps/api/src/modules/emr/emr.service.ts` — same domain shape (draft → finalize, immutable after finalize, audit on transition).

**Class + constructor DI** (`emr.service.ts:20–26`):
```ts
export class EmrService {
  constructor(
    private readonly repository: EmrRepository,
    private readonly lockService: ConsultationLockService,
    private readonly dosageService: DosageService,
    private readonly prisma: PrismaClient,
  ) {}
```

**Domain error pattern — this is the project's error idiom, copy it verbatim** (`emr.service.ts:128–140`):
```ts
    const consultation = await this.repository.getConsultation(consultationId, clinicId);
    if (!consultation) {
      const error = new Error('Consultation not found') as Error & { statusCode: number; code: string };
      error.statusCode = 404;
      error.code = 'CONSULTATION_NOT_FOUND';
      throw error;
    }

    if (consultation.status === 'finalized') {
      const error = new Error('Consultation is already finalized') as Error & { statusCode: number; code: string };
      error.statusCode = 409;
      error.code = 'ALREADY_FINALIZED';
      throw error;
    }
```
Billing equivalents: `INVOICE_NOT_FOUND` (404), `INVOICE_ALREADY_FINALIZED` (409, D-21), `INSUFFICIENT_STOCK` (409, BIL-02), `INVALID_STATE_TRANSITION` (409, D-20), `REFUND_EXCEEDS_PAID` (400). These are picked up by `error-handler.ts` (see `## Shared Patterns → Error Handling`).

**Finalize orchestration — the exact template for `InvoiceService.finalize()`** (`emr.service.ts:118–192`, abridged):
```ts
  async finalize(consultationId: string, clinicId: string, vetId: string, input?: FinalizeInput) {
    const parsed = input ? finalizeConsultationSchema.parse(input) : {};

    // 1. load + guard (404 / 409 as above)
    // 2. compute derived values outside the txn
    const durationMinutes = Math.round(
      (Date.now() - new Date(consultation.startedAt).getTime()) / 60000,
    );

    // 3. Finalize in transaction  ← repository owns the txn
    const finalized = await this.repository.finalizeConsultation(
      consultationId, clinicId, draftData ?? {}, durationMinutes,
      parsed.followUpDate, parsed.followUpReason,
    );

    // 4. cross-module side effects AFTER the txn
    if (consultation.queueEntryId) {
      await this.repository.updateQueueEntryStatus(consultation.queueEntryId, 'DONE', new Date());
    }

    // 5. audit
    await writeAuditLog(this.prisma, AuditEvent.CONSULTATION_FINALIZED, {
      userId: vetId,
      clinicId,
      metadata: { consultationId, petId: consultation.petId, visitType: consultation.visitType },
    });

    return finalized;
  }
```

> ⚠️ **One deliberate divergence.** Steps 4 and 5 here run *outside* the transaction. For BIL-02 that is not acceptable — number assignment, GST freeze and stock deduction must be inside the single `$transaction` (RESEARCH Pattern 4). Copy the *orchestration shape* (parse → guard → txn → audit) but move the mutations into the repository transaction.

**Best-effort side effect that must never block the main path** (`emr.service.ts:249–253`) — the model for "emit `invoice:updated` / write audit but never fail the finalize":
```ts
    } catch (err) {
      // Best-effort: never block finalize on the dosage-override audit. Surface
      // the failure via the logger instead of swallowing it outright.
      console.error('[EmrService] dosage override audit failed', err);
    }
```

**Draft-invoice hook (D-03) — where to attach in `emr.service.ts`.** RESEARCH Contradiction 3 requires an unauthenticated, server-initiated path. Insert the call between step 4 and step 5 above (after `updateQueueEntryStatus`, before `writeAuditLog`), wrapped in the same best-effort try/catch so a billing failure never blocks a clinical finalize.

---

### 8. `apps/api/src/modules/billing/invoice.repository.ts` (CREATE · repository, CRUD)

**Analog:** `apps/api/src/modules/emr/emr.repository.ts`.

**Class shape** (`emr.repository.ts:4–5`):
```ts
export class EmrRepository {
  constructor(private readonly prisma: PrismaClient) {}
```

**Multi-step transaction — the template for `finalizeInvoice()`** (`emr.repository.ts:79–160`, abridged):
```ts
  async finalizeConsultation(
    consultationId: string,
    clinicId: string,
    draftData: any,
    durationMinutes: number,
    followUpDate?: string,
    followUpReason?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const consultation = await tx.consultation.update({
        where: { id: consultationId },
        data: { status: 'finalized', finalizedAt: new Date(), durationMinutes, ... },
      });

      if (draftData.vitals) {
        await tx.vitals.upsert({ where: { consultationId }, create: {...}, update: {...} });
      }

      if (draftData.prescriptions?.length > 0) {
        await tx.prescription.deleteMany({ where: { consultationId } });
        await tx.prescription.createMany({ data: draftData.prescriptions.map((rx: any, index: number) => ({ ... })) });
      }

      await tx.consultationDraft.deleteMany({ where: { consultationId } });

      return consultation;
    });
  }
```

**Raw SQL with parameter binding + `bigint` handling** (`queue.repository.ts:186–205`) — the template for `numbering.service.ts` and `dashboard.service.ts`:
```ts
  async getAverageConsultDuration(clinicId: string, days: number): Promise<number | null> {
    const result = await this.prisma.$queryRaw<Array<{ avg_seconds: number | null; count: bigint }>>`
      SELECT
        AVG(EXTRACT(EPOCH FROM ("completed_at" - "called_at"))) as avg_seconds,
        COUNT(*) as count
      FROM queue_entries
      WHERE clinic_id = ${clinicId}::uuid
        AND status = 'DONE'
        ...
    `;

    const row = result[0];
    if (!row || Number(row.count) < 5 || row.avg_seconds == null) {
      return null;
    }

    return Number(row.avg_seconds);
  }
```
Note: tagged-template `$queryRaw` with `${clinicId}::uuid`, explicit row-type generic, `Number(row.count)` to defuse `bigint`. `numbering.service.ts` uses the same form but must accept `tx: Prisma.TransactionClient` rather than `this.prisma`.

---

### 9. `apps/api/src/modules/billing/gst.service.ts` + `invoice-state.ts` + `money.ts` (CREATE · pure services)

**Analog:** `apps/api/src/modules/emr/dosage.service.ts` (96 lines) — the project's only existing pure, I/O-free, exhaustively unit-tested domain service, invoked from a service class and exposed via a controller endpoint. Structure `gst.service.ts` identically: no `PrismaClient` in the constructor, no `await`, deterministic inputs → outputs.

Its call sites show the pattern to mirror:
- constructed with no dependencies — `emr.routes.ts:14`: `const dosageService = new DosageService();`
- injected as a plain collaborator — `emr.service.ts:24`: `private readonly dosageService: DosageService,`
- thin re-export on the service for controller use — `emr.service.ts:387–393`:
  ```ts
  validatePrescriptionDosage(
    enteredDoseMg: number,
    petWeightKg: number,
    speciesDosage: SpeciesDosage,
  ) {
    return this.dosageService.validateDosage(enteredDoseMg, petWeightKg, speciesDosage);
  }
  ```

**State-machine analog:** `packages/types/src/constants/queue-status.ts` exports `isValidTransition`, consumed at `queue.service.ts:2`:
```ts
import { QueueStatus, isValidTransition, SOCKET_EVENTS } from '@breeyo/types';
```
Put `INVOICE_STATUS`, the transition map and `isValidInvoiceTransition` in `packages/types/src/constants/invoice-status.ts` following that file, so the mobile invoice-detail action bar can gate buttons off the same table the server enforces.

**Body of `computeInvoiceTax` and `nextDocumentNumber`:** use RESEARCH `## Code Examples` verbatim (lines 938–1039) — they are already written against these conventions (integer paise, `Prisma.TransactionClient`, IST period).

---

### 10. `apps/api/src/modules/billing/webhook.worker.ts` + `webhook.service.ts` (CREATE · worker/service, event-driven)

**Analog:** `apps/api/src/modules/notifications/notification.worker.ts` + `notification-bus.ts`.

**Producer, verbatim** (`notification-bus.ts`, whole file):
```ts
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

  async close(): Promise<void> {
    await this.queue.close();
  }
}

export function createNotificationBus(redis: Redis): NotificationBus {
  const queue = new Queue('notifications', { connection: redis });
  return new NotificationBus(queue);
}
```

**Consumer, verbatim shell** (`notification.worker.ts:1–20, 62–70`):
```ts
import { Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import type { PrismaClient, Prisma } from '@prisma/client';

export function createNotificationWorker(
  redis: Redis,
  prisma: PrismaClient,
): Worker {
  const worker = new Worker<NotificationEvent>(
    'notifications',
    async (job: Job<NotificationEvent>) => {
      const event = job.data;
      ...
    },
    {
      connection: redis,
      concurrency: 5,
    },
  );

  return worker;
}
```

Copy: `createXWorker(redis, prisma)` factory returning the `Worker`; typed `Worker<T>` / `Job<T>`; `{ connection: redis, concurrency: 5 }`; queue name string duplicated between producer and consumer; `Prisma.InputJsonValue` cast when writing a JSON column (`notification.worker.ts:32`). The billing queue name should be `'billing-webhook'` and the job payload `{ webhookEventId: string }` (never the raw Razorpay body — the durable record is the DB row).

---

### 11. `apps/api/src/jobs/overdue-invoices.ts` + `expire-payment-links.ts` (CREATE · cron, batch)

**Analog:** `apps/api/src/jobs/midnight-archive.ts` — whole file, 32 lines, the only cron in the repo.

**Verbatim** (`apps/api/src/jobs/midnight-archive.ts:1–32`):
```ts
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

Copy exactly: `scheduleXxx(prisma, io)` named export; `cron.schedule(expr, handler, { timezone: 'Asia/Kolkata' })`; whole body in try/catch so a throw never kills the process; a `console.log` count line; a Socket.IO emit after the sweep; JSDoc citing the `D-XX` decision.

Phase 6 deltas: `overdue-invoices.ts` uses `'5 0 * * *'` (just after the archive) and reuses `QueueRepository.getTodayIST()`; `expire-payment-links.ts` uses `'* * * * *'` (D-11, every minute) and **must emit to the clinic room, not globally** — `io.emit(...)` broadcasts to every connected client across all tenants, which is acceptable for a queue-refresh nudge but is a cross-tenant leak for invoice data. Use the room-scoped form from `queue.service.ts:195–199` (see Shared Patterns).

---

### 12. `apps/api/src/lib/billing-audit-log.ts` (CREATE · lib, event-driven) — D-32

**Analog:** `apps/api/src/lib/audit-log.ts` (62 lines) — copy structure exactly, retarget the table.

**Verbatim** (`apps/api/src/lib/audit-log.ts:3–10, 25–33, 35–62`):
```ts
export enum AuditEvent {
  SIGNUP = 'SIGNUP',
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  ...
  // EMR & Clinical Records (Phase 4) — EMR-07 / D-62
  CONSULTATION_FINALIZED = 'CONSULTATION_FINALIZED',
  ADDENDUM_ADDED = 'ADDENDUM_ADDED',
  PRESCRIPTION_DOSAGE_OVERRIDDEN = 'PRESCRIPTION_DOSAGE_OVERRIDDEN',
  ATTACHMENT_UPLOADED = 'ATTACHMENT_UPLOADED',
}

export interface AuditLogData {
  userId?: string;
  clinicId?: string;
  targetUserId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export async function writeAuditLog(
  prisma: PrismaClient,
  event: AuditEvent,
  data: AuditLogData,
): Promise<void> {
  await prisma.authAuditLog.create({
    data: {
      userId: data.userId,
      clinicId: data.clinicId,
      event,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      metadata: { ...(data.metadata || {}), ... },
    },
  });
}
```

Phase 6 mirror: `export enum BillingAuditEvent { INVOICE_FINALIZED, INVOICE_VOIDED, PAYMENT_RECORDED, REFUND_INITIATED, REFUND_PROCESSED, CREDIT_NOTE_ISSUED, RAZORPAY_CREDENTIALS_UPDATED }` + `writeBillingAuditLog(prisma, event, data)` → `prisma.billingAuditLog.create(...)`. Note the phase-banner comment convention inside the enum (`// EMR & Clinical Records (Phase 4) — EMR-07 / D-62`) — carry it forward as `// Invoicing & Payments (Phase 6) — D-32`.

`AuthAuditLog`'s Prisma model (`schema.prisma:163–177`) is the model analog for the new `BillingAuditLog` table — note it has **no** `updatedAt` and indexes `userId`, `clinicId`, `event` separately.

---

### 13. `packages/types/src/billing.ts` and `packages/validators/src/billing.ts` (MODIFY · types/validators)

**Analog:** themselves. These are the shipped Phase-4 stubs Phase 6 extends — do not create new files, do not use `packages/shared/` (RESEARCH Contradiction 5: it is an empty orphan with no `package.json`).

**Types, whole file** (`packages/types/src/billing.ts:1–26`):
```ts
export type ServiceCategory =
  | 'consultation'
  | 'vaccination'
  | ...
  | 'other';

export interface ServiceCatalog {
  id: string;
  clinicId: string;
  name: string;
  category: ServiceCategory;
  price: number; // paise
  sacCode: string | null;
  hsnCode: string | null;
  gstRateOverride: number | null; // percentage
  isActive: boolean;
  isPreset: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}
```
Conventions: string-literal union types (not TS `enum`); `interface` per entity with `id`/`clinicId` first; nullable DB columns as `| null` (not `?`); `Date` for timestamps; money as `number` with a `// paise` trailing comment; `Decimal` columns surface as `number`.

**Validators, whole file** (`packages/validators/src/billing.ts:1–25`):
```ts
import { z } from 'zod';

export const serviceCatalogSchema = z.object({
  name: z.string().min(1).max(100),
  category: z.enum(['consultation', 'vaccination', ... , 'other']).default('other'),
  price: z.number().int().nonnegative(),
  sacCode: z.string().max(10).optional(),
  hsnCode: z.string().max(10).optional(),
  gstRateOverride: z.number().min(0).max(100).optional(),
  isActive: z.boolean().default(true),
});

export type ServiceCatalogInput = z.infer<typeof serviceCatalogSchema>;
```
Conventions: one `z.object` per input; `z.number().int()` for paise; optional (not nullable) for absent fields; `.default(...)` where the DB has one; a co-located `export type XInput = z.infer<typeof xSchema>` for every schema.

**Constants** (`packages/types/src/constants/billing.constants.ts:1–12`) — extend, and add `GST_RATE_SLABS` here or in a new `constants/gst.ts`:
```ts
import type { ServiceCategory } from '../billing.js';

export const SERVICE_CATEGORIES: readonly ServiceCategory[] = [
  'consultation',
  ...
] as const;
```
Conventions: `import type … from '../billing.js'` (explicit `.js`), `readonly T[]` + `as const`, register in `constants/index.ts`.

> Per RESEARCH Finding G2, `GST_RATE_SLABS` is `[0, 5, 18, 40]` — **not** the `[0, 5, 12, 18, 28]` written into `05-08-PLAN.md`.

**Socket event** (`packages/types/src/constants/socket-events.ts`, whole file):
```ts
export const SOCKET_EVENTS = {
  PATIENT_CHECKED_IN: 'patient:checked-in',
  QUEUE_UPDATED: 'queue:updated',
  QUEUE_ARCHIVED: 'queue:archived',
  PATIENT_REGISTERED: 'patient:registered',
  PATIENT_UPDATED: 'patient:updated',
} as const;
```
Add `INVOICE_UPDATED: 'invoice:updated'`, `PAYMENT_RECEIVED: 'payment:received'` to the same object.

---

### 14. `apps/mobile/src/features/pdf/templates/invoice.ts` (CREATE · template, transform)

**Analog:** `apps/mobile/src/features/pdf/templates/consultation-summary.ts` (175 lines) — the shipped Phase 4 clinic-header pattern D-14/D-16 refer to.

**Signature + date formatting** (`consultation-summary.ts:1–28`):
```ts
import type { Consultation, PrescriptionItem, Pet, Owner, Clinic } from '@breeyo/types';

/**
 * Builds an owner-friendly consultation summary PDF in HTML format.
 * ...
 */
export function buildOwnerSummaryHtml(
  clinic: Clinic,
  consultation: Consultation,
  prescriptions: PrescriptionItem[],
  pet: Pet,
  owner: Owner,
  options?: { logoBase64?: string; vetName?: string; vetLicense?: string },
): string {
  const date = new Date(consultation.startedAt).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
```

**Row builder for tabular data** (`consultation-summary.ts:30–43`) — copy for invoice line items:
```ts
  const prescriptionRows = prescriptions
    .map(
      (rx, index) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${index + 1}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">
          <strong>${rx.drugName}</strong> ${rx.strength ? `(${rx.strength})` : ''}
        </td>
        ...
      </tr>
    `,
    )
    .join('');
```

**Clinic header + inline design tokens** (`consultation-summary.ts:52–81`) — this is the D-14 header, reuse it identically and append GSTIN:
```html
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; color: #333; line-height: 1.5; padding: 20px; }
    .header { text-align: center; border-bottom: 2px solid #2E7D32; padding-bottom: 16px; margin-bottom: 20px; }
    .header img { max-width: 60px; max-height: 60px; margin-bottom: 8px; }
    .clinic-name { font-size: 20px; font-weight: 700; color: #2E7D32; }
    .clinic-info { font-size: 12px; color: #666; margin-top: 4px; }
    .section-title { font-size: 14px; font-weight: 600; color: #2E7D32; border-bottom: 1px solid #E8F5E9; padding-bottom: 4px; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th { background-color: #E8F5E9; padding: 8px; text-align: left; font-size: 12px; font-weight: 600; color: #2E7D32; }
    td { font-size: 12px; }
    .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #eee; text-align: center; font-size: 11px; color: #999; }
  </style>
</head>
<body>
  <div class="header">
    ${options?.logoBase64 ? `<img src="${options.logoBase64}" alt="Clinic Logo" />` : ''}
    <div class="clinic-name">${escapeHtml(clinic.name)}</div>
    <div class="clinic-info">${escapeHtml(clinic.address)}</div>
    <div class="clinic-info">Phone: ${escapeHtml(clinic.contactPhone)}</div>
  </div>
```

**Mandatory escaping helper — copy verbatim into each new template** (`consultation-summary.ts:168–175`):
```ts
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
```

Conventions: one exported `buildXHtml(...)` per template file, all data passed as arguments (no fetching inside); `options?.logoBase64` for iOS-safe logos (D-14 requires this — a remote `clinic.logoUrl` will not render); every interpolated string wrapped in `escapeHtml`; conditional sections via `${cond ? \`…\` : ''}`; inline `<style>` (no external CSS); `en-IN` locale for dates.

Phase-6 additions on top: the D-17/G4 document heading (`INVOICE` / `BILL OF SUPPLY` / `TAX INVOICE` / `INVOICE-CUM-BILL OF SUPPLY`), HSN/SAC column, per-tax-head rows, and a paise→₹ formatter (there is no existing money formatter in the repo — see `## No Analog Found`).

---

### 15. `apps/mobile/src/features/pdf/hooks/useGeneratePdf.ts` (MODIFY · hook, file-I/O)

**Analog:** itself. Add `generateInvoice`, `generateReceipt`, `generateCreditNote` alongside the existing four.

**The shared PDF pipeline — reuse, do not duplicate** (`useGeneratePdf.ts:41–65`):
```ts
/**
 * Generates a PDF from HTML content and opens the native share sheet.
 * Uses expo-print for HTML-to-PDF conversion and expo-sharing for distribution.
 * Logo images should use base64 data URIs for iOS compatibility.
 */
async function generatePdf(html: string, filename: string): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html });

  const pdfFilename = `${filename.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
  const destinationUri = `${FileSystem.cacheDirectory}${pdfFilename}`;

  await FileSystem.moveAsync({ from: uri, to: destinationUri });

  await Sharing.shareAsync(destinationUri, {
    mimeType: 'application/pdf',
    dialogTitle: `Share ${filename}`,
    UTI: 'com.adobe.pdf',
  });
}
```

**Per-document generator** (`useGeneratePdf.ts:97–128`) — copy this exact shape for each of the three new documents:
```ts
  const generateOwnerSummary = useCallback(
    async (consultationId: string): Promise<void> => {
      setIsGenerating(true);
      setError(null);
      try {
        const detail = await fetchConsultationDetail(consultationId);
        const html = buildOwnerSummaryHtml(detail.clinic, detail.consultation, ...);
        await generatePdf(
          html,
          `${detail.pet.name}_Summary_${formatDateForFilename(detail.consultation.startedAt)}`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to generate summary';
        setError(message);
        throw err;
      } finally {
        setIsGenerating(false);
      }
    },
    [fetchConsultationDetail],
  );
```

**Token access inside a hook** (`useGeneratePdf.ts:79–95`):
```ts
export function useGeneratePdf(): UseGeneratePdfReturn {
  const { accessToken } = useAuth();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef(accessToken);
  tokenRef.current = accessToken;

  const fetchConsultationDetail = useCallback(
    async (consultationId: string) => {
      const response = await apiClient<ConsultationDetailResponse>(
        `/api/v1/consultations/${consultationId}/detail`,
        { token: tokenRef.current || undefined },
      );
      return response.data;
    },
    [],
  );
```

> **D-16 gap:** `generatePdf` only *shares*. Print (`Print.printAsync`) and Download are not implemented anywhere. Phase 6 adds `printPdf(html)` and `savePdf(...)` next to `generatePdf` in this file — no analog exists for either.

---

### 16. `apps/mobile/src/features/billing/hooks/*` (CREATE · hooks, CRUD)

**Analog:** `apps/mobile/src/features/patient/hooks/usePatientProfile.ts`.

**Query hook** (`usePatientProfile.ts:44–58`):
```ts
export function usePetProfile(petId: string) {
  const { accessToken } = useAuth();

  return useQuery({
    queryKey: ['pets', petId],
    queryFn: () =>
      apiClient<PetProfileResponse>(`/api/v1/pets/${petId}`, {
        token: accessToken!,
      }),
    enabled: !!accessToken && !!petId,
    staleTime: 60_000,
    select: (response) => response.data,
  });
}
```

**Clinic-scoped list query** (`usePatientProfile.ts:80–97`) — the model for `useInvoices` / `useBillingDashboard`:
```ts
export function useRecentPatients(limit: number = 20) {
  const { accessToken, activeClinicId } = useAuth();

  return useQuery({
    queryKey: ['patients', 'recent', activeClinicId, limit],
    queryFn: () =>
      apiClient<RecentPatientsResponse>(`/api/v1/patients/recent?limit=${limit}`, {
        token: accessToken! }),
    enabled: !!accessToken && !!activeClinicId,
    staleTime: 30_000,
    select: (response) => response.data,
  });
}
```

**Mutation + invalidation** (`usePatientProfile.ts:100–127`):
```ts
export function useUpdatePet() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ petId, updates }: { petId: string; updates: Partial<...> }) =>
      apiClient<UpdatePetResponse>(`/api/v1/pets/${petId}`, {
        method: 'PATCH',
        token: accessToken!,
        body: JSON.stringify(updates),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pets', variables.petId] });
      queryClient.invalidateQueries({ queryKey: ['patients', 'recent'] });
      queryClient.invalidateQueries({ queryKey: ['patients', 'search'] });
    },
  });
}
```

Copy: response interfaces declared at the top of the hook file (server returns `{ data: … }`, unwrapped via `select`); `queryKey` array `[resource, scope, id]` with `activeClinicId` included for clinic-scoped lists; `enabled: !!accessToken && !!id`; `staleTime` 30–60s; `accessToken!` non-null assertion guarded by `enabled`; mutations invalidate every affected key explicitly. Billing keys: `['invoices', activeClinicId, filters]`, `['invoices', invoiceId]`, `['billing', 'dashboard', activeClinicId]`.

---

### 17. `apps/mobile/src/features/billing/hooks/useInvoiceSocket.ts` (CREATE · hook, pub-sub)

**Analog:** `apps/mobile/src/features/queue/hooks/useQueueSocket.ts` — whole file, 69 lines.

**Verbatim** (`useQueueSocket.ts:9–66`, abridged):
```ts
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

export function useQueueSocket() {
  const { accessToken, activeClinicId } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!accessToken || !activeClinicId) return;

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
      if (soundEnabled) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
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
Note the import path quirk to copy: `import { SOCKET_EVENTS } from '@breeyo/types/constants/socket-events';` (deep import, line 4) — differs from the API side, which uses the barrel.

Phase 6 delta: listen for `SOCKET_EVENTS.INVOICE_UPDATED` and invalidate both `['invoices', invoiceId]` and `['billing', 'dashboard', activeClinicId]`. This is how the open PaymentScreen learns the Razorpay webhook landed (D-09/BIL-06) — no polling.

---

### 18. `apps/mobile/src/features/billing/screens/InvoiceDetailScreen.tsx` (CREATE · screen)

**Analog:** `apps/mobile/src/features/patient/screens/PatientDetailScreen.tsx` (251 lines).

**Screen shell — params, query, loading, error, `Stack.Screen` header action** (`PatientDetailScreen.tsx:27–104`, abridged):
```tsx
export function PatientDetailScreen() {
  const { petId } = useLocalSearchParams<{ petId: string }>();
  const router = useRouter();
  const { data, isLoading, isError, refetch, isFetching } = usePetProfile(petId ?? '');

  if (isLoading) {
    return (
      <View style={styles.centered} testID="patient-detail-loading">
        <ActivityIndicator size="large" color="#2E7D32" />
        <Text variant="bodyLarge" style={styles.loadingText}>Loading patient...</Text>
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View style={styles.centered}>
        <EmptyState
          title="Patient not found"
          description="This patient could not be loaded. Please try again."
          actionLabel="Go Back"
          onAction={() => router.back()}
          testID="patient-detail-error"
        />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: pet.name,
          headerRight: () => <Button variant="text" label="Edit" onPress={...} testID="edit-pet-button" />,
        }}
      />
```

**Scrollable body with pull-to-refresh + sectioned composition** (`PatientDetailScreen.tsx:106–188`):
```tsx
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor="#2E7D32" />
        }
        testID="patient-detail-screen"
      >
        <View style={styles.section}>
          <PetProfileCard pet={pet} owner={owner} onOwnerPress={handleOwnerPress} testID="pet-profile-card" />
        </View>

        <View style={styles.quickStats}> … </View>

        <View style={styles.section}>
          <Text variant="titleLarge" style={styles.sectionTitle}>Visit History</Text>
          <MedicalTimeline consultations={...} onViewConsultation={(id) => navigateToConsultationDetail(router, { consultationId: id })} />
        </View>
      </ScrollView>
```

**Hard-coded token values to reuse** (`PatientDetailScreen.tsx:196–250`): background `#FFFBF5`, primary `#2E7D32`, body text `#49454F`, heading `#1C1B1F`, divider `#CAC4D0`, surface-variant `#F5F0EB`, `borderRadius: 12`, `padding: 16`, `StyleSheet.create` at the bottom of the file.

Imports to mirror exactly (`PatientDetailScreen.tsx:1–14`):
```tsx
import { View, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Button, EmptyState } from '@breeyo/ui';
```
> ⚠️ Both `react-native-paper` and `@breeyo/ui` are imported here but **absent from `apps/mobile/package.json`** — see Warning 2. The D-25 "Invoices tab" modification to this same file is blocked on Wave 0 fixing that.

**The "quick stats" block at lines 140–158 is the closest thing in the repo to D-24's summary cards** — there is no reusable `SummaryCard` in `@breeyo/ui` (`packages/ui/src/{atoms,molecules,organisms}` contain no such component). `BillingSummaryHeader` is a new build; use the `quickStats` / `statItem` / `statDivider` styles as its visual starting point.

---

### 19. `apps/mobile/app/(app)/(tabs)/_layout.tsx` (MODIFY · route) — D-28

**Analog:** itself, whole file.

**Verbatim** (`apps/mobile/app/(app)/(tabs)/_layout.tsx:5–42`):
```tsx
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#2E7D32',
        tabBarInactiveTintColor: '#79747E',
        tabBarStyle: { backgroundColor: '#FFFBF5', borderTopColor: '#CAC4D0' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Queue',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="clipboard-list-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="patients"
        options={{
          title: 'Patients',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="paw" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
```

> **D-28 is partly a no-op:** there is no `More` tab to replace — only `index` (Queue) and `patients` exist today, and there is no Inventory tab either (Phase 5 unimplemented). Phase 6 appends a `<Tabs.Screen name="billing" … />` block with `MaterialCommunityIcons name="receipt"`. The decision's "move More items to a drawer" clause has nothing to move.

---

### 20. Tests

**Unit test analog:** `apps/api/src/modules/billing/__tests__/service-catalog-seed.test.ts` — already in the billing module, uses `vi` mocks, no DB.
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SERVICE_CATALOG_SEED_DATA, seedServiceCatalog } from '../service-catalog-seed.js';

describe('Service Catalog Seed Data', () => {
  it('should have all prices in paise (positive integers)', () => {
    for (const entry of SERVICE_CATALOG_SEED_DATA) {
      expect(Number.isInteger(entry.defaultPricePaise)).toBe(true);
      expect(entry.defaultPricePaise).toBeGreaterThan(0);
    }
  });
```
Note `../service-catalog-seed.js` — `.js` extension on relative imports inside tests too.

**Integration test analog:** `apps/api/tests/tenant-isolation.test.ts:1–26` + `36–69`:
```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildTestApp, closeTestApp } from './helpers/app.js';
import { cleanupTestData, createTestUser, createTestClinic, createTestClinicMember, createTestTokens, prisma } from './helpers/factories.js';

let app: FastifyInstance;

beforeAll(async () => { app = await buildTestApp(); });
afterAll(async () => { await cleanupTestData(); await closeTestApp(); });

beforeEach(async () => {
  await cleanupTestData();
  const keys = await app.redis.keys('perms:*');
  if (keys.length > 0) { await app.redis.del(...keys); }
  ...
  const tokensA = await createTestTokens(app, userA.id, clinicA.id);
});
```
And the request idiom (`tenant-isolation.test.ts:76–82`) — **`app.inject`, not supertest**, despite CLAUDE.md saying supertest:
```ts
    const responseA = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/permissions',
      headers: { authorization: `Bearer ${tokenA}` },
    });

    expect(responseA.statusCode).toBe(200);
    const bodyA = responseA.json();
```

**Factory analog** (`apps/api/tests/helpers/factories.ts:9–52`):
```ts
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
Copy: `createTestX(requiredFks, overrides = {})` returning the Prisma row; `overrides.field || default`; `randomUUID().slice(0, 6)` for uniqueness. Add `createTestInvoice`, `createTestInvoiceLineItem`, `createTestPayment`, `createTestServiceCatalogEntry` in the same file.

**App builder** (`apps/api/tests/helpers/app.ts`) — singleton, reuse as-is:
```ts
export async function buildTestApp(): Promise<FastifyInstance> {
  if (app) { return app; }
  app = await buildApp({ logger: false });
  await app.ready();
  return app;
}
```

---

## Shared Patterns

### Authentication + Tenant Context
**Source:** `apps/api/src/middleware/authenticate.ts`, `apps/api/src/middleware/tenant-context.ts`
**Apply to:** every billing route **except** `webhook.routes.ts`
```ts
const preHandler = [authenticate, tenantContext];
fastify.post('/billing/invoices', { preHandler, handler: controller.createHandler });
```
Tenant id is always read as `request.user.activeClinicId` inside controllers, and passed as the **first argument** to service methods.

### Authorization
**Source:** `apps/api/src/middleware/authorize.ts:13–39`
**Apply to:** all billing write endpoints (D-05, Contradiction 3)
```ts
export function requirePermission(...permissions: string[]) {
  return async function authorizeHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { id: userId, activeClinicId } = request.user;
    const permissionService = request.server.permissionService;

    const userPerms = await permissionService.getUserPermissions(userId, activeClinicId);
    const hasAll = permissions.every((p) => userPerms.includes(p));

    if (!hasAll) {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'Insufficient permissions' },
      });
    }

    request.permissions = userPerms;
  };
}
```
**D-05 conflict is real and located.** `apps/api/prisma/seed.ts:48–55`:
```ts
  Clinician: [
    'VIEW_PATIENTS', 'EDIT_PATIENTS',
    'VIEW_QUEUE', 'MANAGE_QUEUE',
    'VIEW_EMR', 'EDIT_EMR',
    'VIEW_INVENTORY',
    'VIEW_INVOICES', 'CREATE_INVOICES',
    'SEND_WHATSAPP',
    'VIEW_SCHEDULE', 'MANAGE_SCHEDULE',
  ],
  FrontDesk: [
    'VIEW_PATIENTS', 'EDIT_PATIENTS',
    'VIEW_QUEUE', 'MANAGE_QUEUE',
    'VIEW_INVOICES', 'CREATE_INVOICES', 'MANAGE_PAYMENTS',
    ...
  ],
```
Per D-05, remove `'CREATE_INVOICES'` from `Clinician` here. `MANAGE_PAYMENTS` is already FrontDesk+Admin only. Note the permission codes exist in the `PERMISSIONS` array already — no new permission rows are needed, only the role mapping changes. The server-initiated `createDraftFromConsultation()` path must **not** be gated on `CREATE_INVOICES`.

### Error Handling
**Source:** `apps/api/src/middleware/error-handler.ts:4–56` (registered once at `app.ts:25`)
**Apply to:** every billing service — throw the augmented `Error`, never build the response yourself
```ts
export function errorHandler(error: FastifyError & { statusCode?: number }, request, reply): void {
  if (error instanceof ZodError) {
    reply.status(400).send({
      error: { code: 'VALIDATION_ERROR', message: error.errors.map((e) => e.message).join(', '), details: { issues: error.errors } },
    });
    return;
  }

  const statusCode = error.statusCode || 500;
  request.log.error(error);

  if (statusCode >= 500) {
    reply.status(500).send({ error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred' } });
    return;
  }

  reply.status(statusCode).send({ error: { code: error.code || 'ERROR', message: error.message } });
}
```
Consequence for billing: **any Razorpay SDK error that escapes a service becomes a generic 500 with the message swallowed.** Wrap all `razorpay.*` calls and rethrow as `statusCode`-tagged domain errors (`PAYMENT_GATEWAY_ERROR`, 502) so the UI can show D-11's failure reason. Also: `statusCode >= 500` hides the message, so never rely on a 500 to convey stock or tax detail.

### Socket.IO Broadcast (clinic-scoped)
**Source:** `apps/api/src/modules/queue/queue.service.ts:192–199` + `apps/api/src/realtime/socket.ts:51–60`
**Apply to:** `invoice:updated` emission from the webhook worker and the payment-link expiry cron
```ts
  private broadcast(clinicId: string, event: string, data: unknown) {
    if (this.io) {
      this.io.to(`clinic:${clinicId}`).emit(event, data);
    }
  }
```
Room membership is established at handshake (`socket.ts:51–56`):
```ts
      socket.data.userId = decoded.sub;
      socket.data.clinicId = decoded.clinicId;
      socket.join(`clinic:${decoded.clinicId}`);
```
Service takes `private readonly io: Server | null = null` and null-guards (`queue.service.ts:15–19`) so unit tests can construct it without a server.

### BullMQ Job Options
**Source:** `apps/api/src/modules/notifications/notification-bus.ts:5–10`
**Apply to:** the `billing-webhook` queue
```ts
const JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 1000 },
  removeOnComplete: 100,
  removeOnFail: 500,
};
```

### IST Date Boundary
**Source:** `apps/api/src/modules/queue/queue.repository.ts:14–25`
**Apply to:** dashboard aggregates (D-24, RPT-01), invoice-number period (`YYYYMM`), overdue sweep
```ts
  /**
   * Gets start of today in IST (Asia/Kolkata, UTC+5:30).
   */
  static getTodayIST(date?: Date): Date {
    const now = date ?? new Date();
    const istString = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const [year, month, day] = istString.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day, -5, -30, 0, 0));
  }
```
Static method, importable without instantiating the repository — already used that way at `midnight-archive.ts:16`. **Do not reimplement**; RESEARCH `## Don't Hand-Roll` names this explicitly.

### Client-side API access
**Source:** `apps/mobile/src/lib/api.ts` (whole file)
**Apply to:** every billing hook
```ts
export async function apiClient<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { token, headers, ...rest } = options;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    ...rest,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new ApiClientError(data.error?.message || 'Request failed', data.error?.code || 'UNKNOWN_ERROR', response.status, data.error?.details);
  }
  return data as T;
}
```
`ApiClientError` carries `.code` and `.status` — billing UI branches on `err.code === 'INSUFFICIENT_STOCK'` (BIL-02 banner) and `err.status === 409`.

### Zustand UI store
**Source:** `apps/mobile/src/features/queue/store/queueUIStore.ts` (whole file)
**Apply to:** `invoiceBuilderStore`, `quickSaleCartStore`
```ts
import { create } from 'zustand';

interface QueueUIState {
  isOffline: boolean;
  soundEnabled: boolean;
  setOffline: (offline: boolean) => void;
}

export const useQueueUIStore = create<QueueUIState>((set) => ({
  isOffline: false,
  soundEnabled: true,
  setOffline: (isOffline) => set({ isOffline }),
}));
```
No middleware, no persistence, no devtools. Server state lives in React Query; Zustand holds only ephemeral UI state. The invoice-builder line-item draft is a legitimate exception (it is client-owned until finalize) — but the **totals it displays are preview-only** and the server recomputes on finalize.

---

## Cross-Phase Join Points

### BIL-01 dispensed-item sourcing (resolves RESEARCH assumption A8)

`Prescription` (`schema.prisma:446–471`) carries `dispensed: Boolean` and `inventoryItemId: String?` but **no quantity**. Phase 5's `StockMovement` supplies it. From `05-01-PLAN.md:679–706`:
```prisma
model StockMovement {
  clinicId       String   @map("clinic_id")
  itemId         String   @map("item_id")
  batchId        String?  @map("batch_id")
  type           String   // 'received'|'dispensed'|'adjusted'|'disposed'|'stock_take'|'returned'
  quantity       Int      // positive=add, negative=deduct
  consultationId String?  @map("consultation_id")
  invoiceId      String?  @map("invoice_id")
  ownerId        String?  @map("owner_id")     // D-60: counter-sale owner attribution
  unitPrice      Decimal? @map("unit_price") @db.Decimal(10, 2)  // D-60: sellingPrice snapshot at dispense time

  @@index([clinicId, type, invoiceId])  // D-60: Phase 6 queries uninvoiced counter sales via type='dispensed' AND consultationId IS NULL AND invoiceId IS NULL
}
```
**The link Phase 6 needs exists.** Two documented query shapes:
- **BIL-01 (from consultation):** `StockMovement WHERE clinicId = ? AND consultationId = ? AND type = 'dispensed' AND invoiceId IS NULL` → one line item per row, `quantity = ABS(quantity)`, `unitPrice` already snapshotted at dispense time (do not re-read `InventoryItem.sellingPrice` — the snapshot is the correct historical price).
- **D-04 Quick Sale / D-52 counter sale:** same query with `consultationId IS NULL AND ownerId = ?`.
- On finalize, stamp `StockMovement.invoiceId` so the movement is not double-invoiced.

**Money boundary (D-31):** `StockMovement.unitPrice` and `InventoryItem.sellingPrice` are `Decimal(10,2)` **rupees**; `ServiceCatalog.price` is `Int` **paise**. `toPaise()` must be applied at exactly one place — the line-item builder — with the unit test guarding the 100× error. Phase 5's plan is not being changed.

### Phase 5 plan conventions that must NOT be copied

`05-01-PLAN.md` writes inventory models with `@id @default(cuid())`, no `@db.Uuid`, `current_setting('app.current_clinic_id', …)`, and a model named `Owner` (the shipped model is `PetOwner`). Phase 6's billing models follow **`schema.prisma`**, not the Phase 5 plan: `gen_random_uuid()` + `@db.Uuid` + `app.clinic_id` + `PetOwner`. If Phase 5 lands first with cuid ids, billing FKs pointing at `stock_movements.id` must match whatever actually shipped — verify at plan time, don't assume.

---

## Convention Warnings

Discovered during pattern extraction. Each is a concrete, located divergence the planner should resolve rather than propagate.

**Warning 1 — Two different RLS GUC names exist in the repo.**
`post-migrate.sql` (the only file CI runs, `.github/workflows/ci.yml:76`) uses `current_setting('app.clinic_id', true)::uuid`.
`apps/api/prisma/rls/phase-03-patient-queue-rls.sql:22,27,32` uses `current_setting('app.current_clinic_id', true)` compared against `clinic_id::text`.
That Phase 3 file is **referenced by nothing** — not CI, not `package.json` scripts, not `post-migrate.sql`. Even if it were run, its policies could never match, because `prisma-rls.ts` sets `app.clinic_id`. Phase 5's plan repeats `app.current_clinic_id`. Wave 0 should fold these policies into `post-migrate.sql` with the correct GUC, add `FORCE ROW LEVEL SECURITY` and per-operation `WITH CHECK` clauses, and delete the orphan.

**Warning 2 — Mobile imports three undeclared packages.**
`apps/mobile/package.json` declares neither `react-native-paper`, `@breeyo/ui`, `expo-print`, `expo-sharing`, nor `expo-file-system`, yet `PatientDetailScreen.tsx:3,5` imports the first two and `useGeneratePdf.ts:2–4` imports the last three. RESEARCH Pitfall 9/10 flagged part of this; `@breeyo/ui` is an additional, unflagged omission. Wave 0 must add all five (native modules via `npx expo install`) plus the new `react-native-qrcode-svg` + `react-native-svg`.

**Warning 3 — CI cannot create Phase 3/4 tables.**
CI runs `prisma migrate deploy` (`ci.yml:72`), and `apps/api/prisma/migrations/` contains only two migrations creating 13 tables. `pets`, `consultations`, `prescriptions`, `service_catalog` and 7 more have no migration. Any billing integration test that touches a pet or consultation will fail in CI until Wave 0 baselines the schema.

**Warning 4 — No module uses the tenant client.**
`request.db` (set by `tenantContext`) is used by zero modules. `emr.routes.ts:12`, `queue.routes.ts:9`, `patient.routes.ts` all pass `fastify.prisma` (the `breeyo_admin`, RLS-bypassing client) into their repositories, and `emr.controller.ts:263` reaches for `request.server.prisma` directly. Billing must decide deliberately and document the choice; RLS as written today protects nothing at the application layer.

**Warning 5 — `app.inject`, not supertest.**
CLAUDE.md and RESEARCH both say API tests use `supertest`. Every actual test uses `app.inject({ method, url, headers })` + `response.json()`. `supertest` is in devDependencies but unused. Follow the code.

**Warning 6 — GST rate slabs.**
`05-08-PLAN.md:28` validates `gstRate` against `0, 5, 12, 18, or 28`. Per RESEARCH Finding G2 the current slabs are `0 / 5 / 18 / 40`. The shipped `service-catalog-seed.ts` already uses only `0` and `18`, so no seed data change is needed — but the shared `GST_RATE_SLABS` constant must not encode the stale list.

**Warning 7 — `SERVICE_CATALOG_SEED_DATA` uses SAC 9993xx, not 998351.**
`apps/api/src/modules/billing/service-catalog-seed.ts:20–39` seeds `sacCode: '999311' | '999312' | '999313' | '999399' | '998612'` with `gstRateOverride: 0` for clinical services and `18` for grooming. RESEARCH Finding G1 recommends `998351` for veterinary services. The *rates* are already correct (exempt clinical, taxable grooming); only the SAC strings differ. Changing them is a one-line seed edit but affects existing seeded clinics — decide explicitly whether to migrate or leave.

---

## No Analog Found

Files with no close match in the codebase. The planner should use RESEARCH.md's `## Code Examples` and `## Razorpay Integration` sections instead.

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `apps/api/src/modules/billing/webhook.routes.ts` | route | event-driven | No unauthenticated, rate-limit-exempt, raw-body route exists. `addContentTypeParser` is used nowhere in the repo. Use RESEARCH `## Code Examples → Webhook raw body` |
| `apps/api/src/modules/billing/razorpay.client.ts` | client factory | request-response | No third-party payment/HTTP-SDK client wrapper exists. Closest is `push.service.ts` (Expo SDK), which has no per-tenant credential dimension |
| `apps/api/src/lib/crypto.ts` (AES-256-GCM) | lib | transform | No encryption-at-rest anywhere. `argon2` is used for password hashing only — different primitive, different purpose |
| `apps/api/src/modules/billing/numbering.service.ts` (gap-free counter) | service | transform + lock | No `ON CONFLICT DO UPDATE … RETURNING`, no advisory lock, no `FOR UPDATE` anywhere in the repo. `queue.repository.ts:186–205` supplies only the `$queryRaw` idiom |
| `apps/api/src/modules/billing/stock-validator.service.ts` (`SELECT … FOR UPDATE`) | service | CRUD | No row-level locking in any shipped code. `emr.repository.ts:87` supplies the `$transaction` wrapper only |
| `apps/mobile/src/features/billing/components/QRCodeDisplay.tsx` | component | — | New dependency `react-native-qrcode-svg`; no SVG rendering exists in the mobile app |
| Money formatter (paise → `₹1,234.50`) | utility | transform | No currency formatting anywhere. `toLocaleDateString('en-IN', …)` (`consultation-summary.ts:16`) is the only `en-IN` locale usage; extend that convention with `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })` |
| `BillingSummaryHeader` (D-24 summary cards) | component | — | No `SummaryCard` in `@breeyo/ui` (`packages/ui/src/{atoms,molecules,organisms}` verified). `PatientDetailScreen.tsx:140–158` `quickStats` block is the nearest visual precedent |

---

## Metadata

**Analog search scope:**
`apps/api/src/{lib,jobs,middleware,modules,plugins,realtime}`, `apps/api/prisma/{schema.prisma,seed.ts,post-migrate.sql,rls,migrations}`, `apps/api/tests/**`, `apps/mobile/{app,src/{features,lib}}`, `packages/{types,validators,ui}/src`, `.github/workflows/ci.yml`, `.planning/phases/05-inventory-management/05-0{1,6,8}-PLAN.md`

**Files read in full or in targeted ranges:** 38
**Directory listings / greps:** 14
**Pattern extraction date:** 2026-08-12
**Upstream inputs:** `06-CONTEXT.md` (D-01…D-33), `06-RESEARCH.md` (1377 lines, all sections), `06-UI-SPEC.md` (component inventory, lines 375–478)
