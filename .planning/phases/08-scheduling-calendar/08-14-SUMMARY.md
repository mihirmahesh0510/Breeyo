---
phase: 08-scheduling-calendar
plan: "14"
subsystem: web
tags: [nextjs, react, css-grid, socket.io, scheduling, week-grid, calendar]

requires:
  - phase: 08-scheduling-calendar (plan 08-06)
    provides: "apiClient/ApiClientError token option, AuthProvider useAuth() shape, handleUnauthorized helper, useRequireAuth guard hook"
  - phase: 08-scheduling-calendar (plan 08-11)
    provides: "15 scheduling HTTP endpoints and their response envelopes, including affectedAppointmentCount on write endpoints"
  - phase: 08-scheduling-calendar (plan 08-12)
    provides: "BookAppointmentSheet.tsx's exact 8-step booking flow and useSchedule.ts/useScheduleSocket.ts mobile hook shapes, ported to web"
provides:
  - "apps/web's first real screen: the 7-day/30-minute week grid at /schedule"
  - "apps/web's first Socket.IO client (useScheduleSocket.ts)"
  - "apps/web's first data layer (useSchedule.ts, plain hooks, no React Query)"
  - "week-grid.ts: pure buildWeekRange/computeRowBounds/placeAppointments geometry, unit-tested"
  - "AppointmentDrawer.tsx and BookAppointmentDrawer.tsx: web's first drawers, the booking drawer matching mobile's 8-step flow"
  - "NotificationOptInStrip.tsx: foreground-only browser Notification opt-in, no service worker, no VAPID"
  - "apps/web/package.json real vitest test suite (was 'echo no web tests yet')"
affects: [08-15]

tech-stack:
  added: ["vitest@^2.1.0 (apps/web devDependency only)"]
  patterns:
    - "Plain useState/useEffect/AbortController data hooks instead of React Query for a single screen -- see key-decisions"
    - "Vet-hue CSS custom properties read via local index math instead of importing @breeyo/ui (which barrels in react-native-paper)"
    - "Component-local one-off fetch hooks (owner lookup, service catalog) for concerns with no dedicated web feature yet, instead of growing new lib files this plan didn't declare"

key-files:
  created:
    - apps/web/src/lib/week-grid.ts
    - apps/web/src/lib/useSchedule.ts
    - apps/web/src/lib/useScheduleSocket.ts
    - apps/web/src/lib/__tests__/week-grid.test.ts
    - apps/web/app/schedule/page.tsx
    - apps/web/app/schedule/WeekGrid.tsx
    - apps/web/app/schedule/WeekGridHeader.tsx
    - apps/web/app/schedule/AppointmentBlock.tsx
    - apps/web/app/schedule/VetLegend.tsx
    - apps/web/app/schedule/AppointmentDrawer.tsx
    - apps/web/app/schedule/BookAppointmentDrawer.tsx
    - apps/web/app/schedule/NotificationOptInStrip.tsx
    - apps/web/app/schedule/schedule.module.css
    - apps/web/vitest.config.ts
  modified:
    - apps/web/package.json
    - pnpm-lock.yaml

key-decisions:
  - "Plain useState/useEffect/AbortController hooks instead of React Query for the web data layer -- see rationale below, Phase 9 owns the broader dashboard's data-layer decision"
  - "IST arithmetic duplicated minimally in week-grid.ts (istDateOnly/addDaysIST/weekdayIST/istDateKey/istMinutesOfDay, ~25 lines total) rather than importing apps/api/src/lib/ist-date.ts, which apps/web cannot reach across the app boundary"
  - "Vet hue read via --vet-hue-1..5 CSS custom properties and a locally reimplemented index-assignment function, not via importing @breeyo/ui's vetColorForId -- @breeyo/ui's package entrypoint barrels atoms/molecules/organisms together with theme, and those pull in react-native-paper and other React Native-only packages"
  - "Owner/pet lookup (GET /api/v1/owners/lookup) and the service catalog (GET /api/v1/billing/services) are fetched via small component-local hooks inside BookAppointmentDrawer.tsx rather than a new apps/web/src/lib file, since no web patient-module lib file exists yet and this plan's file list doesn't declare one"
  - "useScheduleSocket.ts (Task 1) gained an optional onAppointmentCancelled(appointmentId) callback in Task 3, carrying AppointmentService.cancelAppointment's broadcast payload, so AppointmentDrawer's 'cancelled elsewhere' notice can target the exact open record rather than reacting to any generic schedule change"

