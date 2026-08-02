# Architecture Research

**Domain:** Veterinary Practice Management SaaS (India-focused)
**Researched:** 2026-04-10
**Confidence:** MEDIUM (domain knowledge; web research unavailable)

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Layer                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ Mobile App   │  │ Web Dashboard│  │ WhatsApp (Simulator)  │   │
│  │ (Expo/RN)    │  │ (Next.js)    │  │ (Webhook Receiver)    │   │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘   │
│         │                 │                      │               │
├─────────┴─────────────────┴──────────────────────┴───────────────┤
│                        API Gateway                                │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │              REST API (Fastify/Node.js)                    │   │
│  │  Auth │ Queue │ EMR │ Inventory │ Invoicing │ Scheduling   │   │
│  └───────────────────────┬───────────────────────────────────┘   │
│                          │                                        │
├──────────────────────────┴────────────────────────────────────────┤
│                     Service Layer                                  │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Queue   │  │ EMR      │  │ Inventory│  │ Billing/Payment  │  │
│  │ Service │  │ Service  │  │ Service  │  │ Service          │  │
│  └────┬────┘  └────┬─────┘  └────┬─────┘  └────┬─────────────┘  │
│       │            │             │              │                 │
├───────┴────────────┴─────────────┴──────────────┴─────────────────┤
│                     Infrastructure Layer                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │PostgreSQL│  │  Redis   │  │ BullMQ   │  │ Object Storage   │  │
│  │ (Primary)│  │ (Cache/  │  │ (Jobs)   │  │ (S3 Mumbai)      │  │
│  │          │  │  PubSub) │  │          │  │                  │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘  │
└───────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Mobile App | Clinical workflows: walk-in queue, EMR, prescriptions, barcode scanning, voice input | Expo/React Native; offline-first for critical paths; camera access for scanning |
| Web Dashboard | Admin functions: analytics, inventory management, scheduling, user management | Next.js App Router; responsive but optimized for tablet/desktop |
| API Server | Business logic, auth, data validation, real-time events | Fastify with modular route handlers; WebSocket for live queue updates |
| Queue Service | Walk-in queue management, status transitions, real-time updates | Redis-backed; Socket.IO for live push; queue position calculation |
| EMR Service | Patient records, SOAP notes, vitals, prescriptions, medical history | PostgreSQL with JSONB for flexible clinical data; audit trail for all changes |
| Inventory Service | Stock tracking, batch/lot management, expiry monitoring, par-level alerts | PostgreSQL for inventory records; cron jobs for expiry alerts |
| Billing Service | Invoice generation, GST calculation, payment processing, receipt management | Razorpay integration; GST rules engine; PDF generation |
| WhatsApp Service | Message templating, send/receive, simulator mode, webhook handling | Abstraction layer: simulator in Beta, swap to real API later |
| Auth Service | User registration, login, OTP, role-based access control | JWT tokens; refresh token rotation; RBAC middleware |

## Recommended Project Structure

```
breeyo/
├── apps/
│   ├── mobile/                # Expo/React Native mobile app
│   │   ├── app/               # Expo Router screens
│   │   │   ├── (auth)/        # Login, register screens
│   │   │   ├── (tabs)/        # Main tab navigation
│   │   │   │   ├── queue/     # Walk-in queue screens
│   │   │   │   ├── patients/  # Patient lookup/registration
│   │   │   │   ├── inventory/ # Stock management + scanning
│   │   │   │   └── settings/  # User settings
│   │   │   └── consultation/  # EMR, SOAP notes, prescriptions
│   │   ├── components/        # Mobile-specific components
│   │   ├── hooks/             # Mobile-specific hooks
│   │   └── services/          # API client, offline sync
│   │
│   ├── web/                   # Next.js web dashboard
│   │   ├── app/               # App Router pages
│   │   │   ├── (auth)/        # Login pages
│   │   │   ├── dashboard/     # Admin dashboard
│   │   │   ├── inventory/     # Inventory management
│   │   │   ├── scheduling/    # Calendar/scheduling
│   │   │   ├── reports/       # Analytics/reports
│   │   │   └── settings/      # Clinic settings, users
│   │   └── components/        # Web-specific components
│   │
│   └── api/                   # Fastify API server
│       ├── src/
│       │   ├── modules/       # Domain modules (bounded contexts)
│       │   │   ├── auth/      # Authentication + authorization
│       │   │   ├── queue/     # Walk-in queue management
│       │   │   ├── patient/   # Patient + pet registration
│       │   │   ├── emr/       # Medical records, SOAP notes
│       │   │   ├── inventory/ # Stock, batches, scanning
│       │   │   ├── billing/   # Invoicing, payments, GST
│       │   │   ├── scheduling/# Appointments, calendar
│       │   │   └── whatsapp/  # WhatsApp integration (simulator)
│       │   ├── middleware/    # Auth, validation, error handling
│       │   ├── plugins/       # Fastify plugins (DB, Redis, etc.)
│       │   └── utils/         # Shared utilities
│       ├── prisma/
│       │   ├── schema.prisma  # Database schema
│       │   └── migrations/    # Database migrations
│       └── tests/
│
├── packages/
│   ├── types/                 # Shared TypeScript types/interfaces
│   ├── validators/            # Shared zod schemas
│   ├── ui/                    # Shared UI components (if any)
│   └── config/                # Shared configuration (ESLint, TS)
│
├── turbo.json                 # Turborepo config
├── package.json               # Root package.json
└── docker-compose.yml         # Local dev: PostgreSQL + Redis
```

