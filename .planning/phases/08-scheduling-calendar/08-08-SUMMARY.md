---
phase: 08-scheduling-calendar
plan: "08"
subsystem: mobile
tags: [queue, mobile, expo, expected-status, optimistic-ui, tdd]

requires:
  - phase: 08-scheduling-calendar (plan 08-01)
    provides: "QueueStatus.EXPECTED, QUEUE_TRANSITIONS[EXPECTED] -> [WAITING, NO_SHOW], isValidTransition"
  - phase: 08-scheduling-calendar (plan 08-02)
    provides: "StatusBadge 'expected' variant (secondaryContainer/onSecondaryContainer)"
  - phase: 08-scheduling-calendar (plan 08-04)
    provides: "QueueBoard.expected field on the GET /api/v1/queue response, QueueEntry.queuePriorityAt/appointmentId"
provides:
  - "QueueCardItem EXPECTED treatment: expected StatusBadge variant, 'Expected {time}' line from queuePriorityAt, suppressed position/wait rail"
  - "QueueBoard four-group SectionList: Expected first, non-collapsible, omitted when empty"
  - "features/queue/lib/queue-board-utils.ts: buildQueueSections, isQueueBoardEmpty, getItemPositionInfo, getSectionHeaderProps, getNextStatus (RN-free, exported for testing)"
  - "features/queue/lib/queue-optimistic.ts: applyOptimisticStatusChange (RN-free, exported for testing)"
  - "ExpectedActionSheet: Check In Now / Mark No-show / View Appointment quick-action sheet"
  - "QueueBoard.onCardPress widened from (petId: string) to (item: QueueEntryWithPet)"
affects: [08-12]

tech-stack:
  added: []
  patterns:
    - "Pure decision logic for a queue-board/optimistic-cache feature lives in features/queue/lib/*.ts, never inline in the .tsx/.ts file that imports 'react-native' or 'expo-haptics' -- those imports fail to parse under vitest's node environment (no Metro/Babel transform, no react-test-renderer installed), confirmed empirically (see Deviations). Matches the pre-existing apps/mobile/src/lib/wizard-utils.ts and features/billing/lib/builder-state.ts convention."
    - "QueueBoard's onCardPress callback passes the full QueueEntryWithPet, not just petId, so the screen can branch on entry.status before deciding whether to navigate or open a sheet -- QueueScreen's pre-existing handleCardPress(petId, entryStatus?, consultationId?, queueEntryId?) is left untouched and wrapped by a new handleQueueCardPress that intercepts EXPECTED rows only."

key-files:
  created:
    - apps/mobile/src/features/queue/lib/queue-board-utils.ts
    - apps/mobile/src/features/queue/lib/queue-optimistic.ts
    - apps/mobile/src/features/queue/components/__tests__/QueueBoard.test.tsx
    - apps/mobile/src/features/queue/components/ExpectedActionSheet.tsx
  modified:
    - apps/mobile/src/features/queue/components/QueueCardItem.tsx
    - apps/mobile/src/features/queue/components/QueueBoard.tsx
    - apps/mobile/src/features/queue/hooks/useQueueActions.ts
    - apps/mobile/src/features/queue/screens/QueueScreen.tsx

key-decisions:
  - "TDD Task 2 restart: implementation was written before a failing test on the first pass (a process violation of this plan's own TDD requirement). Caught before committing -- both edited files were `git checkout`-reverted to their pre-Task-2 state, the test file was written first against not-yet-existing exports, confirmed failing (module-not-found), then the implementation was re-added and confirmed green. No implementation code reached a commit before its test existed."
  - "Extraction target is a new lib/*.ts file, not exports inside QueueBoard.tsx/useQueueActions.ts themselves. The plan's fallback text said to export buildQueueSections/applyOptimisticStatusChange from within those two files, but empirical testing proved that insufficient: importing QueueBoard.tsx or useQueueActions.ts at all -- regardless of what's exported from them -- throws `Expected 'from', got 'typeOf'` from Vite's SSR transform, because both files import 'react-native'/'expo-haptics' respectively, and vitest here runs a plain node environment with no Metro/Babel transform and no react-test-renderer installed (confirmed via git-stash bisection of individual imports). The only way to make this logic importable by a test is a wholly separate module with zero RN-touching imports -- exactly the existing wizard-utils.ts/builder-state.ts pattern. Two new files were created: queue-board-utils.ts and queue-optimistic.ts, both importing only from @breeyo/types."
  - "getNextStatus moved into queue-board-utils.ts (not left as a private function in QueueBoard.tsx) for the same importability reason, even though the plan didn't ask for it to move -- it's a small pure function with a direct behavioral connection to buildQueueSections/getItemPositionInfo, and keeping it in the RN-free module keeps the plan's own acceptance-criteria intent (no EXPECTED case) checkable without importing the .tsx."
  - "onCardPress widening in QueueBoard.tsx was done during Task 3, but this plan's frontmatter files_modified/Task-2 <files> block already listed QueueBoard.tsx once; Task 3's own <files> block did not repeat it even though Task 3's action text explicitly requires the change ('QueueBoard currently calls onCardPress?.(item.pet.id)... widen that callback'). Treated as a plan-authoring gap, not a scope violation: staged and committed alongside Task 3's other two files with the deviation called out in the commit message."