patterns-established:
  - "apps/web/app/schedule/* never imports from @breeyo/ui except the already-imported portal.css stylesheet -- every visual value is a var(--...) reference"
  - "CSS Grid absolute-overlay pattern for calendar geometry: background gridcell buttons provide keyboard-navigable structure, appointment blocks are absolutely positioned inside a relatively-positioned grid-track wrapper for sub-cell (side-by-side) placement"

requirements-completed: [SCH-01, SCH-03, SCH-04, SCH-05]

duration: ~1 session
completed: 2026-08-17
---

# Phase 08 Plan 14: Web Scheduling Calendar Summary

**Built `apps/web`'s first real screen -- a 7-day/30-minute week grid at `/schedule` with its own plain-hooks data layer, the app's first Socket.IO client, an appointment detail drawer, a booking drawer implementing the identical 8-step flow as mobile's `BookAppointmentSheet.tsx`, and a foreground-only browser-notification opt-in with zero service-worker/VAPID footprint.**

## Task Commits

1. **Task 1: web scheduling data layer + pure week-grid geometry (TDD)** -- `4f7dddd` (feat)
2. **Task 2: week grid, header, appointment blocks, vet legend, page shell** -- `5bc4285` (feat)
3. **Task 3: appointment drawer, booking drawer, notification opt-in strip** -- `b83bec1` (feat)

**Plan metadata:** (this commit) -- docs: add plan summary

## Which Tasks Completed Cleanly vs. Needed Deviation

- **Task 1 (TDD)**: completed cleanly, test-first. `week-grid.test.ts`'s 11 tests (covering all 10 declared behaviors) were written and confirmed RED (module didn't exist -- `vitest` failed to resolve `../week-grid`) before `week-grid.ts` was implemented. All 11 tests passed on the first implementation attempt. `useSchedule.ts` grew beyond the plan's literal 4-hook list (`useWeekSchedule`, `useResolvedAvailabilityWeek`, `useClinicVets`, `useOfferableSlots`, `createAppointment`) to also include `useRescheduleAppointment`, `useCancelAppointment` and `useUpdateAppointmentStatus` -- these are needed by Task 3's `AppointmentDrawer`, and adding them to a file Task 1 already declared (rather than inventing an undeclared file later) kept Task 3's own file list honest.
- **Task 2**: completed cleanly against every grep-based acceptance criterion, with one disclosed near-miss: `grep -c 'useRequireAuth' apps/web/app/schedule/page.tsx` returns `2` (the import line plus the call line), not the criterion's literal `1`. A named-hook import and its single call site each necessarily contain the substring "useRequireAuth"; getting to exactly 1 would require either not importing it by name (bad practice) or removing the call itself. Verified by direct line-order inspection that the real intent -- the guard call precedes every data hook -- holds: `useRequireAuth()` is called at line 27, before `useClinicVets()`/`useWeekSchedule()`/`useResolvedAvailabilityWeek()` at lines 38-40, and the function returns `null` at line 62 before any of that data is read.
- **Task 3**: completed cleanly against every grep-based acceptance criterion. One necessary, disclosed addition outside the task's declared file list: `apps/web/src/lib/useScheduleSocket.ts` (a Task 1 file) gained an optional second callback parameter so the "cancelled elsewhere" notice could target the specific open appointment (see `key-decisions`). One comment-wording fix was needed mid-task: an early draft of `NotificationOptInStrip.tsx`'s file-header comment used the literal word "VAPID" to explain what the component does *not* do, which tripped the plan's own grep gate (`grep -Ec 'serviceWorker|...|VAPID|...' apps/web/` must return `0`) -- reworded to describe the same constraint without the literal token, since the gate can't distinguish "uses VAPID" from "explicitly avoids VAPID" by string match alone.

## Why Plain Hooks, Not React Query (for Phase 9 to revisit deliberately)

