---
phase: 08-scheduling-calendar
plan: "13"
subsystem: mobile
tags: [scheduling, availability, mobile, expo, react-query, tdd]

requires:
  - phase: 08-scheduling-calendar (plan 08-02)
    provides: "scheduling i18n namespace, D-02 color/typography tokens"
  - phase: 08-scheduling-calendar (plan 08-11)
    provides: "The full /api/v1/scheduling/* HTTP surface, exact D-30 response envelopes on all three availability-write endpoints"
  - phase: 08-scheduling-calendar (plan 08-12)
    provides: "useClinicVets (useSchedule.ts), the /availability route target DayAgendaScreen's header button already navigates to"
provides:
  - "apps/mobile/src/features/scheduling/lib/availability-form.ts: the single HH:MM<->minutes bridge module (toTemplatePayload/fromTemplateResponse/toBlockedPeriodPayload/defaultAvailabilityForm)"
  - "apps/mobile/src/features/scheduling/hooks/useAvailability.ts: template/override/blocked-period hook family"
  - "AvailabilitySettingsScreen.tsx + apps/mobile/app/(app)/availability.tsx: the per-vet availability editing surface"
  - "BlockedPeriodSheet.tsx: the D-06 blocked-period add sheet"
  - "packages/ui/src/wireframes/scheduling/CalendarScreen.stories.ts: filled-in four-state day-agenda wireframe"
affects: [08-14, 08-15]

tech-stack:
  added: []
  patterns:
    - "A pure editor<->API-shape bridge module (availability-form.ts) re-derives its weekday index from the WEEKDAY_LABELS-sourced label on every conversion, never trusting a caller-supplied numeric field that might reflect a different display ordering -- the safe way to bridge two conventions that both use an integer weekday but disagree on which day is 0."
    - "A write-with-no-delete-operation (the weekly template) reverts via re-submitting the prior state (a resave), while a write-with-a-delete-operation (a blocked period) reverts via literally deleting what was just created -- both are 'save-then-inform' (the count is only known after the write applies), but the revert mechanism differs by what the API actually exposes."

key-files:
  created:
    - apps/mobile/src/features/scheduling/lib/availability-form.ts
    - apps/mobile/src/features/scheduling/lib/__tests__/availability-form.test.ts
    - apps/mobile/src/features/scheduling/hooks/useAvailability.ts
    - apps/mobile/src/features/scheduling/screens/AvailabilitySettingsScreen.tsx
    - apps/mobile/src/features/scheduling/components/BlockedPeriodSheet.tsx
    - apps/mobile/app/(app)/availability.tsx
  modified:
    - packages/ui/src/wireframes/scheduling/CalendarScreen.stories.ts

key-decisions:
  - "toTemplatePayload derives each row's weekday index from `weekdayIndexFromLabel(row.label)`, never from `row.weekday` directly -- proven by a dedicated test that hands it rows built in Monday-first ordinal order with a deliberately wrong `weekday` field, and asserts the output still comes out 0=Sunday-correct. This is the actual mechanism that makes the wizard/API convention clash safe to bridge."
  - "toBlockedPeriodPayload returns a discriminated `{ ok: true, payload } | { ok: false, error }` result rather than throwing (unlike toTemplatePayload, which throws), because BlockedPeriodSheet needs to render the failure inline without a try/catch around every keystroke; toTemplatePayload throws because the settings screen already wraps its call in a try/catch before firing the save mutation, matching the malformed-time case hhmmToMinutes itself throws for."
  - "No DELETE endpoint exists for availability overrides in the API's 15-endpoint surface (08-11-SUMMARY.md's table: only GET/PUT on `.../override`) -- the date-override D-01 warning's 'Go Back' path cannot literally delete the override the way the plan's action text assumed. Implemented instead as a re-upsert using the vet's normal weekly-template hours for that JS-Date weekday (`date.getDay()`, which is 0=Sunday and matches this codebase's WEEKDAY_LABELS convention exactly, so no extra conversion was needed), functionally reverting the day's behavior even though the override row for that date is not physically removed. Disclosed here since the plan's literal text says 'delete the override again.'"
  - "AvailabilitySettingsScreen distinguishes 'never configured' (empty state, `days === null`) from 'populated' (`days` holds 7 rows, whether freshly defaulted via the empty state's 'Set Weekly Hours' action or loaded from a saved template) using a `days` state variable that starts `null` and is only ever set once data resolves or the user opts in -- kept separate from `lastSavedDaysRef`, which tracks the last server-confirmed state independently so the D-30 revert always has the right pre-edit snapshot even after multiple saves in one session."
  - "BlockedPeriodSheet.tsx declares END_TIME_ERROR/REASON_REQUIRED_ERROR/OVERLAP_ERROR as named UI-SPEC-verbatim string constants rather than only ever handling `result.error` opaquely, mirroring AppointmentQuickSheet.tsx's already-established precedent (08-12) for the identical situation: a computed/derived error string at runtime must not hide the literal copy from a static read of the file."
  - "CalendarScreen.stories.ts follows CheckInFlow.stories.ts's self-contained stub-component-plus-stories convention (an inline function component, no separate component file), not QueueStatusBoard.stories.ts's reference-an-external-component convention -- the existing stub already used this shape, and the directory has exactly one scheduling stories file so there is no reuse pressure toward extracting a shared component."

