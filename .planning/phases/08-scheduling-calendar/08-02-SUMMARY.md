---
phase: 08-scheduling-calendar
plan: "02"
subsystem: ui
tags: [design-tokens, i18n, react-native-paper, nextjs, css-custom-properties, socket.io]

requires:
  - phase: 08-scheduling-calendar/01
    provides: "AppointmentStatus, APPOINTMENT_TRANSITIONS, QueueStatus.EXPECTED, scheduling Zod schemas"
provides:
  - "vetColors 5-hue non-semantic palette + vetColorForIndex/vetColorForId helpers in @breeyo/ui theme"
  - "--vet-hue-1 through --vet-hue-5 emitted into packages/ui/src/theme/portal.css"
  - "StatusBadge expected/checkedIn/cancelled/completed variants (zero new colours, no SCHEDULED badge)"
  - "scheduling i18n namespace (71 key paths) in en and hi locale files"
  - "apps/web declares @breeyo/ui and socket.io-client, imports portal.css from root layout"
affects: [08-05, 08-08, 08-12, 08-13]

tech-stack:
  added: []
  patterns:
    - "Non-semantic categorical token module (vetColors) kept deliberately separate from theme/colors.ts semantic tokens"
    - "STATUS_CONFIG entries reference theme-token key names only, never hex literals"

key-files:
  created:
    - packages/ui/src/theme/vetColors.ts
  modified:
    - packages/ui/src/theme/index.ts
    - packages/ui/src/theme/portal.css
    - packages/ui/scripts/generate-css-tokens.ts
    - packages/ui/src/atoms/StatusBadge/StatusBadge.ts
    - packages/ui/src/atoms/StatusBadge/StatusBadge.test.ts
    - packages/ui/src/i18n/locales/en/common.json
    - packages/ui/src/i18n/locales/hi/common.json
    - apps/web/package.json
    - apps/web/app/layout.tsx
    - pnpm-lock.yaml

key-decisions:
  - "apps/mobile/package.json was NOT modified: @breeyo/ui, react-native-paper and react-native-safe-area-context were already declared there (added in Phase 5 commit 956566e, reinforced in Phase 7), so the plan's blocking-dependency-gap premise for apps/mobile does not hold in this worktree"
  - "react-native-safe-area-context@^5.7.0 (as named in the plan/orchestrator brief) was not installed anywhere: no such version appears in this repo. The actual version already pinned in packages/ui/package.json and apps/mobile/package.json is 4.12.0; installing ^5.7.0 would have been an unvetted major-version bump, not a same-version pin"
  - "Hindi scheduling copy mirrors English verbatim (UI-SPEC § Accessibility explicitly permits this for a first pass); key paths are identical between en and hi"

requirements-completed: [SCH-02, SCH-03]

duration: ~55min
completed: 2026-08-16
---

# Phase 08 Plan 02: Design-system additions + dependency-manifest fixes Summary

**Added a non-semantic 5-hue vet-identity palette wired into portal.css, four new StatusBadge lifecycle variants (TDD, reusing only existing container token pairs), a 71-key `scheduling` i18n namespace in en/hi, and closed the real apps/web dependency gap (`@breeyo/ui`, `socket.io-client`, `portal.css` import) — while discovering the plan's stated apps/mobile dependency gap no longer exists.**

## Performance

- **Tasks:** 3 completed (Task 1 auto, Task 2 TDD, Task 3 checkpoint — pre-approved per orchestrator instruction)
- **Files modified:** 11 (1 created, 10 modified)

## Accomplishments