patterns-established:
  - "Section-building, position/estimated-wait suppression, section-header collapsibility, and getNextStatus's deliberate EXPECTED-omission are one shared RN-free module (queue-board-utils.ts) that QueueBoard.tsx imports from and unit tests exercise directly with plain objects -- no renderer, no react-test-renderer."
  - "The optimistic-cache rebuild for a 4-group (or N-group) React Query cache lives in its own RN-free module (queue-optimistic.ts), taking the full cache-shaped object and returning a new one; the hook file (useQueueActions.ts) becomes a one-line pass-through in onMutate."

requirements-completed: [SCH-02]

duration: ~2h
completed: 2026-08-17
---

# Phase 08 Plan 08: Expected Queue Entries on the Mobile Board Summary

**All three tasks complete: `QueueCardItem` gained the `EXPECTED` treatment (badge, `Expected {time}` line, suppressed position/wait), `QueueBoard` gained a first, non-collapsible `Expected` section and `useQueueActions`' optimistic rebuild now carries all four groups through instead of silently dropping `expected`, and a new `ExpectedActionSheet` (Check In Now / Mark No-show / View Appointment) opens on an EXPECTED row tap instead of navigating to patient detail. `getNextStatus` deliberately has no `EXPECTED` case. Full mobile suite: 40 files / 694 tests passing, zero regressions.**

## Session Context

Task 2 was TDD-marked. On the first pass I wrote the implementation (inline in `QueueBoard.tsx`/`useQueueActions.ts`) before a failing test existed — a violation of the plan's explicit "if you write implementation before a failing test, stop, delete it, restart test-first" instruction. Caught this myself before committing anything: reverted both files via `git checkout`, wrote the test file first (importing not-yet-existing exports), confirmed it failed, then re-implemented. During that restart, a second and more consequential discovery emerged: even a correctly-test-first extraction *inside* `QueueBoard.tsx`/`useQueueActions.ts` doesn't work in this repo, because merely importing either file (to reach the exported pure functions) pulls in `react-native`/`expo-haptics`, which fail to parse under vitest's plain `node` test environment. This is documented in detail under Deviations, since it changes where the plan's suggested extraction actually had to land.

## Performance

- **Tasks:** 3 completed. Task 1 and Task 3 clean on the first pass (only the pre-existing `onCardPress` file-scope gap noted above). Task 2 required a TDD restart and a lib-file-location correction (see Deviations).
- **Files created:** 4 (`queue-board-utils.ts`, `queue-optimistic.ts`, `QueueBoard.test.tsx`, `ExpectedActionSheet.tsx`). Files modified: 4 (`QueueCardItem.tsx`, `QueueBoard.tsx`, `useQueueActions.ts`, `QueueScreen.tsx`).

## Accomplishments