patterns-established:
  - "useClinicVets is NOT redeclared here: checked first per the plan's same-wave note, found already present in useSchedule.ts (plan 08-12, committed before this plan started), and simply re-exported from useAvailability.ts (`export { useClinicVets, type ClinicVet } from './useSchedule'`) so callers of the availability hook family don't need a second import path. Exactly one declaration exists."

requirements-completed: [SCH-01]

duration: ~1 session
completed: 2026-08-17
---

# Phase 08 Plan 13: Per-Vet Availability Editing Surface Summary

**All three tasks completed cleanly against the plan's own acceptance criteria, including both D-30 additions (weekly-hours and blocked-period warnings). One factual correction, disclosed below: the date-override "Go Back" revert cannot literally delete the override (no such endpoint exists), so it re-upserts the day's normal template hours instead -- functionally equivalent, not a scope cut.**

## Which Tasks Completed Cleanly vs. Needed Deviation

- **Task 1 (TDD)**: completed cleanly. `availability-form.test.ts` was written first against not-yet-existing exports and confirmed RED (`Failed to load url ../availability-form` -- module not found) before `availability-form.ts` or `useAvailability.ts` existed. All 9 tests (7 plan-required behaviors + 2 extra: a label-derived-`WEEKDAY_LABELS` check and an explicit missing-weekday-defaults check) pass. One near-miss caught during acceptance-criteria verification, not a TDD violation: the file-header comment originally *mentioned* the forbidden `parseInt(t.split(':'))` pattern in prose to explain what the module avoids, which caused the `grep -Ec "split\(':'\)|parseInt"` acceptance check to false-positive at 1; reworded to describe the same constraint without using the literal banned substring, then reverified at 0.
- **Task 2**: completed cleanly against every listed grep-based acceptance criterion. Built alongside Task 3's `BlockedPeriodSheet.tsx` in the same working-tree pass (the screen imports it for the "Block Time" button), but committed separately, staging only Task 2's two declared files -- `BlockedPeriodSheet.tsx` existed on disk but uncommitted at Task 2's commit point, which is fine: `tsc --noEmit`/tests run against the working tree, not git's staged state, and both were green before either commit.
- **Task 3**: completed cleanly against every listed grep-based acceptance criterion. One disclosed, necessary technique (see key-decisions): the two UI-SPEC-verbatim inline error messages (`End time must be after start time.` / `Add a short reason.`) are produced at runtime by `availability-form.ts`'s pure function, so a purely pass-through rendering of `result.error` would never make the literal text appear in `BlockedPeriodSheet.tsx`'s own source for a static grep to find. Declared them as named local constants (`END_TIME_ERROR`, `REASON_REQUIRED_ERROR`) instead, matching `AppointmentQuickSheet.tsx`'s already-established precedent from plan 08-12 for the exact same problem shape.

## Task Commits

1. **Task 1: availability hooks + HH:MM<->minutes form-conversion module (TDD)** -- `0b58f80` (feat)
2. **Task 2: availability settings screen + `/availability` route** -- `5400c3c` (feat)
3. **Task 3: blocked-period sheet + CalendarScreen wireframe stories** -- `ac610b6` (feat)

**Plan metadata:** (this commit) -- docs: add plan summary

## Route Path -- Matches Plan 08-12's Expectation

`08-12-SUMMARY.md` recorded that `DayAgendaScreen`'s header `calendar-clock` button calls `router.push('/availability' as any)` and that this plan "must register a route at `/availability`."