`apps/web` has zero data-layer library today. This is exactly one screen, and Phase 9 (the broader web dashboard) is where a project-wide data-layer decision belongs -- introducing React Query here would pre-empt that choice for the sake of one screen's reads, and RESEARCH.md's own alternatives-considered section and the plan's acceptance criteria (`grep -Ec '@tanstack/react-query' apps/web/package.json` must return `0`) both treat it as out of scope. `useSchedule.ts` instead implements a shared `useAsyncResource<T>` primitive (`useState` + `useEffect` + `AbortController`, cancelling the in-flight request on unmount/dependency-change) exposing `{ data, isLoading, error, refetch }` -- the same public surface a React Query migration would later need to satisfy, so swapping the internals later is additive, not a rewrite of every call site. Every hook routes a `401 ApiClientError` through plan 08-06's `handleUnauthorized`, matching mobile's behavior of bouncing a revoked session to `/login` rather than rendering a stale or empty grid.

## IST Arithmetic Duplication (kept minimal, bounded)

`apps/web` cannot import from `apps/api` across the app boundary, so `week-grid.ts` duplicates five small primitives from `apps/api/src/lib/ist-date.ts`: `istDateOnly` (IST-midnight instant for a given date, via `toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })` plus `Date.UTC(y, m, d, -5, -30)`), `addDaysIST` (fixed 24h-increment arithmetic, safe because India has no DST), `weekdayIST`, `istDateKey`, and `istMinutesOfDay`. Total duplicated surface is ~25 lines with a comment pointing back at `apps/api/src/lib/ist-date.ts` as the reference -- not the whole module, and no date library (`date-fns`/`luxon`/`dayjs`/`moment`) was added to avoid it, per the plan's explicit constraint. `WeekGrid.tsx` and `WeekGridHeader.tsx` each also carry a local one-line `istDateKey` (matching the established codebase convention of small per-file IST helpers already used throughout `apps/mobile`'s scheduling feature, e.g. `BookAppointmentSheet.tsx` and `AppointmentQuickSheet.tsx` each define their own copy rather than sharing one).

## How Vet Hues Were Read on Web

Verified `packages/ui/src/index.ts` is `export * from './theme'; export * from './atoms'; export * from './molecules'; export * from './organisms';` -- a single barrel. Even though `vetColors.ts` itself is a pure, dependency-free module (no `react`/`react-native` import), importing anything from `@breeyo/ui` (including just `vetColorForId`) pulls in the same package entrypoint that also exports RN-only atoms/molecules/organisms backed by `react-native-paper` and `react-native-safe-area-context`. Since the hard constraint forbids any `@breeyo/ui` import in `apps/web/app/schedule/*.tsx` except the already-imported `portal.css` stylesheet, vet-hue assignment is instead:
- Read via the `--vet-hue-1` through `--vet-hue-5` CSS custom properties already in `portal.css`, wired through five CSS-module classes (`.vetHue0`..`.vetHue4` in `schedule.module.css`, each a one-line `background`/`border-color` rule referencing one `var(--vet-hue-N)`).
- Index-assigned by a small pure function (`vetHueClassName(vetId, sortedVetIds)` in `VetLegend.tsx`, reused by `AppointmentBlock.tsx`) that reimplements `vetColorForId`'s deterministic `id`-sort-then-modulo-5 logic locally (returns `null` for a solo-vet clinic, exactly matching D-23's "hidden entirely" rule) rather than importing it.

## The `PlacedBlock` Shape (`apps/web/src/lib/week-grid.ts`)

```ts
export interface PlacedBlock {
  appointment: AppointmentWithDetails;
  dayIndex: number;      // 0 = Monday .. 6 = Sunday
  rowIndex: number;      // clamped into [0, rowCount - 1]
  rowSpan: number;       // Math.max(1, Math.ceil(durationMinutes / 30))
  columnIndex: number;   // 0-based position within its overlap cluster, capped at 3 visible
  columnCount: number;   // visible columns in this cluster (<= 3)
  overflowCount: number; // > 0 only on the last visible block, when a cluster has > 3 members
}
```

`placeAppointments` clusters same-day appointments by transitive time overlap (a running "cluster end" sweep over appointments sorted by start time), caps each cluster at 3 visible blocks, and folds any remainder into `overflowCount` on the cluster's last visible block -- never a 4th rendered block.

## UI-SPEC Elements Built Without a New Dependency

None required escalation. Everything UI-SPEC asked for -- the CSS Grid week layout, inline SVG icons (repeat glyph, paw glyph, plus glyph), the drawer transitions, the status-badge container-pair replication, and the foreground notification -- was buildable with plain React, CSS Modules and the existing `portal.css` tokens. `apps/web/package.json`'s only new dependency is `vitest@^2.1.0` (a devDependency, matching the version already used across `apps/api`/`apps/mobile`); no calendar library, icon package, date library or data-layer library was added.

