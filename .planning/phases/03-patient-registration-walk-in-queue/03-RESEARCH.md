# Phase 3: Patient Registration & Walk-in Queue - Research

**Researched:** 2026-04-19
**Domain:** Patient data modeling, real-time queue management, WebSocket synchronization, mobile search UX
**Confidence:** HIGH

## Summary

Phase 3 is the first feature phase in Breeyo, consuming the monorepo/auth foundation from Phase 1 and the design system from Phase 2. It delivers two tightly coupled bounded contexts -- Patient Management (owner/pet registration, search, profiles) and Walk-in Queue (check-in, status board, real-time sync). The technical core is a PostgreSQL data model with RLS multi-tenancy, a Fastify API with Socket.IO for real-time push, and a React Native frontend using the Phase 2 component library.

The stack is fully locked by prior decisions: Prisma ORM for database access, Socket.IO for WebSocket, TanStack React Query for server state, Zustand for client state, and zod for validation. The research focus is therefore on HOW to implement these correctly: Prisma schema patterns for the owner-pet-queue relationship with RLS, Socket.IO room-based broadcasting scoped to clinic tenants, React Query + Socket.IO cache invalidation patterns, debounced search with pg_trgm trigram indexes, and queue state machine transitions.

**Critical version update:** Prisma is now at v7.7.0 (not v6+ as STACK.md states). Prisma 7 has significant breaking changes: ESM-only, driver adapters required (`@prisma/adapter-pg`), new `prisma.config.ts` file, import path changes. Phase 1 MUST establish the Prisma 7 setup; Phase 3 research assumes Prisma 7 is the version in use.

**Primary recommendation:** Build the queue as a PostgreSQL table (not Redis) with Socket.IO room-per-clinic for real-time broadcasting, React Query for data fetching with Socket.IO-driven cache invalidation, and Zustand only for ephemeral UI state (current filters, selected tab). Use FlatList (not FlashList) for the queue list since daily volume is 15-25 patients -- well under the threshold where FlashList provides benefit.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Registration Flow:**
- D-01: Two-step wizard for new patient registration -- Step 1: Owner info (mobile + name required). Step 2: Pet info (name + species required). Matches Phase 2 wizard pattern (D-11)
- D-02: Searchable dropdown for species and breed -- pre-loaded list of companion animals. User types to filter. Custom entry for exotic pets
- D-03: Companion animals only -- no livestock species
- D-04: Minimal required fields -- pet name + species required at registration. Breed, age/DOB, weight, color, microchip ID all optional
- D-05: Auto-detect returning owner by mobile number -- system finds existing owner + all their pets
- D-06: Mobile number as unique key for owners -- one owner per mobile number, prevents duplicates
- D-07: "Add another pet" button after completing pet step -- loops back to pet form for multi-pet owners
- D-08: Owner info collected: mobile number + name required. Address, email, alternate phone optional
- D-09: Optional pet photo -- camera/gallery option but not required
- D-10: Approximate age input -- "Years" and "Months" number fields
- D-11: Optional notes field at end of registration
- D-12: Quick inline registration from check-in flow -- minimal fields only

**Check-in Experience:**
- D-13: 2-tap check-in flow: FAB -> mobile number -> tap pet to check in
- D-14: Optional visit reason quick-select after check-in
- D-15: Optional emergency priority toggle at check-in
- D-16: Post-check-in feedback: toast notification with position

**Queue Board Behavior:**
- D-17: "Call Next" button + tap-to-call specific patient
- D-18: Tap status badge to cycle: Waiting -> In Consult -> Done. Long-press for No-show
- D-19: Simple average wait estimation based on last 7 days
- D-20: Queue grouped by status: In Consult, Waiting, Done
- D-21: Essential info on queue cards: pet name, species icon, owner name, check-in time, queue position, status badge, visit reason
- D-22: Manual no-show marking via long-press
- D-23: Auto-archive at midnight
- D-24: Subtle sound + haptic notification when queue changes on another device

**Patient Search & Profiles:**
- D-25: Live search bar with debounced results across owner name, mobile, pet name
- D-26: Patients tab default view: recent patients sorted by most recent visit
- D-27: Pet profile page with photo, details, quick stats, visit history timeline
- D-28: Owner-to-pet navigation
- D-29: Visit history shows current clinic only
- D-30: Edit mode for pet profiles with explicit Save/Cancel
- D-31: Chronological visit timeline, newest first
- D-32: No pet record merge tool for Beta

**Real-time Sync:**
- D-33: Instant push via Socket.IO within 1-2 seconds
- D-34: Offline: show last-known state with yellow banner. No offline modifications
- D-35: Last-write-wins for concurrent status changes

**Multi-user Queue Workflow:**
- D-36: Same view, same actions for all roles
- D-37: In Consult cards show treating vet name

**Queue Capacity & Edge Cases:**
- D-38: Unlimited queue size
- D-39: In Consult entries persist past midnight auto-archive
- D-40: Same-day re-check-in allowed with confirmation

**Data Entry & Accessibility:**
- D-41: Unicode/Hindi (Devanagari) support for all name fields
- D-42: 10-digit Indian mobile number with auto-format (98765 43210)
- D-43: Contextual form suggestions