### Structure Rationale

- **apps/mobile/:** Expo Router for file-based navigation; clinical-workflow-optimized screen layout
- **apps/web/:** Next.js App Router; admin-focused with responsive design
- **apps/api/:** Modular monolith — each domain module has its own routes, services, and types; easy to extract to microservices later if needed
- **packages/types/:** Shared TypeScript interfaces ensure API contract consistency between all apps
- **packages/validators/:** zod schemas shared between client (form validation) and server (API validation)
- **Turborepo:** Manages the monorepo with caching; parallel builds; dependency graph

## Architectural Patterns

### Pattern 1: Modular Monolith with Bounded Contexts

**What:** Single deployable API server with clear module boundaries. Each module (auth, queue, EMR, inventory, billing) owns its data and exposes a defined interface.

**When to use:** Start here. 20-clinic Beta doesn't need microservices complexity.

**Trade-offs:**
- Pro: Simple deployment, easy debugging, shared database
- Pro: Module boundaries ready for extraction if scaling demands
- Con: All modules share the same process; one module's crash affects all

**Example:**
```typescript
// apps/api/src/modules/queue/routes.ts
export async function queueRoutes(fastify: FastifyInstance) {
  fastify.post('/queue/checkin', { schema: checkinSchema }, checkinHandler);
  fastify.get('/queue/current', { schema: queueSchema }, getCurrentQueue);
  fastify.patch('/queue/:id/status', { schema: statusSchema }, updateStatus);
}

// apps/api/src/modules/queue/service.ts
export class QueueService {
  constructor(private db: PrismaClient, private redis: Redis) {}

  async checkin(clinicId: string, patientId: string): Promise<QueueEntry> {
    // Business logic: add to queue, calculate position, notify via Socket.IO
  }
}
```

### Pattern 2: Offline-First with Sync Queue

**What:** Mobile app stores critical operations locally and syncs when online. Uses a sync queue pattern where operations are recorded locally and replayed to the server.

**When to use:** Barcode scanning, patient checkin, basic data entry — any flow that must work without network.

**Trade-offs:**
- Pro: Works in areas with poor connectivity (common in Tier 2 cities)
- Pro: Fast user experience — no waiting for network
- Con: Conflict resolution complexity
- Con: Data may be stale until sync completes

**Example:**
```typescript
// Sync queue pattern
interface SyncOperation {
  id: string;
  type: 'CHECKIN' | 'SCAN_ITEM' | 'CREATE_NOTE';
  payload: Record<string, unknown>;
  timestamp: number;
  synced: boolean;
}

// Queue operations locally, sync when online
async function enqueueOperation(op: SyncOperation) {
  await localDb.syncQueue.add(op);
  if (isOnline()) {
    await syncPendingOperations();
  }
}
```

### Pattern 3: Event-Driven Cross-Module Communication

**What:** Modules communicate via events rather than direct function calls. When a prescription is created, it emits an event that inventory and billing modules consume.

**When to use:** When actions in one module trigger side effects in others (prescription -> inventory deduction -> invoice line item).

**Trade-offs:**
- Pro: Loose coupling between modules
- Pro: Easy to add new side effects without modifying source module
- Con: Harder to trace execution flow
- Con: Eventually consistent — not instant

**Example:**
```typescript
// When a prescription is created in EMR module
eventBus.emit('prescription.created', {
  prescriptionId,
  items: [{ drugId, quantity, batchId }],
  patientId,
  clinicId,
});

// Inventory module listens
eventBus.on('prescription.created', async (event) => {
  await inventoryService.deductStock(event.items);
});

// Billing module listens
eventBus.on('prescription.created', async (event) => {
  await billingService.addLineItems(event.prescriptionId, event.items);
});
```

## Data Flow

### Request Flow (Walk-in Checkin)

```
[Vet/Front Desk taps "Check In"]
    ↓
[Mobile App] → POST /queue/checkin { patientId, reason }
    ↓
[Auth Middleware] → Verify JWT, check role permissions
    ↓
[Queue Service] → Create queue entry, calculate position
    ↓
[PostgreSQL] → INSERT into queue_entries
    ↓
[Redis PubSub] → Publish queue update event
    ↓
[Socket.IO] → Push to all connected clients (mobile + web)
    ↓
[All Devices] ← Queue display updates in real time
```

### State Management (Mobile)

```
[Zustand Store]
    ├── queueStore (walk-in queue state)
    ├── patientStore (current patient context)
    ├── inventoryStore (scanned items, stock levels)
    └── syncStore (offline operations queue)
         ↓ (on connectivity change)
    [Sync Engine] → Replay operations to API
         ↓
    [API Server] → Process and confirm
         ↓
    [Zustand Store] ← Update with server-confirmed state
```