## Adaptations Beyond the Plan's Literal Text (disclosed, reasonable)

- **No web patient-registration path.** Mobile's `BookAppointmentSheet.tsx` offers inline "Register New Patient" navigation when an owner isn't found; `apps/web` has no patient module or route at all yet (only `/login` and now `/schedule` exist). `BookAppointmentDrawer.tsx`'s "owner not found" state instead reads "Register the patient from the mobile app, then look them up again here" -- functionally equivalent guidance within web's actual current scope, not a missing feature.
- **`Cancel All` has no `{n}` count.** UI-SPEC's copy table shows `Cancel All {n}`, but `AppointmentWithDetails` doesn't carry the series' total occurrence count, and mobile's own already-committed `AppointmentQuickSheet.tsx` makes the identical simplification (`LABEL_CANCEL_ALL = 'Cancel All'`, no number). The web drawer matches the mobile precedent rather than fabricating a count neither surface's data actually has.
- **`ServiceCatalog.durationMinutes`** is present in the Prisma schema (`apps/api/prisma/schema.prisma:680`, default 15) and in the real `GET /api/v1/billing/services` JSON response, but missing from the shared `ServiceCatalog` TypeScript type in `packages/types/src/billing.ts` -- a pre-existing gap, not introduced by this plan. `BookAppointmentDrawer.tsx` extends the type locally (`ServiceCatalog & { durationMinutes: number }`) rather than either fabricating a fallback value or leaving the `{n} min` label broken.

## Full Verification (run after all three tasks)

- `pnpm --filter @breeyo/web test`: **1 file, 11 tests, all passing** (exceeds the 10-test floor).
- `pnpm --filter @breeyo/web exec tsc --noEmit`: clean, exit 0.
- `pnpm --filter @breeyo/web build`: exit 0. Route list: `/`, `/_not-found`, `/login`, `/schedule` -- all three plan-required routes (`/login`, `/schedule`, `/`) present.
- `grep -rn 'dangerouslySetInnerHTML' apps/web/` (with `.next` build output cleared first): no matches.
- `grep -rn 'localStorage' apps/web/src apps/web/app`: no matches.
- `grep -Erc 'serviceWorker|navigator.serviceWorker|VAPID|applicationServerKey|pushManager' apps/web/`: no matches anywhere in `apps/web`.
- `test -f apps/web/public/sw.js` and `test -f apps/web/app/sw.ts`: both exit non-zero -- no service-worker file exists.
- `grep -Ec "from '@breeyo/ui'" apps/web/app/schedule/*.tsx`: `0` across every file in the directory.
- `grep -Ec '@tanstack/react-query|date-fns|luxon|dayjs|moment|fullcalendar|react-big-calendar|lucide|react-icons' apps/web/package.json`: `0`.
- `apps/web/package.json` diff: only `"test": "vitest run"` (was `echo 'no web tests yet'`) and `vitest: "^2.1.0"` added to devDependencies. No other dependency changed.

## User Setup Required

None -- no external service configuration required. `NEXT_PUBLIC_API_URL` follows the same convention plan 08-06 already established.

## Next Phase Readiness

- Plan 08-15's end-to-end human/browser checkpoint can now exercise the full staff flow: log in at `/login`, land on `/schedule`, see the week grid populate, book an appointment through the drawer, watch a second session's change sync in via Socket.IO, and confirm the notification opt-in and no-service-worker constraints hold under a real browser.
- Phase 9 (the broader web dashboard) inherits: the plain-hooks-vs-React-Query decision point (explicitly flagged above for deliberate revisit at that phase's larger scope), the CSS-Grid-plus-absolute-overlay layout pattern for calendar-shaped UI, and the "no `@breeyo/ui` import into web components, only `portal.css`" convention this plan established as the first real `apps/web` screen.
- No blockers. All three tasks' acceptance criteria pass; the two disclosed near-misses (the `useRequireAuth` grep count of 2 instead of 1, and `useScheduleSocket.ts` being touched again in Task 3) are both explained above and do not affect functional correctness.

---
*Phase: 08-scheduling-calendar*
*Completed: 2026-08-17*