### Claude's Discretion
- Exact WebSocket reconnection strategy and retry logic
- Queue card animation details (status transitions, new entry appearance, reorder animation)
- Search debounce timing (200-500ms range)
- Exact species and breed lists for the searchable dropdown
- Wait time display format and update frequency
- Toast notification duration and positioning
- Queue position numbering reset behavior
- Pull-to-refresh behavior as WebSocket fallback

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PAT-01 | Register pet owner with mobile number as primary ID | Prisma Owner model with unique mobile constraint; zod validation for 10-digit Indian mobile; two-step wizard consuming Phase 2 WizardStepper component |
| PAT-02 | Register pet linked to owner | Prisma Pet model with foreign key to Owner; species/breed enum or lookup table; optional fields (breed, age, weight, color, microchip) |
| PAT-03 | Link multiple pets to one owner | One-to-many Owner -> Pet relationship; "Add another pet" flow loops pet registration step |
| PAT-04 | Search by owner name, mobile, pet name | PostgreSQL pg_trgm trigram index for fuzzy search; Prisma raw query or TypedSQL for ILIKE with GIN index; debounced input (300ms) |
| PAT-05 | View pet profile with visit history | Pet profile page with joined owner data + QueueEntry history as visit timeline; compound Card component from Phase 2 |
| QUE-01 | Check in walk-in in 2 taps | FAB -> BottomSheet with mobile input -> auto-lookup owner/pets -> tap pet to create QueueEntry; Quick inline registration for new patients |
| QUE-02 | Real-time queue across devices | Socket.IO rooms scoped per clinic (room = `clinic:{clinicId}`); Redis adapter for horizontal scaling; React Query cache invalidation on socket events |
| QUE-03 | Queue position + estimated wait | Computed field: position = count of Waiting entries ahead; estimated wait = position * rolling 7-day average consultation duration |
| QUE-04 | Update queue status (waiting/in-consult/done/no-show) | Status enum with state machine validation in API; last-write-wins with updatedAt timestamp comparison; Socket.IO broadcast on transition |
| QUE-05 | Call next patient | API endpoint selects oldest Waiting entry (or oldest emergency first), transitions to In Consult, assigns treating vet, broadcasts via Socket.IO |
| QUE-06 | Returning patient auto-fill | Mobile number lookup returns existing owner + pets; front-end pre-fills check-in form; no re-registration needed |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Follow Domain-Driven Design with bounded contexts (Patient context + Queue context)
- Keep files under 500 lines
- Use typed interfaces for all public APIs
- Prefer TDD London School (mock-first) for new code
- Use `/src` for source code, `/tests` for tests, `/docs` for docs
- NEVER save to root folder
- ALWAYS run tests after making code changes
- ALWAYS verify build succeeds before committing
- Vitest for unit/integration testing
- Security: validate user input at system boundaries, sanitize file paths

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| prisma | 7.7.0 | ORM / database client / migrations | Type-safe queries; migration management; client extensions for RLS; ESM-native in v7; driver adapter architecture |
| @prisma/adapter-pg | 7.7.0 | PostgreSQL driver adapter | Required by Prisma 7; replaces built-in engine; uses node `pg` under the hood |
| pg | 8.x | PostgreSQL client (peer dep for adapter) | Standard Node.js PostgreSQL driver; required by @prisma/adapter-pg |
| socket.io | 4.8.3 | Real-time WebSocket server | Room-based broadcasting; auto-reconnection; fallback transports; Redis adapter support |
| socket.io-client | 4.8.3 | WebSocket client for React Native | Matching server version; auto-reconnect; event-based messaging |
| @socket.io/redis-adapter | 8.3.0 | Socket.IO multi-instance scaling | Redis pub/sub for broadcasting across multiple server instances; required for horizontal scaling |
| fastify-socket.io | 5.1.0 | Fastify plugin for Socket.IO | Integrates Socket.IO into Fastify's lifecycle; decorates server instance |
| @tanstack/react-query | 5.99.2 | Server state management | API data fetching/caching; cache invalidation via Socket.IO events; optimistic updates for status changes |
| zustand | 5.0.12 | Client state management | Ephemeral UI state (filters, selected queue tab, form drafts); lightweight; 2KB |
| zod | 4.3.6 | Schema validation | Shared validation between client and server; Indian mobile number validation; form validation |
| fastify | 5.8.5 | API server | Phase 1 establishes this; fast async I/O; schema validation; TypeScript-first |
| expo-haptics | 55.0.14 | Haptic feedback | Queue status change notifications (D-24); check-in confirmation; expo-bundled |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| ioredis | 5.x | Redis client | Socket.IO Redis adapter; cache for queue stats; session store |
| date-fns | 4.x | Date/time handling | IST timezone; check-in timestamps; auto-archive midnight calculation; wait time display |
| react-native-paper | 5.15.1 | UI components (from Phase 2) | All form inputs, cards, badges, FAB, bottom sheet integration |
| @gorhom/bottom-sheet | 5.2.9 | Bottom sheet (from Phase 2) | Check-in flow bottom sheet; visit reason selector |
| expo-image-picker | Latest (Expo bundled) | Pet photo capture | Optional pet photo during registration (D-09) |
| node-cron | 3.x | Scheduled tasks | Midnight auto-archive job (D-23); runs on server |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| FlatList (queue list) | @shopify/flash-list 2.3.1 | FlashList is 5-10x faster via cell recycling; but queue is 15-25 items/day -- FlatList is sufficient and simpler. Use FlashList only if patient search results exceed 500 items regularly |
| PostgreSQL for queue | Redis sorted sets | Redis is faster for pure queue operations; but queue needs ACID joins with patient data + audit trail + RLS tenancy. PostgreSQL is the right choice |
| Prisma fulltext search | pg_trgm raw SQL | Prisma fulltext search is still Preview and slow without manual index support. Use Prisma `$queryRaw` or TypedSQL with pg_trgm GIN index for patient search |
| node-cron | BullMQ | BullMQ is more robust for distributed job scheduling; overkill for a single midnight archive job. Use node-cron for Phase 3; upgrade to BullMQ in Phase 7 (WhatsApp reminders) |

**Installation (in API package):**
```bash
# Prisma 7 setup
pnpm add prisma@latest @prisma/client@latest @prisma/adapter-pg pg
pnpm add -D @types/pg

# Real-time
pnpm add socket.io fastify-socket.io @socket.io/redis-adapter ioredis

# Scheduling
pnpm add node-cron
pnpm add -D @types/node-cron
```

**Installation (in mobile app):**
```bash
# Socket.IO client
pnpm add socket.io-client

# Haptics (Expo bundled)
npx expo install expo-haptics expo-image-picker

# Already installed from Phase 2: react-native-paper, @gorhom/bottom-sheet, etc.
```

**Version verification:** All versions verified against npm registry on 2026-04-19.

**CRITICAL: Prisma version mismatch with STACK.md.** STACK.md recommends "Prisma 6+". The current version is 7.7.0 with major breaking changes. Phase 1 MUST set up Prisma 7, not 6. Key changes:
- ESM-only output
- `prisma.config.ts` replaces env in schema
- `@prisma/adapter-pg` driver adapter required
- PrismaClient imported from generated path, not `@prisma/client`
- Client middleware removed; use Client Extensions instead

## Architecture Patterns

### Recommended Project Structure