- **Task 1 — `QueueCardItem.tsx`:** `EXPECTED: 'expected'` added to `STATUS_TO_VARIANT` (type widened to include `'expected'`). Expected rows render `Expected {time}` (via the existing `formatTime` helper, no second formatter) behind a 16px `clock-outline` glyph in `#5D4037`, replacing the `Checked in {time}` line. Position number and estimated wait are suppressed for `EXPECTED` rows (the badge is the only thing on the trailing rail). `accessibilityLabel` appends `, expected at {time}` for expected rows. No other colours/spacing/`minHeight: 80` touched.
- **Task 2 — `QueueBoard.tsx` / `useQueueActions.ts`:** `Expected` is the first section pushed in `buildQueueSections` (guarded by `data.expected.length > 0`), non-collapsible (only `Done` is), count-labelled, omitted when empty. `isQueueBoardEmpty` now checks all four groups. `getItemPositionInfo` returns `undefined`/`undefined` for any non-`WAITING` section (Expected included). `applyOptimisticStatusChange` spreads and rebuilds all four groups (`expected`/`inConsult`/`waiting`/`done`) instead of the old three-key rebuild that silently dropped `expected` on every mutation. `getNextStatus` has no `EXPECTED` case (returns `null`, falls through to the existing fallback) — tapping an expected badge cannot silently check a patient in.
- **Task 3 — `ExpectedActionSheet.tsx` / `QueueScreen.tsx`:** New `BottomSheet`-based sheet with **Check In Now** (primary, calls `onCheckIn(entry.id)`), **Mark No-show** (outlined, `#BA1A1A` label, calls `onNoShow(entry.id)`), **View Appointment** (text button, disabled when `entry.appointmentId` is null, calls `onViewAppointment(entry.appointmentId)`). `QueueScreen` wires `handleExpectedCheckIn` (mutates to `WAITING`, shows the same `{pet} checked in — Position #{position}` toast Phase 3 uses), `handleExpectedNoShow` (same `Alert.alert` copy as the pre-existing no-show dialog), and `handleViewAppointment` (`router.push('/schedule?appointmentId=...' as any)`). `QueueBoard`'s `onCardPress` widened from `(petId: string)` to `(item: QueueEntryWithPet)`; `QueueScreen`'s new `handleQueueCardPress` wrapper intercepts `EXPECTED` rows to open the sheet and otherwise calls the untouched, pre-existing `handleCardPress(item.pet.id)` — every non-expected navigation path (`IN_CONSULT`, `DONE`, default) behaves exactly as before. Both the pre-existing long-press no-show dialog and the new expected-row no-show dialog now use **Keep in Queue** instead of a bare **Cancel** (UI-SPEC Open Item 7).
- 10 new tests in `QueueBoard.test.tsx` (9 required behaviors + 1 extra `isQueueBoardEmpty` true-case), all passing.
- Full mobile suite: **40 test files passed, 694 tests passed, 0 failed** — no regressions against the pre-plan baseline.
- `tsc --noEmit`: 61 errors, all pre-existing and unrelated to this plan's files (see Verification below) — down from the 62-error baseline recorded in `08-02-SUMMARY.md` because Task 2 incidentally fixed one of those 62 (`useQueueActions.ts`'s `Property 'expected' is missing in type 'QueueBoard'`, which existed only because `QueueBoard.expected` was added to the type in plan 08-01 before this plan updated the one hand-rolled rebuild that needed it).

## Task Commits

1. **Task 1: EXPECTED treatment on QueueCardItem** — `1771cbd` (feat)
2. **Task 2: Expected section + optimistic-rebuild fix** — `2b681b3` (feat)
3. **Task 3: ExpectedActionSheet + QueueScreen wiring + Keep in Queue fix** — `3e4890c` (feat)

**Plan metadata:** (this commit) — docs: add plan summary

## Testing Approach Taken (per plan's `<output>` instruction)

**Neither pure extraction-with-renderer nor extraction-within-the-existing-files — a third path.** The plan offered: (a) render through `@testing-library/react-native` if a working renderer setup exists, or (b) fall back to extracting `buildQueueSections`/`applyOptimisticStatusChange` as exports *from* `QueueBoard.tsx`/`useQueueActions.ts` themselves and unit-test those.

Checked (a) first: `@testing-library/react-native` and `react-test-renderer` are both declared in `pnpm-lock.yaml`, but `react-test-renderer` is not actually present in `node_modules` (peer-dependency-only), and `apps/mobile/vitest.config.ts` runs `environment: 'node'` with no Metro/Babel transform. Confirmed by directly importing `'react-native'` in a throwaway test file: it throws `Error: Expected 'from', got 'typeOf'` from Vite's SSR transform (a Flow-typed file inside the `react-native` package that plain esbuild/rollup can't parse). This exact wall is already documented in-repo (`billing/lib/builder-state.ts`'s file-header comment, and 06-14's prior resolution), so (a) is not available here, matching the plan's anticipation.

Attempted (b) next and found it insufficient: exporting the pure functions *from* `QueueBoard.tsx`/`useQueueActions.ts` doesn't help, because a test importing anything from those files — even just a named export — still executes their top-level `import 'react-native'`/`import 'expo-haptics'` and hits the identical parse error. Confirmed by bisection (importing `'react-native'` alone: fails; importing `'expo-haptics'` alone: fails; importing `@breeyo/types`/`@tanstack/react-query` alone: both fine).

