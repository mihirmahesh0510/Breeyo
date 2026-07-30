# Phase 3: Patient Registration & Walk-in Queue - Research Addendum

**Researched:** 2026-07-30
**Domain:** CSV bulk import, file upload on mobile, guided onboarding/first-use flow
**Confidence:** HIGH
**Addendum to:** 03-RESEARCH.md (2026-04-19)

## Summary

This addendum covers two requirements added during gap review that are not addressed by the original Phase 3 research: **PAT-06** (CSV bulk import of owners and pets) and **ONB-01** (guided first-use flow after clinic setup). Both features are self-contained additions that build on top of the existing patient registration service and walk-in queue infrastructure without modifying them.

PAT-06 requires a mobile-initiated CSV file pick (expo-document-picker), server-side parsing (papaparse on the Fastify API via @fastify/multipart), row-level validation using the existing zod schemas, and a structured error response that surfaces per-row failures. The import reuses `PatientService.registerOwner` and `PatientService.registerPet` from plan 03-02, wrapped in a database transaction for atomicity.

ONB-01 is a lightweight, task-based onboarding checklist -- not a tooltip tour or walkthrough overlay. It tracks completion of 3 milestone actions (register first patient, check in first patient, proceed to consultation) as a simple state object persisted to the database per clinic. The UI is a dismissible progress card on the queue screen that guides the vet through their first real workflow using the same screens and components already built in plans 03-02 through 03-06. No new libraries are needed for ONB-01.

**Primary recommendation for PAT-06:** Parse CSV server-side with papaparse (header mode + dynamicTyping off). Validate each row with the existing `ownerRegistrationSchema` and `petRegistrationSchema` from `@breeyo/shared`. Return a structured response with `{ imported: [...], errors: [{ row, field, message }] }`. Use `@fastify/multipart` for file upload handling and `expo-document-picker` for file selection on mobile.

**Primary recommendation for ONB-01:** Build a simple onboarding state record (`ClinicOnboarding` table or a JSONB column on the `Clinic` model) tracking step completion. Render a `<OnboardingCard>` on the QueueScreen that shows progress and deep-links to the relevant action. No third-party onboarding library needed -- the flow uses existing screens with contextual prompts.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PAT-06 | User can bulk-import owners and pets via CSV upload (name, mobile, pet name, species, breed) with validation errors surfaced per row | expo-document-picker for file selection on mobile; @fastify/multipart for server upload; papaparse for CSV parsing with header mode; zod row-level validation reusing existing schemas; structured error response format; duplicate mobile handling via upsert-or-skip |
| ONB-01 | New clinic sees a guided first-use flow after setup wizard: register first patient, check in, proceed to consultation -- with skip option | ClinicOnboarding state model (3-step checklist); OnboardingCard component on QueueScreen; deep-links to existing registration/check-in flows; skip/dismiss persisted to DB; extensible for Phase 6 invoicing step |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| CSV file selection | Browser/Client (mobile) | -- | expo-document-picker runs on device; user selects file from local storage |
| CSV file upload | API/Backend | -- | File sent as multipart/form-data to Fastify; server handles parsing and validation |
| CSV parsing + validation | API/Backend | -- | Server-side parsing ensures consistent validation regardless of client; papaparse runs on Node.js |
| Bulk import transaction | API/Backend | Database/Storage | Service orchestrates per-row validation + batch insert via Prisma transaction |
| Import error reporting | API/Backend | Browser/Client | API returns structured errors; mobile renders per-row error list |
| Onboarding state tracking | Database/Storage | API/Backend | ClinicOnboarding record persisted in PostgreSQL; API reads/writes completion state |
| Onboarding UI | Browser/Client (mobile) | -- | OnboardingCard component rendered on QueueScreen; uses existing navigation |
| Onboarding step completion detection | API/Backend | -- | After successful patient registration or check-in, API checks if this was the clinic's first and updates onboarding state |

---

## PAT-06: CSV Bulk Import Research

### Standard Stack (Addendum)

#### Core (new packages for PAT-06)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| papaparse | 5.5.4 | CSV parsing on server | Browser + Node.js compatible; header mode maps columns to named fields; auto-detects delimiters; per-row error reporting with row index; 10+ years maturity; 50M+ npm downloads [ASSUMED -- discovered via training data, verified exists on npm registry] |
| @types/papaparse | 5.5.2 | TypeScript types for papaparse | DefinitelyTyped; full type coverage for parse config, results, and errors [ASSUMED] |
| @fastify/multipart | 10.1.0 | Multipart file upload handling for Fastify | Official Fastify plugin; stream-based processing; configurable size limits; auto-cleanup of temp files [CITED: github.com/fastify/fastify-multipart] |
| expo-document-picker | 57.0.1 | File selection on mobile | Expo-managed; accesses system file picker; MIME type filtering; copies to cache directory for immediate read access [CITED: docs.expo.dev/versions/latest/sdk/document-picker/] |
| expo-file-system | 57.0.1 | Read picked file content on mobile | Expo-managed; reads file URI from document picker as string; needed to send file content to API [ASSUMED] |

#### Supporting (already in project from Phase 3 research)

| Library | Already In | Purpose for PAT-06 |
|---------|------------|---------------------|
| zod | Yes (4.3.6) | Row-level validation using existing `ownerRegistrationSchema` and `petRegistrationSchema` |
| @tanstack/react-query | Yes (5.x) | Mutation hook for import API call with progress/error state |
| Prisma | Yes (7.7.0) | Transaction-wrapped bulk insert with duplicate detection |

**Installation (API package):**
```bash
pnpm add papaparse @fastify/multipart
pnpm add -D @types/papaparse
```

**Installation (mobile app):**
```bash
npx expo install expo-document-picker expo-file-system
```

