---
phase: 09-web-dashboard-owner-portal
plan: 07
subsystem: owner-portal-care-dates
tags: [fastify, prisma, nextjs, react, vitest, TDD, owner-portal, preventive-care]
dependency_graph:
  requires: [09-05, 09-06]
  provides: [owner-portal-care-dates-api, owner-portal-care-dates-ui]
  affects: []
tech_stack:
  added: []
  patterns:
    - "reused AccessScopeService.isPetInScope for the third owner-portal service in a row (records/invoices/care-dates) -- no second scope-derivation path was invented"
    - "reused the existing Phase 4 VaccinationRepository read methods (getVaccinationRecords, getLatestDeworming) unmodified, doing the nextDueDate filter/sort/status-classify in the new service rather than adding query variants to the Phase 4 repository"
    - "OwnerSummaryCard stays mounted (instead of returning null) whenever careDates is supplied, even with $0 due and no recent visit -- D-49's rich-medical-preview posture"
key_files:
  created:
    - apps/api/src/modules/owner-portal/portal-care-dates.service.ts
    - apps/api/src/modules/owner-portal/care-dates.controller.ts
    - apps/api/src/modules/owner-portal/__tests__/portal-care-dates.service.test.ts (13 tests)
    - apps/web/src/features/owner-portal/components/UpcomingCareCard.tsx
    - apps/web/src/features/owner-portal/components/UpcomingCareCard.module.css
    - apps/web/src/features/owner-portal/hooks/usePortalCareDates.ts
    - apps/web/src/features/owner-portal/__tests__/upcoming-care.test.tsx (10 tests)
  modified:
    - apps/api/src/modules/owner-portal/owner-portal.routes.ts (registered GET /owner-portal/:token/care-dates behind the existing requirePortalScope preHandler)
    - apps/web/src/features/owner-portal/components/OwnerSummaryCard.tsx (added optional careDates prop, renders UpcomingCareCard, no-longer-null-only-if-no-careDates-either)
    - "apps/web/app/portal/[token]/PortalBody.tsx (not in the plan's files_modified list -- see Deviations; needed to actually mount usePortalCareDates and pass its result into OwnerSummaryCard on the live Overview tab)"
metrics:
  duration: ~2 hours
  completed: 2026-08-21
  tasks_completed: 2
  tasks_total: 2
---

# Phase 09 Plan 07: Owner Portal Upcoming Care Dates Summary

Added OWN-07: upcoming vaccination due dates, deworming due date, and next scheduled appointment per pet, surfaced on the owner portal Overview tab. Both tasks' exact `<verify>` commands pass (13 API tests, then 10 web tests — 23/23 total). `pnpm --filter @breeyo/web build` succeeds. This is the last plan in Phase 9; the full owner-portal suite (API unit + web + real-DB integration) was re-run at the end and is reported below.

## What Was Built

### Task 1: care-dates API service, controller, and route (TDD)

`PortalCareDatesService` (`apps/api/src/modules/owner-portal/portal-care-dates.service.ts`) exposes `getCareDates(scope, petId, now = new Date())`, returning `{ vaccinations, deworming, nextAppointment }`. It:
- Re-checks `AccessScopeService.isPetInScope(scope, petId)` before touching any data, returning `null` for an out-of-scope petId (never querying vaccination/deworming/appointment tables at all) — the same pattern `PortalRecordsService`/`PortalInvoicesService` use, and the same 403-style `{ state: 'INVALID' }` envelope `care-dates.controller.ts` sends for a `null` result.
- Reads vaccinations via the existing, unmodified `VaccinationRepository.getVaccinationRecords(clinicId, petId)`, then filters out null-`nextDueDate` rows, sorts ascending, and classifies each as `overdue` / `dueSoon` (within 7 days) / `upcoming` in the service layer — no new repository method was added to the Phase 4 module.
- Reads the deworming due date via the existing `VaccinationRepository.getLatestDeworming`, returning `null` when there is no record or its `nextDueDate` is null.
- Reads the next appointment directly via `TenantPrismaClient.appointment.findFirst`, filtered to `status: 'SCHEDULED'`, `scheduledFor: { gt: now }`, `pets: { some: { petId } }`, ordered by `scheduledFor` ascending, projecting `reason` from `serviceCatalog.name` (fallback `'Visit'`) and `staffName` from `vet.fullName`.