### Key Data Flows

1. **Consultation Flow:** Patient checkin → Queue → Called to consult → SOAP notes → Prescription → Inventory deduction → Invoice generation → Payment → Receipt
2. **Inventory Flow:** Barcode scan → Stock update → Par-level check → Alert if low → Want-list generation → Manual reorder
3. **WhatsApp Flow:** Appointment/reminder trigger → Template selection → Message queue (BullMQ) → WhatsApp API (or simulator) → Delivery confirmation → Log
4. **Payment Flow:** Invoice created → Payment link generated (Razorpay) → UPI/card payment → Webhook confirmation → Invoice marked paid → Receipt via WhatsApp

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-20 clinics (Beta) | Single Fastify instance; single PostgreSQL; Redis for cache/pubsub; monolith is fine |
| 20-500 clinics | Add connection pooling (PgBouncer); read replica for analytics; CDN for static assets; horizontal API scaling behind load balancer |
| 500-5,000 clinics | Row-level security for multi-tenancy; split analytics to separate DB; consider extracting WhatsApp/notification service; Redis cluster |
| 5,000+ clinics | Shard by region; extract billing as separate service (PCI compliance); dedicated inventory service; event bus (Kafka/SQS) for cross-service communication |

### Scaling Priorities

1. **First bottleneck:** Database connections — solve with PgBouncer connection pooling and query optimization
2. **Second bottleneck:** Real-time connections — solve with Redis adapter for Socket.IO horizontal scaling
3. **Third bottleneck:** Background job throughput — solve with BullMQ worker scaling and dedicated job servers

## Anti-Patterns

### Anti-Pattern 1: Appointment-First Architecture

**What people do:** Build scheduling as the primary workflow, with walk-ins as an afterthought
**Why it's wrong:** Indian vet clinics are 80%+ walk-in; appointment-first design fights the actual workflow
**Do this instead:** Build walk-in queue as primary; appointments as optional overlay that feeds into the same queue

### Anti-Pattern 2: Fat Client for Medical Records

**What people do:** Store complete EMR data on mobile device for offline access
**Why it's wrong:** Medical records grow large; syncing full patient history to every device is slow and creates storage/privacy issues
**Do this instead:** Cache only active patient context locally; fetch history on-demand; offline support only for current consultation

### Anti-Pattern 3: Single Database Table for All Clinical Data

**What people do:** Create one generic "records" table with type column and JSONB data
**Why it's wrong:** Loses queryability, makes reporting impossible, no referential integrity for prescriptions/vitals/notes
**Do this instead:** Proper relational schema: patients, consultations, soap_notes, prescriptions, prescription_items, vitals — with JSONB only for truly flexible fields (custom form data)

### Anti-Pattern 4: Building WhatsApp Integration First

**What people do:** Block development on WhatsApp API access; try to integrate real API before core product works
**Why it's wrong:** Meta Business verification takes weeks/months; core product value exists without WhatsApp
**Do this instead:** Build with WhatsApp simulator; design clean abstraction layer; swap implementation when API access granted

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Razorpay | REST API + Webhooks | Create payment links from invoices; webhook for payment confirmation; test mode for development |
| WhatsApp Business API | REST API + Webhooks (via Gupshup/direct) | Simulated in Beta; abstraction layer for easy swap; template messages require pre-approval |
| AWS S3 (Mumbai) | SDK direct upload | Medical images, lab reports, invoice PDFs; signed URLs for access control |
| Speech-to-Text | Web Speech API / Google Cloud STT | Browser/mobile native STT for basic transcription; Google Cloud for better accuracy if needed |
| Push Notifications | Expo Push / Firebase Cloud Messaging | Appointment reminders, queue updates, inventory alerts |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Queue ↔ Patient | Direct function call | Same API process; queue references patient records |
| EMR ↔ Inventory | Event bus | Prescription creation triggers stock deduction asynchronously |
| Billing ↔ EMR | Event bus | Consultation completion triggers invoice line item creation |
| Billing ↔ Payment | Direct API call + Webhook | Synchronous payment link creation; async payment confirmation |
| All modules ↔ WhatsApp | Job queue (BullMQ) | All WhatsApp messages go through queue for rate limiting and retry |

## Multi-Tenancy Strategy

**Approach:** Shared database with row-level security (RLS)

- Every table has `clinic_id` column
- PostgreSQL RLS policies enforce tenant isolation
- Application sets `clinic_id` context on each request via middleware
- Simpler than database-per-tenant for 20-5,000 clinics
- Migration to sharded approach at 5,000+ if needed

```sql
-- Example RLS policy
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON patients
  USING (clinic_id = current_setting('app.clinic_id')::uuid);
```

## Sources

- Domain knowledge: SaaS multi-tenancy patterns
- India deployment patterns (AWS Mumbai region)
- Veterinary practice management workflow analysis
- Modular monolith architecture patterns
- Offline-first mobile architecture patterns
- Confidence: MEDIUM — patterns are well-established; India-specific deployment needs validation

---
*Architecture research for: Veterinary Practice Management SaaS (India)*
*Researched: 2026-04-10*