```
apps/
  api/
    src/
      modules/
        patient/                    # Patient bounded context
          patient.routes.ts         # Fastify route registration
          patient.controller.ts     # Request handling, response formatting
          patient.service.ts        # Business logic (registration, search)
          patient.repository.ts     # Prisma queries, raw SQL for search
          patient.schema.ts         # zod validation schemas
          patient.types.ts          # TypeScript interfaces
          __tests__/
            patient.service.test.ts
            patient.controller.test.ts
        queue/                      # Queue bounded context
          queue.routes.ts
          queue.controller.ts
          queue.service.ts          # Check-in, status transitions, call-next
          queue.repository.ts       # Queue queries with position calculation
          queue.schema.ts           # zod schemas for queue operations
          queue.state-machine.ts    # Valid status transitions
          queue.types.ts
          __tests__/
            queue.service.test.ts
            queue.state-machine.test.ts
      realtime/
        socket.ts                   # Socket.IO server setup + auth middleware
        socket.events.ts            # Event name constants
        socket.handlers.ts          # Event handlers (join room, leave room)
      jobs/
        midnight-archive.ts         # Cron job for queue auto-archive
      middleware/
        tenant.ts                   # RLS tenant context middleware (from Phase 1)
        auth.ts                     # Auth middleware (from Phase 1)
  mobile/
    src/
      features/
        patient/
          screens/
            PatientListScreen.tsx   # Search + recent patients (D-25, D-26)
            PatientDetailScreen.tsx # Pet profile with visit history (D-27)
            OwnerDetailScreen.tsx   # Owner card + pet list (D-28)
            RegisterPatientScreen.tsx # Two-step wizard (D-01)
          hooks/
            usePatientSearch.ts     # Debounced search with React Query
            usePatientRegister.ts   # Registration mutation
          components/
            PatientSearchBar.tsx
            PetProfileCard.tsx
            VisitTimeline.tsx
            SpeciesBreedPicker.tsx
        queue/
          screens/
            QueueScreen.tsx         # Main queue status board (D-20)
          hooks/
            useQueue.ts             # React Query + Socket.IO for queue data
            useQueueSocket.ts       # Socket.IO connection management
            useCheckIn.ts           # Check-in mutation with optimistic update
            useQueueActions.ts      # Status transition mutations
          components/
            QueueBoard.tsx          # Grouped list: In Consult, Waiting, Done
            QueueCardItem.tsx       # Individual queue entry card (D-21)
            CheckInSheet.tsx        # Bottom sheet for 2-tap check-in (D-13)
            CallNextButton.tsx      # "Call Next" button (D-17)
            VisitReasonPicker.tsx   # Quick-select bottom sheet (D-14)
          store/
            queueUIStore.ts         # Zustand: filters, selected section, sound prefs
packages/
  shared/
    src/
      schemas/
        patient.schema.ts          # Shared zod schemas (client + server)
        queue.schema.ts             # Shared zod schemas
      types/
        patient.types.ts            # Shared TypeScript types
        queue.types.ts
      constants/
        species.ts                  # Species + breed lists
        queue-status.ts             # Queue status enum + transitions
        socket-events.ts            # Socket event name constants
prisma/
  schema.prisma                     # Database schema
  migrations/                       # Migration files
  seed.ts                           # Seed data (species, breeds, test clinic)
prisma.config.ts                    # Prisma 7 config
```

### Pattern 1: Prisma Schema with RLS Multi-Tenancy

**What:** Every patient/queue table includes a `clinicId` column. RLS policies enforce tenant isolation at the database level. Prisma Client Extension sets the clinic context per request.

**When to use:** Every query in the patient and queue modules.

**Example:**
```prisma
// prisma/schema.prisma

enum Species {
  DOG
  CAT
  BIRD
  RABBIT
  FISH
  REPTILE
  OTHER
}

enum QueueStatus {
  WAITING
  IN_CONSULT
  DONE
  NO_SHOW
}

model Owner {
  id          String   @id @default(cuid())
  clinicId    String
  mobile      String
  name        String
  email       String?
  address     String?
  altPhone    String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  clinic      Clinic   @relation(fields: [clinicId], references: [id])
  pets        Pet[]

  @@unique([clinicId, mobile])  // Unique mobile per clinic
  @@index([clinicId])
  @@index([clinicId, name])
  @@index([clinicId, mobile])
}

model Pet {
  id          String    @id @default(cuid())
  clinicId    String
  ownerId     String
  name        String
  species     Species
  breed       String?
  birthYear   Int?      // Approximate birth year
  birthMonth  Int?      // Approximate birth month
  weight      Float?
  color       String?
  microchipId String?
  photoUrl    String?
  notes       String?   // Behavioral warnings, allergies (D-11)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  clinic      Clinic    @relation(fields: [clinicId], references: [id])
  owner       Owner     @relation(fields: [ownerId], references: [id])
  queueEntries QueueEntry[]

  @@index([clinicId])
  @@index([clinicId, ownerId])
  @@index([clinicId, name])
}

model QueueEntry {
  id            String      @id @default(cuid())
  clinicId      String
  petId         String
  checkedInBy   String      // User ID who checked in
  treatingVetId String?     // User ID of vet (set on IN_CONSULT)
  status        QueueStatus @default(WAITING)
  position      Int         // Queue position at time of check-in
  isEmergency   Boolean     @default(false)
  visitReason   String?     // Quick-select reason (D-14)
  checkedInAt   DateTime    @default(now())
  calledAt      DateTime?   // When moved to IN_CONSULT
  completedAt   DateTime?   // When moved to DONE/NO_SHOW
  archivedAt    DateTime?   // When midnight archive ran
  updatedAt     DateTime    @updatedAt

  clinic        Clinic      @relation(fields: [clinicId], references: [id])
  pet           Pet         @relation(fields: [petId], references: [id])

  @@index([clinicId, status])
  @@index([clinicId, checkedInAt])
  @@index([clinicId, petId, checkedInAt])
}
```

**RLS setup (raw SQL migration):**
```sql
-- Enable RLS on all tenant tables
ALTER TABLE "Owner" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Pet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QueueEntry" ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY owner_tenant_isolation ON "Owner"
  USING ("clinicId" = current_setting('app.current_clinic_id', true));

CREATE POLICY pet_tenant_isolation ON "Pet"
  USING ("clinicId" = current_setting('app.current_clinic_id', true));

CREATE POLICY queue_tenant_isolation ON "QueueEntry"
  USING ("clinicId" = current_setting('app.current_clinic_id', true));
```

**Prisma Client Extension for RLS (Prisma 7):**
```typescript
// Source: Prisma docs + prisma-client-extensions/row-level-security
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const basePrisma = new PrismaClient({ adapter });

export function createTenantClient(clinicId: string) {
  return basePrisma.$extends({
    query: {
      $allOperations({ args, query }) {
        return basePrisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            `SET LOCAL app.current_clinic_id = '${clinicId}'`
          );
          return query(args);
        });
      },
    },
  });
}
```

### Pattern 2: Socket.IO Room-Per-Clinic Broadcasting

**What:** Each clinic gets a Socket.IO room. When a queue event occurs (check-in, status change, call-next), the server broadcasts to all clients in that clinic's room. Clients receive events and invalidate React Query cache.

**When to use:** All real-time queue updates (QUE-02).