- `packages/ui/src/theme/vetColors.ts` — five exact UI-SPEC hexes (`#1565C0`, `#6A1B9A`, `#00695C`, `#AD1457`, `#4E342E`), `vetColorForIndex` (cycling, negative-safe), `vetColorForId` (returns `null` for solo-vet clinics), exported from the theme barrel.
- `generate-css-tokens.ts` emits `--vet-hue-1`..`--vet-hue-5` into `portal.css`; regeneration confirmed idempotent (byte-identical second run).
- `StatusBadge` gained `expected`, `checkedIn`, `cancelled`, `completed` variants — 10 new tests written RED-first, then GREEN after implementation; zero hex literals, no `SCHEDULED` variant (by design).
- `scheduling` i18n namespace added to both `en/common.json` and `hi/common.json` — 71 identical key paths, covering actions/empty/errors/warnings/toasts/push/labels per UI-SPEC § Copywriting Contract.
- `apps/web/package.json` now declares `@breeyo/ui@workspace:^` and `socket.io-client@^4.8.3`; `apps/web/app/layout.tsx` imports `@breeyo/ui/src/theme/portal.css` as its first line.
- Full `@breeyo/ui` test suite: 186/186 passing, no regressions.
- `pnpm --filter @breeyo/web build` exits 0 and emits a CSS asset (`apps/web/.next/static/css/52ea893c2938593e.css`).
- `pnpm install --frozen-lockfile` succeeds — lockfile consistent with the manifest edits.

## Task Commits