**Path taken:** created two new RN-free modules — `apps/mobile/src/features/queue/lib/queue-board-utils.ts` (`buildQueueSections`, `isQueueBoardEmpty`, `getItemPositionInfo`, `getSectionHeaderProps`, `getNextStatus`) and `apps/mobile/src/features/queue/lib/queue-optimistic.ts` (`applyOptimisticStatusChange`) — each importing only from `@breeyo/types`. `QueueBoard.tsx` and `useQueueActions.ts` now import these functions rather than defining the logic inline. `QueueBoard.test.tsx` imports directly from the two `lib/*.ts` files, never from the `.tsx`/hook files, and exercises all 9 required behaviors (plus one extra) with plain `QueueEntryWithPet`/`QueueBoard` object fixtures — no renderer involved anywhere. This exactly mirrors the pre-existing `apps/mobile/src/lib/wizard-utils.ts` and `apps/mobile/src/features/billing/lib/builder-state.ts` convention already established in this codebase for the identical constraint.

## New Callback Signature (for plan 08-12)

```ts
// apps/mobile/src/features/queue/components/QueueBoard.tsx
interface QueueBoardProps {
  onCardPress?: (item: QueueEntryWithPet) => void;  // was: (petId: string) => void
  // ...unchanged: onStatusChange, onNoShow, onRefresh, refreshing, data, disabled
}
```

`QueueScreen.tsx` wires this via a new wrapper, `handleQueueCardPress(item: QueueEntryWithPet)`, which opens `ExpectedActionSheet` for `item.status === QueueStatus.EXPECTED` and otherwise calls the pre-existing, byte-for-byte-unchanged `handleCardPress(item.pet.id)` — the `IN_CONSULT`/`DONE`/default navigation branches inside `handleCardPress` are exercised identically to before this plan (their `entryStatus`/`consultationId`/`queueEntryId` parameters were already always `undefined` in practice prior to this plan too, since the old `QueueBoard` only ever called `onCardPress?.(item.pet.id)` with a single argument — this plan does not change that; `handleQueueCardPress` still only ever calls `handleCardPress(item.pet.id)` with one argument for the non-expected path).

## Route String for `View Appointment` (for plan 08-12)

```ts
router.push(`/schedule?appointmentId=${appointmentId}` as any);
```