**Example:**
```typescript
// Server: realtime/socket.ts
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { SOCKET_EVENTS } from '@breeyo/shared/constants/socket-events';

export function setupSocketIO(io: Server) {
  // Redis adapter for multi-instance scaling
  const pubClient = new Redis(process.env.REDIS_URL!);
  const subClient = pubClient.duplicate();
  io.adapter(createAdapter(pubClient, subClient));

  // Auth middleware: verify JWT, extract clinicId
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    try {
      const decoded = verifyToken(token);
      socket.data.userId = decoded.userId;
      socket.data.clinicId = decoded.clinicId;
      next();
    } catch {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    const { clinicId } = socket.data;
    // Join clinic room
    socket.join(`clinic:${clinicId}`);

    socket.on('disconnect', () => {
      socket.leave(`clinic:${clinicId}`);
    });
  });
}

// Broadcast helper used by queue service
export function broadcastQueueEvent(
  io: Server,
  clinicId: string,
  event: string,
  data: unknown
) {
  io.to(`clinic:${clinicId}`).emit(event, data);
}
```

```typescript
// Client: features/queue/hooks/useQueueSocket.ts
import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { SOCKET_EVENTS } from '@breeyo/shared/constants/socket-events';
import * as Haptics from 'expo-haptics';
import { useQueueUIStore } from '../store/queueUIStore';

export function useQueueSocket(clinicId: string, token: string) {
  const socketRef = useRef<Socket | null>(null);
  const queryClient = useQueryClient();
  const soundEnabled = useQueueUIStore((s) => s.soundEnabled);

  useEffect(() => {
    const socket = io(API_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });

    socket.on(SOCKET_EVENTS.QUEUE_UPDATED, () => {
      queryClient.invalidateQueries({ queryKey: ['queue', clinicId] });
      if (soundEnabled) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    });

    socket.on(SOCKET_EVENTS.PATIENT_CHECKED_IN, (data) => {
      queryClient.invalidateQueries({ queryKey: ['queue', clinicId] });
      if (soundEnabled) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    });

    socket.on('connect_error', () => {
      // Show offline banner via Zustand
      useQueueUIStore.getState().setOffline(true);
    });

    socket.on('connect', () => {
      useQueueUIStore.getState().setOffline(false);
      // Re-fetch all data on reconnect
      queryClient.invalidateQueries({ queryKey: ['queue', clinicId] });
    });

    socketRef.current = socket;
    return () => { socket.disconnect(); };
  }, [clinicId, token]);

  return socketRef;
}
```

### Pattern 3: React Query + Socket.IO Cache Invalidation

**What:** React Query manages all server state. Socket.IO events trigger `invalidateQueries()` to refetch stale data. Optimistic updates provide instant UI feedback for user's own actions.

**When to use:** All data fetching and mutations in queue and patient modules.

**Example:**
```typescript
// features/queue/hooks/useQueue.ts
import { useQuery } from '@tanstack/react-query';

export function useQueue(clinicId: string) {
  return useQuery({
    queryKey: ['queue', clinicId],
    queryFn: () => api.get(`/api/v1/queue?date=${todayIST()}`),
    staleTime: 30_000, // 30s -- Socket.IO handles real-time updates
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}

// features/queue/hooks/useQueueActions.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';

export function useUpdateQueueStatus(clinicId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ entryId, status }: { entryId: string; status: QueueStatus }) =>
      api.patch(`/api/v1/queue/${entryId}/status`, { status }),
    // Optimistic update for instant UI response
    onMutate: async ({ entryId, status }) => {
      await queryClient.cancelQueries({ queryKey: ['queue', clinicId] });
      const previous = queryClient.getQueryData(['queue', clinicId]);
      queryClient.setQueryData(['queue', clinicId], (old: QueueEntry[]) =>
        old.map((e) => e.id === entryId ? { ...e, status } : e)
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      // Rollback on error
      queryClient.setQueryData(['queue', clinicId], context?.previous);
    },
    onSettled: () => {
      // Socket.IO broadcast will also trigger invalidation for other devices
      queryClient.invalidateQueries({ queryKey: ['queue', clinicId] });
    },
  });
}
```

### Pattern 4: Queue Status State Machine

**What:** Valid status transitions are defined as a state machine. The API validates every transition before applying it, preventing invalid states.

**When to use:** Every queue status update (QUE-04).

**Example:**
```typescript
// shared/constants/queue-status.ts
export enum QueueStatus {
  WAITING = 'WAITING',
  IN_CONSULT = 'IN_CONSULT',
  DONE = 'DONE',
  NO_SHOW = 'NO_SHOW',
}

// Valid transitions: from -> [allowed destinations]
export const QUEUE_TRANSITIONS: Record<QueueStatus, QueueStatus[]> = {
  [QueueStatus.WAITING]: [QueueStatus.IN_CONSULT, QueueStatus.NO_SHOW],
  [QueueStatus.IN_CONSULT]: [QueueStatus.DONE, QueueStatus.NO_SHOW],
  [QueueStatus.DONE]: [],      // Terminal state
  [QueueStatus.NO_SHOW]: [],   // Terminal state
};

export function isValidTransition(from: QueueStatus, to: QueueStatus): boolean {
  return QUEUE_TRANSITIONS[from]?.includes(to) ?? false;
}
```

### Pattern 5: Debounced Patient Search with Trigram Index

**What:** Patient search uses PostgreSQL pg_trgm extension for fuzzy matching across owner name, mobile number, and pet name. Client-side debounce prevents excessive API calls.

**When to use:** Patient search (PAT-04).

**Example:**
```sql
-- Migration: enable pg_trgm and create GIN indexes
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_owner_name_trgm ON "Owner" USING gin (name gin_trgm_ops);
CREATE INDEX idx_owner_mobile_trgm ON "Owner" USING gin (mobile gin_trgm_ops);
CREATE INDEX idx_pet_name_trgm ON "Pet" USING gin (name gin_trgm_ops);
```

```typescript
// API: patient.repository.ts
export async function searchPatients(
  prisma: PrismaClient,
  clinicId: string,
  query: string,
  limit = 20
) {
  // Use raw SQL for trigram search with ranking
  const searchTerm = `%${query}%`;
  return prisma.$queryRaw`
    SELECT DISTINCT ON (o.id)
      o.id as "ownerId", o.name as "ownerName", o.mobile,
      p.id as "petId", p.name as "petName", p.species,
      GREATEST(
        similarity(o.name, ${query}),
        similarity(o.mobile, ${query}),
        similarity(p.name, ${query})
      ) as relevance
    FROM "Owner" o
    LEFT JOIN "Pet" p ON p."ownerId" = o.id AND p."clinicId" = ${clinicId}
    WHERE o."clinicId" = ${clinicId}
      AND (
        o.name ILIKE ${searchTerm}
        OR o.mobile ILIKE ${searchTerm}
        OR p.name ILIKE ${searchTerm}
      )
    ORDER BY o.id, relevance DESC
    LIMIT ${limit}
  `;
}
```