### CSV Import API Design

#### Endpoint

```
POST /api/v1/patients/import
Content-Type: multipart/form-data
```

**Request:** Single file field named `csv` containing the CSV file.

**Response (200 OK):**
```typescript
interface ImportResult {
  summary: {
    totalRows: number;
    imported: number;
    skipped: number;   // duplicates that already existed
    failed: number;    // validation errors
  };
  created: {
    owners: { id: string; mobile: string; name: string }[];
    pets: { id: string; name: string; ownerMobile: string }[];
  };
  errors: ImportRowError[];
}

interface ImportRowError {
  row: number;        // 1-indexed row number (excluding header)
  field: string;      // which column failed: 'name', 'mobile', 'pet_name', 'species', 'breed'
  value: string;      // the actual value that failed
  message: string;    // human-readable error: "Mobile must be 10 digits starting with 6-9"
}
```

**Error response (400):** Returned for structural CSV problems (no header, wrong delimiter, empty file).

```typescript
interface ImportStructuralError {
  error: 'INVALID_CSV';
  message: string;  // "CSV file is empty" | "Missing required column: mobile" | etc.
}
```

#### CSV Format

**Required columns (case-insensitive header matching):**

| Column | Maps To | Required | Validation |
|--------|---------|----------|------------|
| `name` | Owner name | Yes | Non-empty, max 100 chars |
| `mobile` | Owner mobile | Yes | 10-digit Indian mobile, starts 6-9 |
| `pet_name` | Pet name | Yes | Non-empty, max 100 chars |
| `species` | Pet species | Yes | One of: DOG, CAT, BIRD, RABBIT, FISH, REPTILE, OTHER (case-insensitive) |
| `breed` | Pet breed | No | Max 100 chars |

**Example CSV:**
```csv
name,mobile,pet_name,species,breed
Rajesh Kumar,9876543210,Buddy,DOG,Labrador
Priya Sharma,8765432109,Kitty,CAT,Persian
Priya Sharma,8765432109,Max,DOG,Indie
```

**Duplicate mobile handling:** If a row's mobile number matches an existing owner in this clinic, the pet is linked to the existing owner (not creating a duplicate). This matches D-06 (mobile as unique key). If the same mobile appears multiple times in the CSV itself, the first occurrence creates the owner and subsequent rows link pets to it.

### Parsing and Validation Strategy

**Server-side parsing (not client-side).** Reasons:
1. Consistent validation regardless of client platform (mobile, web dashboard later)
2. zod schemas and Prisma queries run on the server
3. Client only needs to pick and upload the file -- simpler mobile code
4. Server can enforce file size limits via @fastify/multipart

**Processing flow:**

```
1. Client picks CSV file via expo-document-picker
2. Client uploads file as multipart/form-data to /api/v1/patients/import
3. Server receives file via @fastify/multipart (max 2MB)
4. Server parses CSV with papaparse (header: true, skipEmptyLines: true)
5. Server validates header row -- checks for required columns
6. Server iterates rows:
   a. Normalize species to uppercase
   b. Normalize mobile (strip spaces/dashes)
   c. Validate with zod schemas -- collect errors per row
   d. Valid rows: group by mobile number for batch processing
7. Server wraps insertion in Prisma transaction:
   a. For each unique mobile: findOrCreate owner
   b. For each pet row: create pet linked to owner
8. Server returns ImportResult with summary, created entities, and row errors
```