Plain template-string path (the `as any` cast matches the existing convention used throughout `apps/mobile` for not-yet-registered/typed routes — see `PatientListScreen.tsx`, `InventoryListScreen.tsx`, etc.). Plan 08-12 must register a route at `/schedule` (or an `(app)/schedule` group matching this app's existing route-group convention) that reads an `appointmentId` query param. Disabled entirely (button never fires) when `entry.appointmentId` is null.

## Decisions Made

See `key-decisions` in frontmatter for the four consequential ones. Most relevant for downstream plans:
1. **`getNextStatus` has no `EXPECTED` case, confirmed with a passing test and a grep.** Tapping an expected row's badge does nothing; only `ExpectedActionSheet`'s explicit Check In Now / Mark No-show buttons can move an `EXPECTED` entry.
2. **Pure queue-board/optimistic-cache logic belongs in `features/queue/lib/*.ts`, not inside the `.tsx`/hook files that import `react-native`/`expo-haptics`.** Any future plan adding more board-decision logic (e.g., 08-12's web port, or a future queue feature) should add to `queue-board-utils.ts`/`queue-optimistic.ts` rather than reintroducing inline logic that becomes untestable again.
3. **`onCardPress` is now entry-shaped everywhere in this feature.** Any new consumer of `QueueBoard` should expect the full `QueueEntryWithPet`, not a bare id.

## Deviations from Plan

1. **TDD process violation, self-corrected before commit (Task 2):** implementation was written before a failing test. Both files were reverted with `git checkout`, the test was written and confirmed RED (module-not-found) first, then the implementation was reintroduced and confirmed GREEN. No implementation reached a commit ahead of its test.
2. **Extraction landed in two new `lib/*.ts` files, not as additional exports inside `QueueBoard.tsx`/`useQueueActions.ts`.** The plan's literal fallback text asked for `buildQueueSections`/`applyOptimisticStatusChange` to be exported *from* those two files. Empirically this does not work in this repo: importing either file at all (regardless of what's exported) throws a parse error at import time because both files import `react-native`/`expo-haptics`. The only way to satisfy "unit test the pure pieces with plain objects" was to move the logic to wholly separate RN-free modules — which is also, not coincidentally, exactly the pattern the plan's own text pointed to (`wizard-utils.ts`). Full detail under "Testing Approach Taken" above.
3. **Several plan acceptance-criteria greps that assume the inline (non-extracted) shape no longer match literally**, as a direct consequence of deviation 2:
   - `awk '/const sections = useMemo/,/\], \[/' QueueBoard.tsx | grep 'Expected|In Consult|...'` — the `useMemo` body is now a one-line call to `buildQueueSections`; the section titles live in `queue-board-utils.ts` instead. The *behavior* (Expected first) is confirmed by a passing test and by reading `buildQueueSections`.
   - `grep -c 'data.expected' QueueBoard.tsx` (expected ≥3) — now `0` in `QueueBoard.tsx` itself (the references moved to `queue-board-utils.ts`, which has exactly 3).
   - `awk '/onMutate/,/return { previous/' useQueueActions.ts | grep -c 'expected'` (expected ≥2) — now `0`; the rebuild moved to `queue-optimistic.ts`, which correctly references `expected` twice (the spread and the `newBoard` key).
   - `awk '/function getNextStatus/,/^}/' QueueBoard.tsx | grep -c 'EXPECTED'` (expected `0`) — this one still passes, but only because the function no longer exists in `QueueBoard.tsx` at all (it's imported from `queue-board-utils.ts`, which has the correctly-absent `EXPECTED` case).
   - `grep -c "status: 'WAITING'"` in `QueueScreen.tsx` (expected ≥1) — this file uses `status: QueueStatus.WAITING` (the enum member), matching this file's own pre-existing convention everywhere else (`QueueStatus.NO_SHOW`, `QueueStatus.IN_CONSULT`, etc.) rather than a raw string literal. Functionally identical (`QueueStatus.WAITING === 'WAITING'`); the literal-string grep just doesn't match a typed enum reference. Not changed to a magic string to satisfy the grep.
4. **`onCardPress` widening in `QueueBoard.tsx` was committed as part of Task 3**, even though this plan's frontmatter lists `QueueBoard.tsx` only under Task 2's `<files>` and Task 3's `<files>` lists only `ExpectedActionSheet.tsx`/`QueueScreen.tsx`. Task 3's own action text explicitly requires this exact change ("`QueueBoard` currently calls `onCardPress?.(item.pet.id)`... widen that callback to pass the whole entry"), so it was made and staged alongside Task 3's other two files rather than skipped — this is a one-line, low-risk signature widening reviewed as part of that commit, not an unrelated change slipped in.

None of these are behavioral gaps: every one of the 9 required behaviors (plus a 10th) has a passing test, `tsc --noEmit` shows zero new errors from any file this plan touched, and the full 694-test mobile suite passes with no regression.

## Issues Encountered

- See "TDD process violation" above — the only real process issue, caught and corrected before anything was committed.
- The pre-existing `apps/mobile` baseline of "62 pre-existing type errors" (documented in `08-02-SUMMARY.md`) is now 61: Task 2 fixed one of them (`useQueueActions.ts`'s `Property 'expected' is missing in type 'QueueBoard'`) as a direct, intended consequence of this plan's own fix, not a separate cleanup. The remaining 61 are unchanged and untouched by this plan (`NavigationBar.ts`, `NotificationList.ts`, `QueueCard.ts`, `WizardStepper.ts` inside `packages/ui`, plus a few unrelated `apps/mobile` files) — confirmed via `git stash` diff before/after each of this plan's three commits.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 08-12 (mobile scheduling/calendar UI) must register a route matching `/schedule?appointmentId=...` (a plain template-string path, `as any`-cast at the call site per this app's existing router.push convention) so `ExpectedActionSheet`'s **View Appointment** button resolves.
- Plan 08-12 (or any future consumer of `QueueBoard`) should use the widened `onCardPress?: (item: QueueEntryWithPet) => void` signature, not the old `(petId: string) => void`.
- Any future queue-board logic addition belongs in `features/queue/lib/queue-board-utils.ts` or `queue-optimistic.ts`, not inline in the `.tsx`/hook files — see Deviations #2 for why.
- No blockers. Full suite green (694/694 tests passing across 40 files, zero regressions), `tsc --noEmit` shows 61 pre-existing errors unrelated to this plan (down from 62, one fixed as a side effect of this plan's own optimistic-rebuild fix).

---
*Phase: 08-scheduling-calendar*
*Completed: 2026-08-17*