```typescript
// Mobile: features/patient/hooks/usePatientSearch.ts
import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';

export function usePatientSearch(clinicId: string) {
  const [searchTerm, setSearchTerm] = useState('');

  // Debounce: 300ms delay before firing API call
  const debouncedTerm = useDebounce(searchTerm, 300);

  const searchQuery = useQuery({
    queryKey: ['patients', 'search', clinicId, debouncedTerm],
    queryFn: () => api.get(`/api/v1/patients/search?q=${debouncedTerm}`),
    enabled: debouncedTerm.length >= 2, // Min 2 chars to search
    staleTime: 60_000,
  });

  return { searchTerm, setSearchTerm, ...searchQuery };
}
```

### Anti-Patterns to Avoid

- **Storing queue in Redis only:** Queue entries need ACID guarantees, audit trail, joins with patient data, and RLS tenancy. Redis is for caching/pub-sub, not as the source of truth for queue data.
- **Polling instead of WebSocket:** Polling creates unnecessary load and latency. Socket.IO with room-per-clinic is the correct pattern.
- **Single global Socket.IO room:** Broadcasting to all connected clients wastes bandwidth and leaks clinic information. Always scope to `clinic:{clinicId}` rooms.
- **Using Prisma fulltext search for patient lookup:** Prisma fulltext search is Preview-only and does not use indexes efficiently. Use raw SQL with pg_trgm for production search.
- **Putting queue position in the database as a static field:** Queue position is a computed value based on how many WAITING entries are ahead. Storing it creates stale data. Compute it at query time.
- **Using Zustand for server state:** Zustand is for ephemeral UI state only. Server data (queue entries, patients) must go through React Query for caching, refetching, and optimistic updates.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Mobile number validation | Custom regex | zod schema with `.regex(/^[6-9]\d{9}$/)` | India-specific: must start with 6-9, exactly 10 digits. zod gives reusable schema shared client/server |
| Mobile number formatting | Custom formatter | Format function: `${num.slice(0,5)} ${num.slice(5)}` | Simple enough to inline; 98765 43210 format per D-42 |
| Debounce hook | Custom setTimeout management | `useDebounce` from `use-debounce` or simple custom hook | Race condition prone; use battle-tested implementation |
| Queue state machine | Ad-hoc if/else chains | Explicit transition map (see Pattern 4) | State machines prevent invalid transitions; testable; self-documenting |
| WebSocket reconnection | Custom retry logic | Socket.IO built-in reconnection (`reconnection: true`) | Socket.IO handles exponential backoff, transport fallback, connection state |
| Optimistic updates | Manual cache manipulation | React Query `onMutate`/`onError`/`onSettled` pattern | Built-in rollback; handles concurrent mutations; race condition safe |
| Midnight archive job | Custom setInterval | node-cron `schedule('0 0 * * *', fn)` | Handles timezone; survives missed runs; standard cron syntax |
| Search result ranking | Custom scoring | PostgreSQL `similarity()` function from pg_trgm | Database-level ranking; uses GIN index; handles Unicode/Devanagari |
| Species/breed dropdown | Hardcoded arrays | Shared constants file in `@breeyo/shared` | Single source of truth; consumed by both API validation and mobile UI |
| Pet photo upload | Custom multipart handling | expo-image-picker + pre-signed S3 URL | Expo handles camera/gallery; S3 pre-signed URL avoids server memory pressure |

**Key insight:** The queue is a thin state machine over a PostgreSQL table, not a complex distributed system. At 15-25 patients/day, the technical complexity is in the real-time sync and UX, not in queue throughput. Do not over-engineer the data layer.

## Common Pitfalls

### Pitfall 1: RLS Not Applied on Raw Queries
**What goes wrong:** Prisma `$queryRaw` bypasses the client extension that sets `app.current_clinic_id`. Raw queries return data from all clinics.
**Why it happens:** Client extensions intercept Prisma operations but not raw SQL.
**How to avoid:** Wrap raw queries in the same transaction that sets the RLS parameter, OR always include `WHERE "clinicId" = ${clinicId}` in raw queries explicitly.
**Warning signs:** Patient search returns results from other clinics; test with multi-tenant data.

### Pitfall 2: Socket.IO Reconnection Loses Room Membership
**What goes wrong:** After a network drop and reconnect, the client is no longer in the clinic room. Queue updates stop appearing.
**Why it happens:** Socket.IO server-side rooms are in-memory. Reconnection creates a new socket ID. The client must re-join the room.
**How to avoid:** On `connect` event, always re-join the clinic room. Server-side: use the auth middleware to auto-join on connection.
**Warning signs:** Queue stops updating after putting phone to sleep or switching networks.

### Pitfall 3: Optimistic Update Race with Socket.IO Broadcast
**What goes wrong:** User taps "In Consult" (optimistic update shows immediately), then Socket.IO broadcast triggers `invalidateQueries` which refetches and briefly shows the old state, causing a flicker.
**Why it happens:** The invalidation refetch arrives before the server has committed the change.
**How to avoid:** In `onSettled`, add a small delay (200-500ms) before invalidation, OR compare timestamps and skip refetch if optimistic data is newer. Socket.IO event should include the new state so clients can use `setQueryData` directly instead of refetching.
**Warning signs:** Brief flicker of old status after tapping a status badge.

### Pitfall 4: Mobile Number Uniqueness Across Clinics
**What goes wrong:** The same pet owner visits two different clinics on Breeyo. A simple `UNIQUE(mobile)` constraint prevents registration at the second clinic.
**Why it happens:** Thinking of mobile as globally unique vs. per-clinic unique.
**How to avoid:** Use `@@unique([clinicId, mobile])` -- unique per clinic. Cross-clinic patient sharing is deferred to post-Beta (Phase 1, D-25).
**Warning signs:** "Owner already exists" error at a different clinic.

### Pitfall 5: Queue Position Becomes Stale
**What goes wrong:** Position numbers shown on the queue board are inconsistent after status changes (e.g., patient 3 becomes patient 2 after patient 1 enters consult, but UI still shows "3").
**Why it happens:** Storing position as a static field in the database at check-in time.
**How to avoid:** Compute position dynamically at query time: `ROW_NUMBER() OVER (PARTITION BY status ORDER BY "checkedInAt" ASC)` for WAITING entries only. Emergency entries ordered first.
**Warning signs:** Position numbers have gaps or don't decrease when patients ahead are called.