`care-dates.controller.ts` mirrors `records.controller.ts`/`invoices.controller.ts` exactly: reads `request.portalScope`/`request.portalDb` (set by the shared `requirePortalScope` preHandler), validates `petId` with the same `z.object({ petId: z.string().uuid() })` shape, and returns `{ data: result }` or the `INVALID` envelope. `owner-portal.routes.ts` registers `GET /owner-portal/:token/care-dates` behind `requirePortalScope`, alongside session/records/invoices.

13 tests in `portal-care-dates.service.test.ts` cover scope enforcement (out-of-scope petId never queries anything), overdue/dueSoon/upcoming classification (including a mixed overdue+upcoming case and a null-`nextDueDate` exclusion case), deworming presence/absence/null-date, and next-appointment presence/absence/no-service-catalog fallback.

### Task 2: UpcomingCareCard + OwnerSummaryCard integration (TDD)

`UpcomingCareCard` renders three always-present sections (Vaccinations, Deworming, Next appointment), each showing a reassuring empty-state line ("No vaccinations due right now.", "No deworming due right now.", "No upcoming appointment scheduled.") rather than a blank gap when there's no data. Overdue/due-soon vaccinations and the deworming entry get a small status badge (`data-testid="vaccination-status-{overdue|dueSoon}"` / `"deworming-status-{...}"`); `upcoming` renders no badge. A small, D-77-scoped vaccine-name glossary (Rabies → "Annual booster", DHPP/DHPPi/DAPP → "Core booster", Lepto → "Booster", FVRCP → "Core booster (cats)") pairs a plain-language note under recognized vaccine names, matching `portal-records.service.ts`'s own unmatched-terms-get-no-gloss convention. Dates are formatted in `Asia/Kolkata` (matching the existing `AppointmentDrawer.tsx`/`AppointmentBlock.tsx`/`WeekGrid.tsx` convention) as e.g. "15 Aug 2026, 10:30 AM" for the appointment, "20 Sept 2026" for due dates.

`usePortalCareDates(token, petId)` fetches `GET /api/v1/owner-portal/:token/care-dates?petId=:petId` and re-fetches on token/petId change.

`OwnerSummaryCard` gained an optional `careDates` prop; when supplied it renders `UpcomingCareCard` below the existing due/recent-visit sections, and — this is a behavior change from 09-06 — the card no longer returns `null` when there's no due balance and no recent visit, as long as `careDates` was supplied, so a pet with upcoming vaccinations but $0 due still gets the card (D-49's "rich medical preview" posture).