Created `apps/mobile/app/(app)/availability.tsx` (a sibling stack entry next to `patient/register.tsx`, `owner/[ownerId].tsx`, etc.), a one-line-body route matching that file's shape:

```tsx
export default function AvailabilityRoute() {
  const { vetId } = useLocalSearchParams<{ vetId?: string }>();
  return <AvailabilitySettingsScreen vetId={vetId} />;
}
```

Expo Router's file-based routing resolves `apps/mobile/app/(app)/availability.tsx` to the path `/availability` **exactly** -- confirmed by direct comparison against the literal string plan 08-12 recorded. `_layout.tsx`'s `<Stack.Screen>` list was deliberately left unmodified (it is not in this plan's `files_modified`, and it is not required for the route to resolve): every other non-tab route under `(app)/` that is *not* explicitly listed there (`whatsapp/index.tsx`, `whatsapp/config.tsx`, `whatsapp/[threadId].tsx`, all four `billing/*` sub-routes besides `settings`) still works today, confirming Expo Router auto-registers any file-based route in the enclosing `<Stack>` regardless of whether it has a customized `<Stack.Screen>` entry -- the entry only supplies a custom header title, which `availability.tsx` simply does without (it gets Expo Router's default title behavior, same as those other undeclared routes).

## Save-Then-Inform Sequencing -- Both Flows, Side by Side

Both flows share the same shape: **the write always applies first; the affected-appointment count is read from the response; the confirmation dialog (if any) comes after.** Neither flow pre-checks and neither blocks the save on a "the count might go stale between two calls" race, because there is only ever one call.

| | Date override (D-01, pre-existing pattern) | Weekly template (D-30, new this plan) | Blocked period (D-30, new this plan) |
|---|---|---|---|
| Endpoint | `PUT .../override` | `PUT .../template` | `POST /blocked-periods` |
| Count field | `affectedAppointmentCount` | `affectedAppointmentCount` | `affectedAppointmentCount` |
| Dialog title | `{n} appointments already booked on {date}` | `{n} appointments already booked outside these new hours` | `{n} appointments already booked in this window` |
| Safe button | `Go Back` | `Go Back` | `Go Back` |
| Destructive/keep button | `Mark Day Off Anyway` | `Save Anyway` | `Block Time Anyway` |
| **Revert mechanism** | Re-upserts the override using the vet's normal weekly-template hours for that weekday (no DELETE endpoint exists -- see below) | **Re-saves** the pre-edit `AvailabilityDayForm[]` (captured in `lastSavedDaysRef` *before* the save that triggered the warning) via `useSaveAvailabilityTemplate` again -- a template has no delete-a-write operation, so "revert" means "write the old values back" | **Deletes** the just-created blocked period via `useDeleteBlockedPeriod(blockedPeriod.id)` -- a blocked period *does* have a real delete operation, so this is a literal undo, not a resave |
| Keep-the-write button's effect | Dismisses the dialog; the override write already happened | Dismisses the dialog; the template write already happened (`lastSavedDaysRef` advances to the new state) | Closes the sheet, shows the success toast; the blocked period stays |

**Disclosed deviation on the date-override revert**: the plan's action text says `Go Back` should "immediately delete the override again," but `08-11-SUMMARY.md`'s endpoint table (the full 15-endpoint scheduling surface) has no `DELETE .../override` route -- only `GET`/`PUT` on the template and override paths. Implemented the closest functional equivalent instead: re-upsert the override for that date using the vet's normal weekly-template hours for that JS weekday (`selectedDate.getDay()`, which is 0=Sunday -- the same convention this codebase's `WEEKDAY_LABELS` already uses, so no extra index conversion was needed). The day behaves normally again from the UI's perspective even though the override row for that specific date is not physically removed from the table.

## Hook Names and Query Keys