### Pitfall 6: Hindi/Devanagari Search Fails
**What goes wrong:** Searching for a pet owner name in Hindi returns no results even though the name was entered in Devanagari script.
**Why it happens:** pg_trgm works with Unicode but ILIKE is case-sensitive for non-Latin scripts. PostgreSQL collation must support the scripts used.
**How to avoid:** Use `ICU` collation on the database or ensure `C.UTF-8` locale. Test search with both Latin and Devanagari inputs. pg_trgm handles Unicode trigrams correctly as long as the locale is properly set.
**Warning signs:** Search works for English names but not Hindi names.

### Pitfall 7: Midnight Archive Timezone Issue
**What goes wrong:** Auto-archive runs at midnight UTC, which is 5:30 AM IST -- half a day's queue is already building.
**Why it happens:** Server cron uses UTC by default.
**How to avoid:** Configure node-cron with IST timezone: `cron.schedule('0 0 * * *', fn, { timezone: 'Asia/Kolkata' })`. Alternatively, store clinic closing time and archive relative to that.
**Warning signs:** "Done" entries from yesterday still showing at 6 AM IST.

### Pitfall 8: Same-Day Re-Check-In Creates Duplicate Queue Entries
**What goes wrong:** A pet that was already seen today (status: DONE) gets checked in again without confirmation, creating confusion about which is the current visit.
**Why it happens:** No check for existing same-day entries before creating a new QueueEntry.
**How to avoid:** Before check-in, query for existing same-day entries for this pet. If found with DONE status, show confirmation dialog (D-40). If found with WAITING/IN_CONSULT status, show error -- pet is already in the queue.
**Warning signs:** Same pet appears twice in the queue; vet confused about which entry is current.

## Code Examples

Verified patterns from official sources:

### Indian Mobile Number Validation (zod)
```typescript
// Source: zod docs + Indian mobile number regex convention
// shared/schemas/patient.schema.ts
import { z } from 'zod';

export const indianMobileSchema = z
  .string()
  .regex(/^[6-9]\d{9}$/, 'Mobile number must be 10 digits starting with 6-9')
  .transform((val) => val.replace(/\s/g, '')); // Strip formatting spaces

export const ownerRegistrationSchema = z.object({
  mobile: indianMobileSchema,
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().max(500).optional(),
  altPhone: z.string().regex(/^[6-9]\d{9}$/).optional().or(z.literal('')),
});

export const petRegistrationSchema = z.object({
  name: z.string().min(1, 'Pet name is required').max(100),
  species: z.enum(['DOG', 'CAT', 'BIRD', 'RABBIT', 'FISH', 'REPTILE', 'OTHER']),
  breed: z.string().max(100).optional(),
  birthYear: z.number().int().min(1990).max(2030).optional(),
  birthMonth: z.number().int().min(1).max(12).optional(),
  weight: z.number().positive().max(500).optional(),
  color: z.string().max(50).optional(),
  microchipId: z.string().max(50).optional(),
  notes: z.string().max(1000).optional(),
});

export const checkInSchema = z.object({
  petId: z.string().cuid(),
  visitReason: z.string().max(100).optional(),
  isEmergency: z.boolean().default(false),
});

export const queueStatusUpdateSchema = z.object({
  status: z.enum(['WAITING', 'IN_CONSULT', 'DONE', 'NO_SHOW']),
});
```

### Prisma 7 Setup with Driver Adapter
```typescript
// Source: Prisma 7 upgrade guide
// prisma.config.ts (project root)
import 'dotenv/config';
import path from 'node:path';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  datasource: { url: env('DATABASE_URL') },
  schema: path.join('prisma', 'schema.prisma'),
});

// apps/api/src/lib/prisma.ts
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

export const prisma = new PrismaClient({ adapter });

// Tenant-scoped client factory
export function tenantPrisma(clinicId: string) {
  return prisma.$extends({
    query: {
      $allOperations({ args, query }) {
        return prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            `SET LOCAL app.current_clinic_id = '${clinicId}'`
          );
          return query(args);
        });
      },
    },
  });
}
```

### Fastify + Socket.IO Integration
```typescript
// Source: fastify-socket.io docs + socket.io Redis adapter docs
// apps/api/src/plugins/socket.ts
import fp from 'fastify-plugin';
import fastifySocketIO from 'fastify-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';

export default fp(async function (fastify) {
  const pubClient = new Redis(process.env.REDIS_URL!);
  const subClient = pubClient.duplicate();

  await fastify.register(fastifySocketIO, {
    cors: { origin: '*' }, // Tighten in production
    transports: ['websocket'],
    adapter: createAdapter(pubClient, subClient),
  });

  fastify.io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      const decoded = fastify.jwt.verify(token);
      socket.data.userId = decoded.userId;
      socket.data.clinicId = decoded.clinicId;
      socket.join(`clinic:${decoded.clinicId}`);
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });
});
```

### Queue Service with Broadcasting
```typescript
// apps/api/src/modules/queue/queue.service.ts
import { SOCKET_EVENTS } from '@breeyo/shared/constants/socket-events';
import { isValidTransition, QueueStatus } from '@breeyo/shared/constants/queue-status';

export class QueueService {
  constructor(
    private prisma: PrismaClient,
    private io: Server
  ) {}

  async checkIn(clinicId: string, data: CheckInInput, userId: string) {
    // Check for same-day re-check-in (D-40)
    const today = startOfDay(new Date());
    const existing = await this.prisma.queueEntry.findFirst({
      where: {
        clinicId,
        petId: data.petId,
        checkedInAt: { gte: today },
        status: { in: ['WAITING', 'IN_CONSULT'] },
      },
    });

    if (existing) {
      throw new ConflictError('Pet is already in today\'s queue');
    }

    // Get next position
    const waitingCount = await this.prisma.queueEntry.count({
      where: { clinicId, status: 'WAITING', checkedInAt: { gte: today } },
    });

    const entry = await this.prisma.queueEntry.create({
      data: {
        clinicId,
        petId: data.petId,
        checkedInBy: userId,
        isEmergency: data.isEmergency ?? false,
        visitReason: data.visitReason,
        position: waitingCount + 1,
      },
      include: { pet: { include: { owner: true } } },
    });

    // Broadcast to all devices in this clinic
    this.io.to(`clinic:${clinicId}`).emit(SOCKET_EVENTS.PATIENT_CHECKED_IN, {
      entry,
      timestamp: Date.now(),
    });

    return entry;
  }

  async updateStatus(
    clinicId: string,
    entryId: string,
    newStatus: QueueStatus,
    userId: string
  ) {
    const entry = await this.prisma.queueEntry.findUniqueOrThrow({
      where: { id: entryId },
    });

    if (!isValidTransition(entry.status as QueueStatus, newStatus)) {
      throw new BadRequestError(
        `Cannot transition from ${entry.status} to ${newStatus}`
      );
    }

    const updateData: Record<string, unknown> = {
      status: newStatus,
      updatedAt: new Date(),
    };

    if (newStatus === QueueStatus.IN_CONSULT) {
      updateData.treatingVetId = userId;
      updateData.calledAt = new Date();
    }
    if (newStatus === QueueStatus.DONE || newStatus === QueueStatus.NO_SHOW) {
      updateData.completedAt = new Date();
    }

    const updated = await this.prisma.queueEntry.update({
      where: { id: entryId },
      data: updateData,
      include: { pet: { include: { owner: true } } },
    });

    // Broadcast status change
    this.io.to(`clinic:${clinicId}`).emit(SOCKET_EVENTS.QUEUE_UPDATED, {
      entry: updated,
      updatedBy: userId,
      timestamp: Date.now(),
    });

    return updated;
  }

  async callNext(clinicId: string, userId: string) {
    const today = startOfDay(new Date());

    // Emergency patients first, then FIFO by check-in time
    const next = await this.prisma.queueEntry.findFirst({
      where: {
        clinicId,
        status: 'WAITING',
        checkedInAt: { gte: today },
      },
      orderBy: [
        { isEmergency: 'desc' },
        { checkedInAt: 'asc' },
      ],
    });

    if (!next) {
      throw new NotFoundError('No patients waiting in queue');
    }

    return this.updateStatus(clinicId, next.id, QueueStatus.IN_CONSULT, userId);
  }
}
```