`apps/web/app/portal/[token]/PortalBody.tsx` was modified (not listed in the plan's `files_modified`) to call `usePortalCareDates` and pass its result into `OwnerSummaryCard` — without this the hook and card would exist but never actually render on the live Overview tab.

10 tests in `upcoming-care.test.tsx` cover vaccine name/date rendering, overdue/due-soon badge presence, empty states for all three sections, appointment date/reason/staff-name rendering, and `OwnerSummaryCard` mounting `UpcomingCareCard` (including the "no due, no recent visit, but has careDates" case).

## Deviations From the Plan (flagged, not silently worked around)

1. **The plan's `Appointment` interface description does not match the real Phase 8 schema.** The plan's `<interfaces>` section states `Appointment` has `petId`, `staffId`, `scheduledAt`, and an `AppointmentStatus` including `CONFIRMED`/`EXPECTED`/`ARRIVED`/`IN_CONSULT`. The actual `apps/api/prisma/schema.prisma` model has none of these:
   - No `petId` column — pets attach through the `AppointmentPet` join table (`pets: { some: { petId } }`), because one appointment can cover multiple pets (D-21).
   - No `staffId` — the vet relation is `vetId`, and the display name is `vet.fullName` (via relation `vet`), not a `staffName` column.
   - No `scheduledAt` — the column is `scheduledFor`.
   - No `reasonCode`/`reasonLabel` — there is no such column at all. `notes` is a free-text field never surfaced to the owner portal; `reason` is instead projected from `serviceCatalog.name` (fallback `'Visit'`), the same fallback the existing web-dashboard schedule UI (`apps/web/app/schedule/AppointmentBlock.tsx`, `AppointmentDrawer.tsx`) already uses.
   - `AppointmentStatus` is only `SCHEDULED | CHECKED_IN | COMPLETED | CANCELLED | NO_SHOW` — there is no `CONFIRMED` or `EXPECTED` value anywhere in the schema.
   - **Implementation choice:** "next scheduled appointment" is modelled as status `SCHEDULED` with `scheduledFor` in the future. `CHECKED_IN` was deliberately excluded — it means the pet has already arrived at the clinic (a current visit, not a future one).

2. **Color usage for overdue/due-soon deviates from the plan's task text, but follows `09-UI-SPEC.md`'s own documented color contract.** The plan's Task 2 action text asks for destructive red (`#BA1A1A`) for overdue and warning accent (`#E65100`) for due-soon. `09-UI-SPEC.md`'s "Color" section explicitly reserves destructive red for "invoice voids, refunds, access removal/deactivation, invalid-link states, and irreversible stock-change confirmations" and explicitly lists "overdue invoice badges" and "urgent exception chips" under the warning/tertiary accent instead. Implemented per the UI-SPEC: both `overdue` and `dueSoon` use the tertiary/warning token (`--color-tertiary`, `#E65100`) — `overdue` filled, `dueSoon` outlined, `upcoming` renders no badge at all.

3. **`usePortalCareDates` is a plain `useState`/`useEffect` + `apiClient` hook, not React Query.** The plan's action text asks for "React Query, using the same React Query configuration patterns as `usePortalSession`" — but `usePortalSession.ts` itself is not built on React Query, and neither `apps/web/package.json` nor the workspace root has a `@tanstack/react-query`/`react-query` dependency anywhere. `usePortalCareDates` follows the actual established convention: the same shape as `usePortalSession` and `PortalBody.tsx`'s own inline `usePetRecords`/`usePetInvoices` hooks.

4. **`apps/web/app/portal/[token]/PortalBody.tsx` was modified even though it is not in the plan's `files_modified` list.** The plan lists only `UpcomingCareCard.tsx`, `OwnerSummaryCard.tsx`, `usePortalCareDates.ts`, and the test file as touched — but `OwnerSummaryCard` is a purely presentational component with no data-fetching of its own (matching its 09-06 design), so without also wiring `usePortalCareDates` into `PortalBody.tsx` (the component that actually renders `OwnerSummaryCard` on the real `/portal/[token]` route) the new card would be fully built and tested but never appear on any real page, failing the plan's own success criteria ("Pet owners see upcoming vaccination due dates ... on the portal Overview tab"). This mirrors 09-06's own precedent of the same file being created outside its plan's `files_modified` list for an equivalent reason (see `09-06-SUMMARY.md`).

None of these deviations required a schema migration, a new shared-package type, or a second scope-derivation path — all three services (`PortalRecordsService`, `PortalInvoicesService`, `PortalCareDatesService`) call the exact same `AccessScopeService.isPetInScope`.

## Verification

### Task 1 verify
```
npx vitest run apps/api/src/modules/owner-portal/__tests__/portal-care-dates.service.test.ts
```
`Test Files 1 passed (1)` / `Tests 13 passed (13)`

### Task 2 verify
```
npx vitest run apps/web/src/features/owner-portal/__tests__/upcoming-care.test.tsx
```
`Test Files 1 passed (1)` / `Tests 10 passed (10)`

### Web production build
```
pnpm --filter @breeyo/web build
```
Succeeded (`✓ Compiled successfully`, all 11 routes generated, `/portal/[token]` still a dynamic route). A pre-existing, unrelated `tsc` error in `invoice-flow.test.tsx` (a tuple-index type error from 09-06, reproducible on `main` before this plan's changes) does not block `next build`, which does not typecheck test files.

### Full owner-portal suite (end-of-phase re-run)
```
npx vitest run apps/api/src/modules/owner-portal apps/web/src/features/owner-portal packages/validators/src/__tests__/owner-portal.test.ts
```
`Test Files 12 passed (12)` / `Tests 125 passed (125)` — 8 API service test files (68 tests, including this plan's new 13), `packages/validators/src/__tests__/owner-portal.test.ts` (23 tests), and 4 web component test files (44 tests, including this plan's new 10).

```
cd apps/api && npx vitest run tests/owner-portal/
```
`Test Files 1 passed (1)` / `Tests 3 passed (3)` — the real-Postgres+Redis `reissue-route.test.ts` integration test from the 6bb1fa7 review-fix commit.

**Grand total: 128/128 tests passing** across the full owner-portal surface (Phase 9 Plans 05, 06, and 07 combined).