`useAvailability.ts`:
- `useAvailabilityTemplate(vetId)` -- `GET .../availability/:vetId/template`, key `['availability-template', activeClinicId, vetId]`.
- `useSaveAvailabilityTemplate()` -- `PUT` the same path; on `onSettled` (300ms delay, matching `useQueueActions.ts`'s flicker-race fix) invalidates both `['availability-template', activeClinicId, vetId]` and the `['schedule', activeClinicId]` prefix (changing hours changes offerable slots).
- `useSaveAvailabilityOverride()` -- `PUT .../override`, returns `{ override, affectedAppointmentCount }`; invalidates `['schedule', activeClinicId]` and `['blocked-periods', activeClinicId, vetId]`.
- `useBlockedPeriods(date, vetId)` -- `GET /blocked-periods?date=&vetId=`, key `['blocked-periods', activeClinicId, vetId, isoDate]`.
- `useCreateBlockedPeriod()` -- `POST /blocked-periods`, returns `{ blockedPeriod, affectedAppointmentCount }`; propagates `ApiClientError.code` unchanged for `BLOCKED_PERIOD_OVERLAP` handling.
- `useDeleteBlockedPeriod()` -- `DELETE /blocked-periods/:id`; also used as the D-30 blocked-period revert.
- `useClinicVets` / `ClinicVet` -- **re-exported** from `./useSchedule` (plan 08-12), not redeclared. Confirmed by direct inspection: `useSchedule.ts` already exported `useClinicVets` (key `['schedule', activeClinicId, 'vets']`) before this plan started, so this plan imports it rather than creating a second, competing declaration.

## Stories File -- Stub vs. Final Line Count

`packages/ui/src/wireframes/scheduling/CalendarScreen.stories.ts`: **43 lines (stub) -> 194 lines (final)**. Covers all four D-24 day-agenda states (`Empty`/`Loading`/`Populated`/`Error`), with `Populated` rendering a representative day: a Morning group (a normal appointment, a multi-pet appointment, a recurring appointment) and an Afternoon group (a blocked-period band, a cancelled appointment at 0.5 opacity, a normal appointment). Follows `CheckInFlow.stories.ts`'s self-contained stub-component-plus-stories convention (not `QueueStatusBoard.stories.ts`'s external-component-file convention), matching the existing stub's own shape.

## Verification

- `pnpm --filter @breeyo/mobile test -- --run src/features/scheduling`: **2 files, 19 tests, all passing** (9 `availability-form.test.ts` + 10 pre-existing `agenda-utils.test.ts`).
- `pnpm --filter @breeyo/mobile test` (full suite): **42 files passed, 713 tests passed, 0 failed** -- exact match against the pre-plan baseline of 41 files / 704 tests (704 + 9 new = 713). **No regression.**
- `pnpm --filter @breeyo/ui test`: **15 files, 186 tests, all passing** -- unchanged.
- `pnpm --filter @breeyo/mobile exec tsc --noEmit`: **61 errors**, identical count to the documented pre-plan baseline (`08-12-SUMMARY.md`), and a direct `grep` for `availability`/`AvailabilitySettings`/`BlockedPeriodSheet` across the full error output returns nothing -- **zero new errors from any file this plan created or modified.**

## D-30 Confirmation (Both New Warning Flows)

- **Weekly hours**: `grep -Ec 'appointments already booked outside these new hours|Save Anyway' AvailabilitySettingsScreen.tsx` = 3; `grep -c affectedAppointmentCount` = 2 (date-override flow + weekly-hours flow). Revert = re-save prior `AvailabilityDayForm[]`.
- **Blocked period**: `grep -Ec 'appointments already booked in this window|Block Time Anyway' BlockedPeriodSheet.tsx` = 2; `grep -c affectedAppointmentCount` = 3. Revert = delete the just-created blocked period.

## User Setup Required

None -- no external service configuration required.

## Next Phase Readiness

- Plans 08-14 (web) and 08-15 (end-to-end checkpoint) can rely on: the `/availability` route being live, the `availability-form.ts` conversion module being the single source of truth for HH:MM<->minutes bridging (importable by any future web equivalent needing the same logic, since it has zero React/React Native imports), and the `useAvailability.ts` hook family's query keys for cache interaction.
- Disclosed, out-of-scope-for-this-plan item: the API's availability-override endpoint has no DELETE operation. If a future plan wants a literal "clear this date's override" affordance (as opposed to this plan's "revert to normal hours" workaround), that requires adding a `DELETE .../override/:id`-shaped endpoint to `apps/api/src/modules/scheduling/`, which is outside this plan's file scope.
- No blockers for scheduling. Full mobile suite green (713/713, 42 files, zero regressions), `tsc --noEmit` unchanged at 61 pre-existing errors, `@breeyo/ui` suite green (186/186).

---
*Phase: 08-scheduling-calendar*
*Completed: 2026-08-17*