### Midnight Auto-Archive Job
```typescript
// apps/api/src/jobs/midnight-archive.ts
import cron from 'node-cron';

export function scheduleMidnightArchive(prisma: PrismaClient, io: Server) {
  // Run at midnight IST (D-23)
  cron.schedule('0 0 * * *', async () => {
    const today = startOfDay(new Date()); // IST

    // Archive WAITING, DONE, NO_SHOW entries from before today
    // D-39: IN_CONSULT entries persist past midnight
    const result = await prisma.queueEntry.updateMany({
      where: {
        archivedAt: null,
        status: { in: ['WAITING', 'DONE', 'NO_SHOW'] },
        checkedInAt: { lt: today },
      },
      data: { archivedAt: new Date() },
    });

    // Broadcast to all clinics that archive ran
    // Each clinic will refetch their queue
    io.emit(SOCKET_EVENTS.QUEUE_ARCHIVED, { timestamp: Date.now() });
  }, { timezone: 'Asia/Kolkata' });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Prisma 6 with built-in Rust engine | Prisma 7 with TypeScript client + driver adapters | 2026-Q1 | Must use `@prisma/adapter-pg`; new `prisma.config.ts`; ESM-only; import from generated path |
| Prisma middleware API | Prisma Client Extensions | Prisma 7 (removed) | Middleware removed in v7; use `$extends()` for RLS, logging, soft-delete |
| Socket.IO v3 with polling default | Socket.IO v4 with WebSocket-first | Stable since 2022 | Use `transports: ['websocket']` for mobile; skip HTTP long-polling overhead |
| Redux for React Native state | Zustand + React Query | 2024-2025 shift | React Query for server state; Zustand for UI state; Redux overkill for this scale |
| Prisma fulltext search | pg_trgm via raw SQL / TypedSQL | Ongoing | Prisma fulltext still Preview; pg_trgm is production-ready and faster with GIN index |
| FlatList for all lists | FlashList for large lists (500+) | 2023 | FlashList 5-10x faster via cell recycling; FlatList fine for <100 items (queue size) |

**Deprecated/outdated:**
- Prisma 6 middleware: Removed in v7. Use Client Extensions.
- Prisma `datasource.url` in schema: Deprecated. Move to `prisma.config.ts`.
- `@prisma/client` direct import: Deprecated in v7. Import from generated folder.
- Socket.IO `autoConnect: true` default: Still works but prefer explicit connection management in React Native for lifecycle control.

## Open Questions

1. **Pet photo storage backend**
   - What we know: D-09 says optional pet photo via camera/gallery. expo-image-picker handles capture.
   - What's unclear: Where to store photos -- S3 (requires AWS setup in Phase 1) or local filesystem (simpler but doesn't scale). STACK.md mentions AWS Mumbai but doesn't specify S3 setup timing.
   - Recommendation: Use S3 with pre-signed upload URLs. If Phase 1 doesn't set up S3, defer pet photo to a Phase 3.5 or implement with local filesystem + migration path.

2. **Exact species and breed list**
   - What we know: D-02 says companion animals (dogs, cats, birds, rabbits, fish, reptiles). D-03 says no livestock.
   - What's unclear: How many breeds per species? Should breeds be seeded from a standard veterinary list? Should the breed list be a database table (editable) or a static constant?
   - Recommendation: Start with a static TypeScript constant in `@breeyo/shared/constants/species.ts`. Top 30-50 breeds per dog/cat, 10-20 for other species. Custom entry always allowed (D-02). Migrate to database table if clinics request custom breeds.

3. **Wait time calculation accuracy**
   - What we know: D-19 says "average consultation time from last 7 days."
   - What's unclear: How to calculate when there's no historical data (new clinic, first week). What counts as "consultation time" -- WAITING->IN_CONSULT->DONE duration?
   - Recommendation: Default to 15 minutes per consultation when fewer than 5 data points exist. Consultation time = `completedAt - calledAt` for DONE entries only (not NO_SHOW).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | API server, mobile dev | Yes | v24.13.1 | -- |
| npm | Package management | Yes | 11.8.0 | -- |
| Docker | Local PostgreSQL + Redis | Yes | 28.3.2 | -- |
| Docker Compose | Multi-container dev env | Yes | v2.38.2 | -- |
| Git | Version control | Yes | 2.50.1 | -- |
| PostgreSQL | Primary database | No (not running locally) | -- | Docker: `postgres:16-alpine` |
| Redis | Socket.IO adapter, caching | No (not running locally) | -- | Docker: `redis:7-alpine` |
| pnpm | Monorepo package manager | No | -- | npm (available) or install pnpm |

**Missing dependencies with no fallback:**
- None -- all missing services are containerized via Docker

**Missing dependencies with fallback:**
- PostgreSQL: Run via Docker Compose (standard dev setup from Phase 1)
- Redis: Run via Docker Compose (standard dev setup from Phase 1)
- pnpm: STACK.md mentions Turborepo which typically uses pnpm. If Phase 1 uses npm, continue with npm. Install pnpm if needed: `npm install -g pnpm`

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (latest, TypeScript-native) |
| Config file | `vitest.config.ts` (expected from Phase 1 setup) |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PAT-01 | Register owner with mobile as primary ID | unit + integration | `npx vitest run apps/api/src/modules/patient/__tests__/patient.service.test.ts -t "register owner"` | Wave 0 |
| PAT-02 | Register pet linked to owner | unit | `npx vitest run apps/api/src/modules/patient/__tests__/patient.service.test.ts -t "register pet"` | Wave 0 |
| PAT-03 | Link multiple pets to one owner | unit | `npx vitest run apps/api/src/modules/patient/__tests__/patient.service.test.ts -t "multiple pets"` | Wave 0 |
| PAT-04 | Search by owner name, mobile, pet name | integration | `npx vitest run apps/api/src/modules/patient/__tests__/patient.repository.test.ts -t "search"` | Wave 0 |
| PAT-05 | View pet profile with visit history | unit | `npx vitest run apps/api/src/modules/patient/__tests__/patient.service.test.ts -t "pet profile"` | Wave 0 |
| QUE-01 | Check in walk-in in 2 taps | unit + integration | `npx vitest run apps/api/src/modules/queue/__tests__/queue.service.test.ts -t "check in"` | Wave 0 |
| QUE-02 | Real-time queue across devices | integration | `npx vitest run apps/api/src/modules/queue/__tests__/queue.socket.test.ts -t "broadcast"` | Wave 0 |
| QUE-03 | Queue position + estimated wait | unit | `npx vitest run apps/api/src/modules/queue/__tests__/queue.service.test.ts -t "position"` | Wave 0 |
| QUE-04 | Update queue status | unit | `npx vitest run apps/api/src/modules/queue/__tests__/queue.state-machine.test.ts` | Wave 0 |
| QUE-05 | Call next patient | unit | `npx vitest run apps/api/src/modules/queue/__tests__/queue.service.test.ts -t "call next"` | Wave 0 |
| QUE-06 | Returning patient auto-fill | unit | `npx vitest run apps/api/src/modules/patient/__tests__/patient.service.test.ts -t "lookup by mobile"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose` (affected module tests)
- **Per wave merge:** `npx vitest run` (full suite)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `apps/api/src/modules/patient/__tests__/patient.service.test.ts` -- covers PAT-01, PAT-02, PAT-03, PAT-05, QUE-06
- [ ] `apps/api/src/modules/patient/__tests__/patient.repository.test.ts` -- covers PAT-04 (search with pg_trgm)
- [ ] `apps/api/src/modules/queue/__tests__/queue.service.test.ts` -- covers QUE-01, QUE-03, QUE-05
- [ ] `apps/api/src/modules/queue/__tests__/queue.state-machine.test.ts` -- covers QUE-04
- [ ] `apps/api/src/modules/queue/__tests__/queue.socket.test.ts` -- covers QUE-02 (Socket.IO broadcast integration)
- [ ] `packages/shared/src/schemas/__tests__/patient.schema.test.ts` -- zod schema validation tests
- [ ] `packages/shared/src/schemas/__tests__/queue.schema.test.ts` -- zod schema validation tests
- [ ] Test helpers: Prisma test client factory with in-memory/test DB, Socket.IO test server mock

## Sources

### Primary (HIGH confidence)
- npm registry -- verified versions: prisma 7.7.0, socket.io 4.8.3, @tanstack/react-query 5.99.2, zustand 5.0.12, zod 4.3.6, fastify 5.8.5, fastify-socket.io 5.1.0, @socket.io/redis-adapter 8.3.0, @shopify/flash-list 2.3.1, expo-haptics 55.0.14
- [Prisma 7 upgrade guide](https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7) -- breaking changes, driver adapters, ESM migration
- [Prisma Client Extensions for RLS](https://github.com/prisma/prisma-client-extensions/tree/main/row-level-security) -- official RLS pattern
- [Socket.IO Redis adapter docs](https://socket.io/docs/v4/redis-adapter/) -- room broadcasting, pub/sub configuration
- [Socket.IO React integration guide](https://socket.io/how-to/use-with-react) -- connection management, event handling patterns
- [TanStack Query optimistic updates docs](https://tanstack.com/query/v4/docs/react/guides/optimistic-updates) -- onMutate/onError/onSettled pattern
- [PostgreSQL pg_trgm documentation](https://www.postgresql.org/docs/current/pgtrgm.html) -- trigram matching, GIN index
- [Expo Haptics documentation](https://docs.expo.dev/versions/latest/sdk/haptics/) -- notification, impact, selection feedback types

### Secondary (MEDIUM confidence)
- [Fastify Socket.IO integration](https://www.npmjs.com/package/fastify-socket.io) -- plugin registration, decorator pattern (last updated 2024)
- [Advanced TanStack Query with WebSocket integration](https://leapcell.io/blog/advanced-data-fetching-with-tanstack-query-optimistic-updates-pagination-and-websocket-integration) -- cache invalidation on socket events
- [React Native Socket.IO guide](https://reactnativeexpert.com/blog/building-real-time-features-in-react-native-a-socket-io-guide/) -- reconnection patterns, offline queuing
- [Indian mobile number validation](https://medium.com/@abhishekmailservices/validating-indian-phone-numbers-using-regular-expressions-regex-db4670bbc5d5) -- regex pattern verification
- [FlashList vs FlatList comparison](https://www.pkgpulse.com/blog/flashlist-vs-flatlist-vs-legendlist-react-native-lists-2026) -- performance thresholds, cell recycling
- [Securing Multi-Tenant Applications with RLS + Prisma](https://medium.com/@francolabuschagne90/securing-multi-tenant-applications-using-row-level-security-in-postgresql-with-prisma-orm-4237f4d4bd35) -- practical RLS implementation
- [Fuzzy Search with PostgreSQL Trigrams](https://medium.com/@vinodjagwani/fuzzy-search-with-postgresql-trigrams-smarter-matching-beyond-like-bce2bd3c4548) -- GIN vs GiST, performance benchmarks

### Tertiary (LOW confidence)
- [Pet Care Data Model (Vertabelo)](https://vertabelo.com/blog/a-pet-care-data-model/) -- general schema inspiration; adapted for Breeyo-specific needs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all versions verified against npm registry; Prisma 7 upgrade path documented by official sources
- Architecture: HIGH -- patterns are well-established (Socket.IO rooms, React Query + WebSocket, Prisma RLS extensions); multiple sources confirm
- Pitfalls: HIGH -- pitfalls identified from official docs (RLS raw query bypass, Socket.IO room reconnection) and known PostgreSQL patterns (timezone, trigram locale)
- Search implementation: MEDIUM -- pg_trgm pattern is proven but Prisma 7 + TypedSQL combination for raw queries needs validation during implementation
- Prisma 7 RLS extension compatibility: MEDIUM -- Client Extensions API is stable but the exact interaction with Prisma 7's driver adapter architecture should be validated in Phase 1

**Research date:** 2026-04-19
**Valid until:** 2026-05-19 (stable stack; Prisma 7 is the only fast-moving component)