1. **Task 1: vetColors token module + portal.css generation** - `5b8088e` (feat)
2. **Task 2: StatusBadge variants + scheduling i18n (TDD)** - `2995a12` (feat; tests were written and run RED before the implementation edit, in the same commit per the plan's single-commit-per-task instruction)
3. **Task 3: apps/web dependency manifest + portal.css import** - `fc698de` (feat)

**Plan summary:** (this commit, docs)

## Files Created/Modified

- `packages/ui/src/theme/vetColors.ts` — new non-semantic vet-identity palette module
- `packages/ui/src/theme/index.ts` — barrel export for `vetColors`/`vetColorForIndex`/`vetColorForId`/`VetColor`
- `packages/ui/scripts/generate-css-tokens.ts` — emits `--vet-hue-N` block
- `packages/ui/src/theme/portal.css` — regenerated, +7 lines (5 vet-hue properties + comment + blank line)
- `packages/ui/src/atoms/StatusBadge/StatusBadge.ts` — 4 new `STATUS_CONFIG` entries
- `packages/ui/src/atoms/StatusBadge/StatusBadge.test.ts` — 10 new tests
- `packages/ui/src/i18n/locales/en/common.json` / `hi/common.json` — `scheduling` namespace
- `apps/web/package.json` — `@breeyo/ui`, `socket.io-client` added
- `apps/web/app/layout.tsx` — `portal.css` import added as first line
- `pnpm-lock.yaml` — reflects the two new apps/web dependencies

## Decisions Made

- Left `apps/mobile/package.json` untouched (see Deviations below) rather than force a version change that wasn't actually needed or vetted.
- Mirrored English strings into `hi/common.json` for the new namespace rather than attempting real translations, per UI-SPEC's explicit allowance — every key path is identical between locales, verified by the plan's flatten-and-compare script (71 keys each).

## Deviations from Plan

### 1. apps/mobile's "blocking dependency gap" does not exist in this worktree

- **Found during:** Task 3 read-first step, before running any `pnpm add` command.
- **Issue:** The plan (and the orchestrator's task brief) asserted `apps/mobile/package.json` declares neither `@breeyo/ui` nor `react-native-paper` nor `react-native-safe-area-context`. Direct inspection showed all three (plus `socket.io-client`) are already present, and `git log --follow -p -- apps/mobile/package.json` showed they were added in Phase 5 (commit `956566e`, "Phase 05: Inventory & Pharmacy Management") and reinforced in Phase 7 (commits `c4aa384`, `0a4b6a4`). `apps/mobile/node_modules/@breeyo/ui`, `.../react-native-paper`, and `.../react-native-safe-area-context` all already resolve.
- **Fix:** Did not run `pnpm --filter @breeyo/mobile add` for these packages — there was nothing to add. `apps/mobile/package.json` is not in this plan's commits.
- **Additional finding:** The plan/brief's claim that `react-native-safe-area-context@^5.7.0` is "already declared in `packages/ui/package.json`" is also incorrect — `packages/ui/package.json` declares `4.12.0`, and `^5.7.0` does not appear anywhere in the repo (`grep -rn "5.7.0" --include=package.json` across the monorepo found no match for this package). Installing `^5.7.0` into `apps/mobile` would have been a real, unvetted major-version bump (v4 → v5) of a package with several existing consumers pinned to `4.12.0` in the lockfile (`@react-navigation/*`), contradicting the checkpoint's own "no new supplier or version" rationale. It was not installed.
- **Verification:** `grep -Ec '"@breeyo/ui"|"react-native-paper"|"react-native-safe-area-context"' apps/mobile/package.json` → `3`; `test -d apps/mobile/node_modules/@breeyo/ui && test -d apps/mobile/node_modules/react-native-paper` → exit 0. All Task 3 acceptance criteria pass without any mobile-manifest change.
- **Committed in:** N/A (no change made to `apps/mobile/package.json`); documented in `fc698de`'s commit message.

**Total deviations:** 1 (a stale plan premise discovered and not acted on, not a code deviation). **Impact on plan:** None negative — every Task 3 acceptance criterion and the plan's `<verification>` block still pass. No scope creep; no extra package installed.

## Issues Encountered

- **Pre-existing `packages/ui` tsc failure** (Task 1 acceptance criterion `pnpm --filter @breeyo/ui exec tsc --noEmit` exits 0): fails with `TS5095`/`TS5109` — `packages/ui/tsconfig.json` sets `moduleResolution: "bundler"` while its base (`packages/config/tsconfig/base.json`) sets `module: "NodeNext"`, an invalid combination. Confirmed via `git stash` that this fails identically on the pre-Task-1 commit (`bae9daa`) — entirely pre-existing, unrelated to `vetColors`, and out of this plan's `files_modified` scope. Not fixed here.
- **Pre-existing `apps/mobile` type errors** (62 total, in `NavigationBar.ts`, `NotificationList.ts`, `QueueCard.ts`, `WizardStepper.ts` inside `packages/ui` — mostly React Native Paper `Text` `children`-prop overload mismatches and an `elevation` field conflicting with a `Record<string, string>` cast). Confirmed identical before and after all three tasks via `git stash` diff (62 errors both times, byte-identical `tsc` output). None mention `Cannot find module 'react-native-paper'` or `Cannot find module '@breeyo/ui'` (both `grep -c` checks return `0`), so Task 3's specific acceptance criterion is satisfied. These 62 errors are recorded here per the plan's `<output>` instruction so plans 08-08, 08-12, 08-13 know they inherited these, not introduced them.
- **Peer-dependency warnings** surfaced by `pnpm --filter @breeyo/web add` (`react-test-renderer` wanting `react@^19.2.8`, `react-native-reanimated`/`react-native-worklets` wanting `react-native@"0.83 - 0.86"`) are pre-existing peer-range mismatches unrelated to this plan's two new dependencies; not investigated further as out of scope.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `apps/web` can now render `portal.css` tokens and resolve `@breeyo/ui`/`socket.io-client` for its first real screen (08-08/08-12's web week grid).
- `vetColors` and the four new `StatusBadge` variants are available to both mobile (08-05) and web (08-08) plans.
- `scheduling` i18n keys are ready for consumption by any component that needs them.
- Known blockers for later plans: the pre-existing `packages/ui` tsconfig `module`/`moduleResolution` conflict and the 62 pre-existing `apps/mobile` type errors are unresolved and will surface again in any future `tsc --noEmit` run against these packages — plans that touch those specific files (`NavigationBar`, `NotificationList`, `QueueCard`, `WizardStepper`) should expect to see them and may want to fix them opportunistically, but they are not this plan's responsibility.

---
*Phase: 08-scheduling-calendar*
*Completed: 2026-08-16*