**Why NOT streaming/chunked processing:** The target is solo vet clinics migrating from paper records or spreadsheets. Expected file sizes are 50-500 rows (one clinic's patient list). A 500-row CSV is roughly 25KB -- well under memory limits. Streaming adds complexity without benefit at this scale. If a clinic has 1000+ pets, they are not a solo vet and are outside Beta scope.

**File size limit:** 2MB via @fastify/multipart config. A 2MB CSV at ~50 bytes/row holds ~40,000 rows -- far beyond any reasonable import. This limit prevents abuse while being generous.

### Code Examples

#### Server: CSV Import Route and Controller

```typescript
// apps/api/src/modules/patient/patient.routes.ts (add to existing routes)
// Source: @fastify/multipart docs [CITED: github.com/fastify/fastify-multipart]

import { FastifyInstance } from 'fastify';

export async function patientImportRoutes(fastify: FastifyInstance) {
  fastify.post('/api/v1/patients/import', {
    preHandler: [fastify.authenticate, fastify.requireRole(['ADMIN', 'CLINICIAN', 'FRONT_DESK'])],
    config: {
      // Override default body parser for this route
    },
  }, async (request, reply) => {
    const file = await request.file();
    if (!file) {
      return reply.code(400).send({ error: 'INVALID_CSV', message: 'No file uploaded' });
    }

    // Validate MIME type
    const allowedTypes = ['text/csv', 'text/plain', 'application/vnd.ms-excel'];
    if (!allowedTypes.includes(file.mimetype)) {
      return reply.code(400).send({
        error: 'INVALID_CSV',
        message: 'File must be a CSV (text/csv)',
      });
    }

    const buffer = await file.toBuffer();
    const csvString = buffer.toString('utf-8');
    const clinicId = request.user.clinicId;

    const result = await patientService.importFromCSV(clinicId, csvString);
    return reply.send(result);
  });
}
```

#### Server: CSV Parsing and Validation Service

```typescript
// apps/api/src/modules/patient/patient-import.service.ts
// Source: papaparse docs [CITED: papaparse.com/docs]

import Papa from 'papaparse';
import { ownerRegistrationSchema, petRegistrationSchema } from '@breeyo/shared/schemas/patient.schema';
import type { ImportResult, ImportRowError } from '@breeyo/shared/types/patient.types';

const REQUIRED_HEADERS = ['name', 'mobile', 'pet_name', 'species'];
const SPECIES_MAP: Record<string, string> = {
  dog: 'DOG', cat: 'CAT', bird: 'BIRD', rabbit: 'RABBIT',
  fish: 'FISH', reptile: 'REPTILE', other: 'OTHER',
};

export class PatientImportService {
  constructor(
    private patientService: PatientService,
    private prisma: PrismaClient,
  ) {}

  async importFromCSV(clinicId: string, csvString: string): Promise<ImportResult> {
    // Step 1: Parse CSV
    const parsed = Papa.parse<Record<string, string>>(csvString, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim().toLowerCase(),
    });

    // Step 2: Validate structure
    if (parsed.data.length === 0) {
      throw new BadRequestError('CSV file is empty or contains only headers');
    }

    const headers = parsed.meta.fields ?? [];
    const missingHeaders = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
    if (missingHeaders.length > 0) {
      throw new BadRequestError(
        `Missing required column(s): ${missingHeaders.join(', ')}`
      );
    }

    // Step 3: Validate each row
    const errors: ImportRowError[] = [];
    const validRows: ValidatedImportRow[] = [];

    for (let i = 0; i < parsed.data.length; i++) {
      const row = parsed.data[i];
      const rowNum = i + 1; // 1-indexed for user display

      // Add papaparse-level errors for this row
      const parseErrors = parsed.errors.filter((e) => e.row === i);
      for (const pe of parseErrors) {
        errors.push({
          row: rowNum,
          field: '',
          value: '',
          message: pe.message,
        });
      }

      // Normalize species
      const speciesNormalized = SPECIES_MAP[row.species?.trim().toLowerCase()] ?? row.species;

      // Validate owner fields
      const ownerResult = ownerRegistrationSchema.safeParse({
        mobile: row.mobile?.replace(/[\s\-]/g, ''),
        name: row.name?.trim(),
      });

      if (!ownerResult.success) {
        for (const issue of ownerResult.error.issues) {
          errors.push({
            row: rowNum,
            field: issue.path[0] as string,
            value: row[issue.path[0] as string] ?? '',
            message: issue.message,
          });
        }
        continue; // Skip this row entirely if owner validation fails
      }

      // Validate pet fields
      const petResult = petRegistrationSchema.safeParse({
        name: row.pet_name?.trim(),
        species: speciesNormalized,
        breed: row.breed?.trim() || undefined,
      });

      if (!petResult.success) {
        for (const issue of petResult.error.issues) {
          errors.push({
            row: rowNum,
            field: issue.path[0] === 'name' ? 'pet_name' : (issue.path[0] as string),
            value: row[issue.path[0] === 'name' ? 'pet_name' : (issue.path[0] as string)] ?? '',
            message: issue.message,
          });
        }
        continue;
      }

      validRows.push({
        rowNum,
        owner: ownerResult.data,
        pet: petResult.data,
      });
    }

    // Step 4: Batch insert in transaction
    const created = await this.batchInsert(clinicId, validRows);

    return {
      summary: {
        totalRows: parsed.data.length,
        imported: created.pets.length,
        skipped: created.skippedOwners,
        failed: errors.length > 0 ? parsed.data.length - validRows.length : 0,
      },
      created: {
        owners: created.owners,
        pets: created.pets,
      },
      errors,
    };
  }

  private async batchInsert(clinicId: string, rows: ValidatedImportRow[]) {
    return this.prisma.$transaction(async (tx) => {
      const ownerCache = new Map<string, string>(); // mobile -> ownerId
      const createdOwners: { id: string; mobile: string; name: string }[] = [];
      const createdPets: { id: string; name: string; ownerMobile: string }[] = [];
      let skippedOwners = 0;

      for (const row of rows) {
        // Find or create owner
        let ownerId = ownerCache.get(row.owner.mobile);

        if (!ownerId) {
          const existing = await tx.owner.findUnique({
            where: { clinicId_mobile: { clinicId, mobile: row.owner.mobile } },
          });

          if (existing) {
            ownerId = existing.id;
            ownerCache.set(row.owner.mobile, ownerId);
            skippedOwners++;
          } else {
            const newOwner = await tx.owner.create({
              data: { clinicId, mobile: row.owner.mobile, name: row.owner.name },
            });
            ownerId = newOwner.id;
            ownerCache.set(row.owner.mobile, ownerId);
            createdOwners.push({
              id: newOwner.id,
              mobile: newOwner.mobile,
              name: newOwner.name,
            });
          }
        }

        // Create pet
        const pet = await tx.pet.create({
          data: {
            clinicId,
            ownerId,
            name: row.pet.name,
            species: row.pet.species as Species,
            breed: row.pet.breed,
          },
        });

        createdPets.push({
          id: pet.id,
          name: pet.name,
          ownerMobile: row.owner.mobile,
        });
      }

      return { owners: createdOwners, pets: createdPets, skippedOwners };
    });
  }
}
```

#### Mobile: File Picker and Upload

```typescript
// apps/mobile/src/features/patient/hooks/useCSVImport.ts
// Source: expo-document-picker docs [CITED: docs.expo.dev/versions/latest/sdk/document-picker/]

import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useMutation } from '@tanstack/react-query';
import type { ImportResult } from '@breeyo/shared/types/patient.types';

export function useCSVImport(clinicId: string) {
  const mutation = useMutation<ImportResult, Error, void>({
    mutationFn: async () => {
      // Step 1: Pick CSV file
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'text/plain'],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets?.[0]) {
        throw new Error('File selection cancelled');
      }

      const file = result.assets[0];

      // Step 2: Create FormData and upload
      const formData = new FormData();
      formData.append('csv', {
        uri: file.uri,
        type: file.mimeType ?? 'text/csv',
        name: file.name ?? 'import.csv',
      } as any);

      // Step 3: Upload to API
      const response = await fetch(`${API_URL}/api/v1/patients/import`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          // Do NOT set Content-Type -- fetch sets it with boundary for FormData
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message ?? 'Import failed');
      }

      return response.json();
    },
  });

  return mutation;
}
```

#### Mobile: Import Results Screen Component

```typescript
// apps/mobile/src/features/patient/components/ImportResultCard.tsx
// Pattern: Show summary + expandable error list

interface ImportResultCardProps {
  result: ImportResult;
  onDismiss: () => void;
}

// Summary card shows:
// - "Imported 45 pets for 32 owners"
// - "3 rows skipped (owners already exist)"
// - "2 rows failed" (expandable to show per-row errors)
//
// Error list renders each ImportRowError as:
//   Row 7: mobile - "Mobile must be 10 digits starting with 6-9" (value: "12345")
//   Row 12: species - "Invalid species" (value: "hamster")
```

### CSV Import Architecture Diagram

```
Mobile Device                    API Server                     Database
--------------                   ----------                     --------

[expo-document-picker]           [@fastify/multipart]           [PostgreSQL]
  User picks CSV file    --->    Receives multipart upload
                                      |
                                 [papaparse]
                                 Parse CSV to rows
                                      |
                                 [Header validation]
                                 Check required columns
                                      |
                                 [zod validation] <--- reuses existing
                                 Validate each row         schemas from
                                 Collect per-row errors    @breeyo/shared
                                      |
                                 [PatientImportService]
                                 For each valid row:
                                   findOrCreate Owner --> [Prisma $transaction]
                                   create Pet          --> [Owner + Pet tables]
                                      |
                                 Return ImportResult
  <--- Render summary + errors       |
       ImportResultCard              |
```

---

## ONB-01: Guided First-Use Flow Research

### Design Approach

**Task-based checklist, NOT a tooltip tour.** [ASSUMED -- based on SaaS onboarding best practices research]

The ONB-01 requirement describes a guided flow where the vet performs real actions (register patient, check in, proceed to consultation) -- not a passive walkthrough of UI features. This maps to the "activation checklist" pattern common in SaaS products, not a product tour library.

**Why no third-party onboarding library is needed:**
- Tooltip tour libraries (react-native-walkthrough-tooltip, react-native-product-tour) highlight UI elements with overlays. ONB-01 needs the user to actually perform actions on real screens.
- The "first patient" is a real patient, not a demo -- the vet is learning by doing their actual work.
- The skip option means each step is independently dismissable -- a simple state flag per step.
- The total onboarding is 3 steps in Phase 3 (expanding to 4 in Phase 6). A library is overkill.

**Onboarding UX pattern:** A persistent, dismissible card at the top of the QueueScreen that shows a 3-step checklist with progress. Each step has a call-to-action button that navigates to the relevant screen. Steps auto-complete when the user performs the action through any path (not just from the onboarding card). The card disappears permanently when all steps are done or the user taps "Skip setup guide."

### Onboarding State Model

```typescript
// packages/shared/src/types/onboarding.types.ts

export interface ClinicOnboarding {
  clinicId: string;
  steps: {
    registerFirstPatient: StepState;
    checkInFirstPatient: StepState;
    startFirstConsultation: StepState;
    // Phase 6 will add: generateFirstInvoice
  };
  dismissed: boolean;      // true if user tapped "Skip setup guide"
  completedAt: string | null; // ISO timestamp when all steps done
  createdAt: string;
  updatedAt: string;
}

export interface StepState {
  completed: boolean;
  completedAt: string | null; // ISO timestamp
}
```

**Storage option A (recommended): JSONB column on Clinic model.**

```prisma
// Addition to existing Clinic model in schema.prisma
model Clinic {
  // ... existing fields
  onboardingState  Json?   // ClinicOnboarding steps + dismissed flag
}
```

This avoids a new table for a simple, single-record-per-clinic state object. The JSONB column stores the steps object. When null, the clinic has not started onboarding (triggers initialization). When `dismissed: true` or all steps completed, the onboarding card is hidden.

**Why not a separate table:** A separate `ClinicOnboarding` table would have exactly one row per clinic -- this is a classic case where a JSONB column is more appropriate than a 1:1 relation table. The data is always read and written together, never queried across clinics, and has no referential integrity needs beyond the clinic FK.

**Why not AsyncStorage/local-only:** The onboarding state must persist across devices and app reinstalls. If the vet sets up on one phone and switches to another, or if a staff member triggers some steps, the state must be consistent. Database storage is correct.

### Onboarding Completion Detection

**Passive detection via service hooks, NOT explicit "mark complete" calls.**

When existing services successfully perform the relevant action, they check if this was the clinic's first and update the onboarding state. This means onboarding steps complete automatically regardless of whether the user navigated from the onboarding card or performed the action organically.

```typescript
// apps/api/src/modules/onboarding/onboarding.service.ts

export class OnboardingService {
  constructor(private prisma: PrismaClient) {}

  async getState(clinicId: string): Promise<ClinicOnboarding | null> {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { onboardingState: true },
    });
    return clinic?.onboardingState as ClinicOnboarding | null;
  }

  async markStepComplete(clinicId: string, step: keyof ClinicOnboarding['steps']) {
    const state = await this.getState(clinicId) ?? this.defaultState();

    if (state.steps[step].completed) return; // Already done

    state.steps[step] = {
      completed: true,
      completedAt: new Date().toISOString(),
    };

    // Check if all steps are complete
    const allDone = Object.values(state.steps).every((s) => s.completed);
    if (allDone) {
      state.completedAt = new Date().toISOString();
    }

    state.updatedAt = new Date().toISOString();

    await this.prisma.clinic.update({
      where: { id: clinicId },
      data: { onboardingState: state },
    });
  }

  async dismiss(clinicId: string) {
    const state = await this.getState(clinicId) ?? this.defaultState();
    state.dismissed = true;
    state.updatedAt = new Date().toISOString();

    await this.prisma.clinic.update({
      where: { id: clinicId },
      data: { onboardingState: state },
    });
  }

  private defaultState(): ClinicOnboarding {
    return {
      clinicId: '',
      steps: {
        registerFirstPatient: { completed: false, completedAt: null },
        checkInFirstPatient: { completed: false, completedAt: null },
        startFirstConsultation: { completed: false, completedAt: null },
      },
      dismissed: false,
      completedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
}
```

**Integration points with existing services:**

| Trigger | Existing Service | Hook |
|---------|-----------------|------|
| First patient registered | `PatientService.registerOwner()` (plan 03-02) | After successful owner creation, call `onboardingService.markStepComplete(clinicId, 'registerFirstPatient')` |
| First check-in | `QueueService.checkIn()` (plan 03-03) | After successful queue entry creation, call `onboardingService.markStepComplete(clinicId, 'checkInFirstPatient')` |
| First consultation started | `QueueService.updateStatus()` to IN_CONSULT (plan 03-03) | After successful status transition to IN_CONSULT, call `onboardingService.markStepComplete(clinicId, 'startFirstConsultation')` |

**Performance note:** The `markStepComplete` call reads onboarding state, checks if already done, and short-circuits if so. After the first few patients, the check is essentially a single SELECT + early return -- negligible overhead. No need for caching.

### Onboarding API Endpoint

```
GET /api/v1/clinics/:clinicId/onboarding
```

Returns the current `ClinicOnboarding` state. The mobile app fetches this on QueueScreen mount and caches it with React Query (stale time: 5 minutes -- onboarding state changes infrequently).

```
POST /api/v1/clinics/:clinicId/onboarding/dismiss
```

Sets `dismissed: true`. Returns 204 No Content.

### Mobile: OnboardingCard Component

```typescript
// apps/mobile/src/features/onboarding/components/OnboardingCard.tsx

// Visual structure:
// +-----------------------------------------------+
// | Getting Started                    [Skip] [X]  |
// |                                                |
// |  [checkmark] Register your first patient       |
// |  [circle-2]  Check in a patient      [Do it >] |
// |  [circle-3]  Start a consultation              |
// |                                                |
// |  [====-------] 1 of 3 complete                 |
// +-----------------------------------------------+

// Behaviors:
// - Completed steps show green checkmark, strike-through text
// - Current step (first incomplete) shows blue highlight + CTA button
// - Future steps show gray circle with number
// - "Skip" dismisses permanently (calls dismiss API)
// - "X" hides for current session only (Zustand ephemeral state)
// - CTA button navigates to relevant screen:
//   - "Register your first patient" -> RegisterPatientScreen
//   - "Check in a patient" -> opens CheckInSheet (FAB action)
//   - "Start a consultation" -> QueueScreen with Call Next highlighted
// - Progress bar shows fractional completion
// - Card uses Phase 2 Card component with surface variant
```

**Placement:** Top of QueueScreen, above the queue sections. Pushes queue content down. Uses `<Animated.View>` for smooth collapse when dismissed.

**Query hook:**
```typescript
// apps/mobile/src/features/onboarding/hooks/useOnboarding.ts

export function useOnboarding(clinicId: string) {
  return useQuery({
    queryKey: ['onboarding', clinicId],
    queryFn: () => api.get(`/api/v1/clinics/${clinicId}/onboarding`),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
```

**Visibility logic:**
```typescript
const { data: onboarding } = useOnboarding(clinicId);
const sessionDismissed = useQueueUIStore((s) => s.onboardingHiddenThisSession);

const showOnboarding = onboarding
  && !onboarding.dismissed
  && !onboarding.completedAt
  && !sessionDismissed;
```

### Extensibility for Phase 6

ONB-01 explicitly states "full onboarding path completes when Phase 6 adds invoicing." The design supports this:

1. The `steps` object in `ClinicOnboarding` is extensible -- Phase 6 adds `generateFirstInvoice: StepState` to the type.
2. A Prisma migration updates existing `onboardingState` JSONB to add the new step with `completed: false`.
3. The OnboardingCard renders from the steps object dynamically -- adding a step means adding to the data, not rewriting UI logic.
4. `completedAt` is recalculated: existing "completed" clinics remain completed (they were already onboarded); new clinics get the 4-step path.

---

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| papaparse | npm | 11+ yrs (2014) | ~8M/wk | github.com/mholt/PapaParse | [OK] | Approved |
| @types/papaparse | npm | 8+ yrs | ~1.5M/wk | github.com/DefinitelyTyped/DefinitelyTyped | [OK] | Approved |
| @fastify/multipart | npm | 5+ yrs (official Fastify org) | ~500K/wk | github.com/fastify/fastify-multipart | [OK] | Approved |
| expo-document-picker | npm | 7+ yrs (Expo managed) | ~200K/wk | github.com/expo/expo | [OK] | Approved |
| expo-file-system | npm | 7+ yrs (Expo managed) | ~400K/wk | github.com/expo/expo | [OK] | Approved |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*Note: slopcheck was installed and run with `--ecosystem npm` flag. All 5 packages verified clean.*

---

## Don't Hand-Roll (Addendum)

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSV parsing | Custom line-by-line split | papaparse with `header: true` | Handles quoted fields, embedded commas, newlines within quotes, BOM, encoding; per-row error objects with row index |
| Multipart file upload handling | Custom body parser | @fastify/multipart | Handles boundary detection, streaming, temp file cleanup, size limits; official Fastify plugin |
| Mobile file picker | Custom native module | expo-document-picker | System file picker UI; MIME filtering; copies to cache; cross-platform (iOS + Android) |
| CSV header normalization | Custom string matching | papaparse `transformHeader` callback | Case-insensitive, trim whitespace, handles BOM prefix on first column |
| Onboarding tooltip overlays | Third-party tour library | Simple checklist card | ONB-01 requires real action completion, not passive tooltip tours; checklist pattern is 50 lines of UI code vs. library dependency |
| Onboarding state persistence | AsyncStorage / local storage | PostgreSQL JSONB column on Clinic | Must sync across devices and survive reinstalls; single source of truth |

---

## Common Pitfalls (Addendum)

### Pitfall A1: CSV Encoding Issues with Indian Names
**What goes wrong:** Owner or pet names containing Devanagari (Hindi) script or special characters appear garbled after CSV import.
**Why it happens:** CSV files created in Excel on Windows may use Windows-1252 encoding, not UTF-8. papaparse assumes UTF-8 by default.
**How to avoid:** Read the file buffer and detect BOM. If no BOM, try UTF-8 first. If decoding produces replacement characters (U+FFFD), surface an error: "File may not be UTF-8 encoded. Please save as UTF-8 CSV." D-41 requires Unicode/Hindi support -- this is a real concern for Indian clinics.
**Warning signs:** Names display as "?????" or garbled characters after import.

### Pitfall A2: Duplicate Pets for Same Owner in Single CSV
**What goes wrong:** A CSV with the same owner mobile + same pet name on two rows creates duplicate pets.
**Why it happens:** The import loop creates a pet for every row -- it only deduplicates owners (by mobile), not pets.
**How to avoid:** After grouping by mobile, also check for duplicate `(ownerId, petName, species)` tuples within the import batch. If found, skip the duplicate pet and add a "skipped" entry to the result. Note: this is within-import dedup only; cross-import dedup (pet already exists in DB) is a different concern and should be flagged as a warning, not a hard error (the vet may be adding a second pet with the same name, which is rare but possible -- "Buddy 1" and "Buddy 2").
**Warning signs:** Same pet name appears twice under one owner after import.

### Pitfall A3: Large File Upload Timeout on Mobile
**What goes wrong:** Uploading a large CSV (500+ rows) on a slow Indian mobile network times out or appears to hang with no feedback.
**Why it happens:** The default React Native fetch timeout may be too short for 3G/4G uploads. No progress indicator during upload.
**How to avoid:** Set a generous timeout (30 seconds for 2MB max file). Show an indeterminate progress indicator during upload. The mutation's `isPending` state drives a loading spinner. If the file is > 500 rows, consider adding a "Processing..." state after upload but before result. For Beta with 20 clinics, a simple spinner is sufficient -- progress bars for upload are overkill.
**Warning signs:** "Network request failed" errors on slow connections; user taps import multiple times.

### Pitfall A4: Onboarding State Race Condition
**What goes wrong:** Two staff members both register the clinic's first patient simultaneously. Both `markStepComplete` calls try to update the onboarding state.
**Why it happens:** Read-then-write pattern on the JSONB column without locking.
**How to avoid:** Use `UPDATE ... SET onboardingState = jsonb_set(...)` or wrap in a serializable transaction. In practice, this is a near-impossible race condition -- it only triggers on the literal first patient of a new clinic, and Breeyo targets solo vets. Document it but do not over-engineer the solution. A simple `findUnique` + `update` is sufficient; worst case, both writes succeed with the same result (idempotent).
**Warning signs:** None in production; theoretical concern only.

### Pitfall A5: Onboarding Card Blocks Queue View on Small Screens
**What goes wrong:** The onboarding card takes up too much vertical space on small Android phones, pushing the queue content below the fold.
**Why it happens:** 5.5-inch screens at standard DPI have limited viewport. A 3-step checklist card with progress bar can be 160-200px tall.
**How to avoid:** Use a compact layout: single-line steps, inline progress indicator, max height of 120px. On screens < 640px tall, collapse to a single-line "Getting Started (1/3)" banner that expands on tap. The "X" button hides it for the session so the vet can access the queue immediately.
**Warning signs:** Queue content not visible without scrolling when onboarding card is shown.

---

## Integration Points with Existing Phase 3 Plans

### PAT-06 Integration

| Existing Plan | What PAT-06 Reuses | New Code Needed |
|---------------|---------------------|-----------------|
| 03-01 (Prisma schema + shared types) | Owner model, Pet model, Species enum, zod schemas | Add `ImportResult` and `ImportRowError` types to shared package |
| 03-02 (Patient API service) | `PatientService.registerOwner`, `PatientService.registerPet`, `PatientRepository` | New `PatientImportService` class calling existing repository methods within transaction |
| 03-04 (Patient mobile screens) | Patients tab, PatientListScreen | Add "Import" button to PatientListScreen header; new ImportScreen or bottom sheet |
| 03-06 (Navigation) | Tab shell, Patients tab routing | Add import route: `apps/mobile/app/(app)/patients/import.tsx` |

**New files for PAT-06:**
- `apps/api/src/modules/patient/patient-import.service.ts` -- CSV parsing + validation + batch insert
- `apps/api/src/modules/patient/patient-import.routes.ts` -- Fastify route for `/api/v1/patients/import`
- `apps/api/src/modules/patient/__tests__/patient-import.service.test.ts` -- Unit tests
- `apps/mobile/src/features/patient/hooks/useCSVImport.ts` -- Mutation hook
- `apps/mobile/src/features/patient/screens/ImportScreen.tsx` -- File picker + results UI
- `apps/mobile/src/features/patient/components/ImportResultCard.tsx` -- Result summary component
- `packages/shared/src/types/import.types.ts` -- ImportResult, ImportRowError types
- `packages/shared/src/schemas/import.schema.ts` -- CSV row validation schema (wraps existing schemas)

### ONB-01 Integration

| Existing Plan | What ONB-01 Reuses | New Code Needed |
|---------------|---------------------|-----------------|
| 03-01 (Prisma schema) | Clinic model | Add `onboardingState Json?` column via migration |
| 03-02 (Patient service) | `PatientService.registerOwner` | Add onboarding hook: after owner creation, call `markStepComplete` |
| 03-03 (Queue service) | `QueueService.checkIn`, `QueueService.updateStatus` | Add onboarding hooks: after check-in and after IN_CONSULT transition |
| 03-05 (Queue mobile screen) | QueueScreen, QueueBoard | Add `<OnboardingCard>` above queue sections |
| 03-06 (Navigation) | Existing screen routes | OnboardingCard CTAs navigate to existing screens |

**New files for ONB-01:**
- `apps/api/src/modules/onboarding/onboarding.service.ts` -- State management service
- `apps/api/src/modules/onboarding/onboarding.routes.ts` -- GET state + POST dismiss endpoints
- `apps/api/src/modules/onboarding/__tests__/onboarding.service.test.ts` -- Unit tests
- `apps/mobile/src/features/onboarding/components/OnboardingCard.tsx` -- Checklist card component
- `apps/mobile/src/features/onboarding/hooks/useOnboarding.ts` -- Query hook for onboarding state
- `packages/shared/src/types/onboarding.types.ts` -- ClinicOnboarding type
- `prisma/migrations/YYYYMMDDHHMMSS_add_onboarding_state/migration.sql` -- Add JSONB column

---

## Validation Architecture (Addendum)

### Phase Requirements to Test Map (PAT-06 + ONB-01)

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PAT-06a | CSV parsing with header row maps columns correctly | unit | `npx vitest run apps/api/src/modules/patient/__tests__/patient-import.service.test.ts -t "parse header"` | Wave 0 |
| PAT-06b | Invalid rows produce per-row errors with row number, field, message | unit | `npx vitest run apps/api/src/modules/patient/__tests__/patient-import.service.test.ts -t "row validation"` | Wave 0 |
| PAT-06c | Duplicate mobile numbers reuse existing owner (no duplicate) | unit | `npx vitest run apps/api/src/modules/patient/__tests__/patient-import.service.test.ts -t "duplicate owner"` | Wave 0 |
| PAT-06d | Valid CSV imports owners and pets in single transaction | integration | `npx vitest run apps/api/src/modules/patient/__tests__/patient-import.service.test.ts -t "batch insert"` | Wave 0 |
| PAT-06e | File upload endpoint accepts multipart/form-data with CSV | integration | `npx vitest run apps/api/src/modules/patient/__tests__/patient-import.routes.test.ts -t "upload"` | Wave 0 |
| PAT-06f | Structural errors (missing columns, empty file) return 400 | unit | `npx vitest run apps/api/src/modules/patient/__tests__/patient-import.service.test.ts -t "structural"` | Wave 0 |
| ONB-01a | New clinic gets default onboarding state (all steps incomplete) | unit | `npx vitest run apps/api/src/modules/onboarding/__tests__/onboarding.service.test.ts -t "default state"` | Wave 0 |
| ONB-01b | Step auto-completes after corresponding action | unit | `npx vitest run apps/api/src/modules/onboarding/__tests__/onboarding.service.test.ts -t "mark step"` | Wave 0 |
| ONB-01c | Dismiss sets dismissed flag permanently | unit | `npx vitest run apps/api/src/modules/onboarding/__tests__/onboarding.service.test.ts -t "dismiss"` | Wave 0 |
| ONB-01d | markStepComplete is idempotent | unit | `npx vitest run apps/api/src/modules/onboarding/__tests__/onboarding.service.test.ts -t "idempotent"` | Wave 0 |

### Wave 0 Gaps (Addendum)
- [ ] `apps/api/src/modules/patient/__tests__/patient-import.service.test.ts` -- covers PAT-06a through PAT-06d, PAT-06f
- [ ] `apps/api/src/modules/patient/__tests__/patient-import.routes.test.ts` -- covers PAT-06e (multipart upload integration)
- [ ] `apps/api/src/modules/onboarding/__tests__/onboarding.service.test.ts` -- covers ONB-01a through ONB-01d

---

## Security Domain (Addendum)

### Applicable ASVS Categories for PAT-06 + ONB-01

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | Yes | zod schema validation on every CSV row; papaparse handles malformed CSV structure; @fastify/multipart enforces file size limit (2MB) |
| V4 Access Control | Yes | Import endpoint requires ADMIN, CLINICIAN, or FRONT_DESK role; RLS ensures imported data scoped to clinic |
| V12 File Upload | Yes | @fastify/multipart with file size limit; MIME type allowlist (text/csv, text/plain); no server-side file storage (parsed in memory, discarded) |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| CSV injection (formula injection) | Tampering | Strip leading `=`, `+`, `-`, `@` from cell values before processing; these are Excel formula prefixes that could execute if file is re-exported. For Breeyo, values are names and phone numbers -- sanitize by removing leading formula characters |
| Oversized file DoS | Denial of Service | @fastify/multipart `limits.fileSize: 2_000_000` (2MB); rejects before reading full file |
| Path traversal in filename | Tampering | Filename from upload is never used for file storage; file is parsed in memory and discarded |
| Malicious CSV content injection into DB | Tampering | All values pass through zod validation before Prisma parameterized queries; no raw string concatenation |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | papaparse is the standard CSV parser for Node.js/browser (discovered via training data, verified exists on npm but not via official docs/Context7) | Standard Stack | LOW -- papaparse is widely known; alternative csv-parse also viable but papaparse's header mode + per-row errors are a better fit for this use case |
| A2 | expo-document-picker supports `text/csv` MIME type filtering on Android | CSV Import API Design | MEDIUM -- if Android doesn't recognize text/csv, fallback to `*/*` with client-side extension check (.csv) |
| A3 | expo-file-system can read the file URI returned by document picker as a string | CSV Import API Design | LOW -- well-documented pattern in Expo ecosystem; copyToCacheDirectory: true ensures accessibility |
| A4 | 500-row CSV (~25KB) is the realistic upper bound for solo vet clinic migration | Parsing and Validation Strategy | LOW -- if wrong, the non-streaming approach still handles up to 40,000 rows (2MB limit) without issues |
| A5 | JSONB column on Clinic model is preferable to a separate ClinicOnboarding table for a single-record-per-clinic state | Onboarding State Model | LOW -- both approaches work; JSONB avoids a join and is simpler for read/write-together data |
| A6 | 3-5 step checklist with progress indicator achieves ~67% completion rate (SaaS industry benchmark) | ONB-01 Design Approach | LOW -- the metric is informational; implementation does not depend on it |
| A7 | FormData with file URI works correctly for multipart upload from React Native to Fastify | Mobile File Picker | MEDIUM -- this is a well-established React Native pattern but exact behavior may vary across Expo SDK versions; needs integration testing |

---

## Open Questions (Addendum)

1. **CSV template download**
   - What we know: PAT-06 specifies the CSV format (name, mobile, pet_name, species, breed).
   - What's unclear: Should the app provide a downloadable CSV template with headers and a sample row? Where would this be hosted -- static asset in the app bundle or API endpoint?
   - Recommendation: Include a "Download template" link on the import screen that opens a static CSV hosted at `/api/v1/patients/import/template`. Simple, avoids hardcoding a file into the mobile app bundle.

2. **Import permission level**
   - What we know: CONTEXT.md says same view/same actions for all roles (D-36) for queue operations.
   - What's unclear: Should FRONT_DESK role be allowed to bulk-import patients, or is this an ADMIN-only action? Import has higher risk than single registration (could create hundreds of bad records).
   - Recommendation: Allow ADMIN and CLINICIAN roles. FRONT_DESK can register patients one at a time but not bulk import. This limits blast radius of bad CSV imports.

3. **Import progress for large files**
   - What we know: Files are processed synchronously -- API returns result after full processing.
   - What's unclear: For a 500-row CSV on a slow server, the request might take 5-10 seconds. Should this be a background job with polling?
   - Recommendation: Keep synchronous for Beta. 500 rows with simple inserts should complete in 2-3 seconds on PostgreSQL. If timeout becomes an issue, move to BullMQ background job in a later phase.

4. **Onboarding for existing clinics after software update**
   - What we know: ONB-01 triggers after initial clinic setup (Phase 1).
   - What's unclear: If a clinic was set up before the onboarding feature was deployed, should they see the onboarding flow?
   - Recommendation: No. Only clinics created after the onboarding feature deployment get `onboardingState` initialized. Existing clinics with patients already have completed the activation milestones organically. Add a migration that sets `onboardingState = null` (skipped) for clinics that already have patients.

---

## Sources

### Primary (HIGH confidence)
- [Expo Document Picker documentation](https://docs.expo.dev/versions/latest/sdk/document-picker/) -- API, return types, MIME filtering, copyToCacheDirectory
- [@fastify/multipart GitHub README](https://github.com/fastify/fastify-multipart) -- Plugin registration, file handling, size limits, stream/buffer access
- [PapaParse documentation](https://www.papaparse.com/docs) -- Parse config, header mode, error format, transformHeader
- npm registry -- verified versions: papaparse 5.5.4, @types/papaparse 5.5.2, @fastify/multipart 10.1.0, expo-document-picker 57.0.1, expo-file-system 57.0.1

### Secondary (MEDIUM confidence)
- [SaaS Onboarding UX Patterns](https://www.saasui.design/blog/saas-onboarding-ux-examples) -- Checklist pattern, 3-5 steps max, progress indicators, skip option design
- [PapaParse TypeScript guide](https://www.xjavascript.com/blog/papaparse-typescript/) -- Generic type parameter usage, zod integration pattern for row validation
- [Working with CSV files with react-papaparse](https://blog.logrocket.com/working-csv-files-react-papaparse/) -- Browser-side parsing patterns (adapted for server-side use)

### Tertiary (LOW confidence)
- Training data: CSV injection (formula injection) security pattern -- common knowledge but not verified against a specific security standard in this session

## Metadata

**Confidence breakdown:**
- CSV import stack (papaparse + @fastify/multipart): HIGH -- mature packages verified on npm; well-documented APIs; straightforward integration with existing Fastify server
- CSV validation pattern (zod per-row): HIGH -- reuses existing schemas from 03-RESEARCH.md; papaparse error format is well-documented
- Mobile file upload (expo-document-picker + FormData): MEDIUM -- expo-document-picker is well-documented but the exact FormData upload pattern from React Native to Fastify needs integration testing
- Onboarding architecture: HIGH -- simple state machine over a JSONB column; no novel patterns; well-understood checklist UX
- Onboarding UX: MEDIUM -- design decisions (compact card, session dismiss, progress bar) are based on SaaS best practices research, not user testing with Indian vets

**Research date:** 2026-07-30
**Valid until:** 2026-08-30 (stable libraries; no fast-moving components)
