---
phase: 06-invoicing-payments
plan: "01"
subsystem: build-dependencies
status: complete
tags: [dependencies, expo, razorpay, supply-chain, package-legitimacy, md3, pdf]
requires: []
provides:
  - "react-native-qrcode-svg declared on @breeyo/mobile for BIL-05 QR display"
  - "razorpay@2.9.8 declared on @breeyo/api for BIL-05/BIL-06"
  - "Breeyo MD3 PaperProvider at the mobile router root"
  - "documented billing environment contract (no secrets)"
  - "resolution smoke test for the PDF dependency chain"
affects:
  - apps/mobile/package.json
  - apps/mobile/app/_layout.tsx
  - apps/api/package.json
  - .env.example
  - packages/ui/src/theme/theme.ts
  - pnpm-lock.yaml
tech-stack:
  added:
    - "react-native-qrcode-svg ^6.3.21 (mobile)"
    - "razorpay 2.9.8 exact (api)"
  patterns:
    - "blocking-human package-legitimacy gate before any package-manager install"
    - "require.resolve with a negative control for non-vacuous dependency smoke tests"
key-files:
  created:
    - apps/mobile/src/features/pdf/__tests__/pdf-deps.test.ts
  modified:
    - apps/mobile/package.json
    - apps/mobile/app/_layout.tsx
    - apps/api/package.json
    - .env.example
    - packages/ui/src/theme/theme.ts
    - pnpm-lock.yaml
decisions:
  - "react-native-qrcode-svg approved by human at the Task 1 legitimacy gate on the strength of 883,449 weekly downloads, the Expensify-maintained repo, a 2025-12-04 last publish and no postinstall script"
  - "react-native-paper stays at ^5.15.1 to match @breeyo/ui rather than the plan's 5.15.3, avoiding a duplicate Paper copy in the bundle"
  - "Billing env vars go in the root .env.example; the plan's apps/api/.env.example path is stale and that file does not exist"
metrics:
  tasks-completed: 3
  tasks-total: 3
  commits: 4
  completed: 2026-08-14
---

# Phase 6 Plan 01: Wave 0b Billing Dependency Install — Summary

Installed the one genuinely missing mobile dependency (`react-native-qrcode-svg`), pinned
`razorpay@2.9.8` on the API, wired a Breeyo-themed `PaperProvider` at the Expo Router root,
documented the billing environment contract without committing secrets, and added a non-vacuous
resolution smoke test for the PDF dependency chain. Along the way, fixed a latent `@breeyo/ui`
theme bug that would have silently broken every Paper animation, and a mobile test script that
ran vitest in watch mode.

## Task Completion

| Task | Type | Commit | Result |
|------|------|--------|--------|
| 1. Package legitimacy verification | `checkpoint:human-verify` (`blocking-human`) | `dd0452b` | Human **approved** `react-native-qrcode-svg` |
| 2. Mobile native modules + PaperProvider | `auto` | `61f89d4` | Installed, wired, `expo install --check` clean |
| 3a. PDF dependency smoke test (RED/test gate) | `auto` `tdd` | `b03d0d1` | 3 tests passing |
| 3b. Razorpay SDK + env contract (GREEN gate) | `auto` `tdd` | `441a188` | Pinned exact, 4 vars documented |

## Task 1: Package legitimacy decision (recorded per acceptance criteria)

**Decision: APPROVED** — `react-native-qrcode-svg@^6.3.21` installed as planned, no substitution.

| Signal | Observed value |
|--------|----------------|
| Version | `6.3.21` |
| Repository | `github.com/Expensify/react-native-qrcode-svg` |
| First published | 2016-05-05 (10+ years) |
| **Last publish** | **2025-12-04** (~8 months before execution) |
| **Weekly downloads** | **883,449** |
| License / maintainers | MIT / `awesomejerry`, `expensify <infra@expensify.com>` |
| Runtime deps | `prop-types ^15.8.0`, `qrcode ^1.5.4`, `text-encoding ^0.7.0` |
| Peer deps | `react-native >=0.63.4`, `react-native-svg >=14.0.0` — both satisfied |
| `postinstall` | **absent** |
| Prop API | `value` + `size` documented, matching 06-RESEARCH.md usage |

`react-native-paper` — `5.15.3` exists, **no `postinstall`**. Both packages declare only `prepack`,
which runs on the publisher's machine at pack time, not on a consumer install.

## Resolved dependency versions

`npx expo install` chose **nothing new** — the four Expo/SVG native modules were already declared at
SDK-52-correct versions and `npx expo install --check` reports `Dependencies are up to date`:

| Package | Version | Origin |
|---------|---------|--------|
| `expo-print` | `~14.0.3` | already declared (Phase 4/5) |
| `expo-sharing` | `~13.0.1` | already declared (Phase 4/5) |
| `expo-file-system` | `~18.0.12` | already declared (Phase 4/5) |
| `react-native-svg` | `15.8.0` | already declared (Phase 4/5) |
| `react-native-paper` | `^5.15.1` | already declared; kept to match `@breeyo/ui` (D-1) |
| `@breeyo/ui` | `workspace:^` | already declared |
| **`react-native-qrcode-svg`** | **`^6.3.21`** | **newly installed by this plan** |
| **`razorpay`** | **`2.9.8` (exact)** | **newly installed by this plan** |

`expo`, `react` and `react-native` are untouched (`~52.0.0`, `^18.3.0`, `^0.76.0`).

## Deviations from Plan

**1. [Rule 3 — Stale premise] Five of seven "missing" mobile deps were already declared**
- **Found during:** Task 1 pre-flight
- **Issue:** The objective claims `expo-print`, `expo-sharing`, `expo-file-system`,
  `react-native-paper` and `@breeyo/ui` are undeclared and that `expo-print` is absent from
  `pnpm-lock.yaml` entirely. All five are declared, and `expo-print` has 3 lockfile entries. They
  landed in the Phase 4/5 merges (`9904cd5`, `956566e`).
- **Fix:** Installed only the genuinely missing `react-native-qrcode-svg`; ran
  `npx expo install --check` as verification instead of re-installing.
- **Commit:** `61f89d4`

**2. [Rule 3 — Plan-internal conflict] `react-native-paper` kept at `^5.15.1`, not `5.15.3`**
- **Found during:** Task 2
- **Issue:** Task 2's action says pin `5.15.3`; its own `read_first` says match `packages/ui`,
  which pins `^5.15.1`. Confirmed with the coordinator.
- **Fix:** Left `^5.15.1` (it resolves to 5.15.3 anyway). Pinning a second range risked two Paper
  copies in the bundle and a theme/context mismatch against `@breeyo/ui`.
- **Commit:** `61f89d4`

**3. [Rule 1 — Bug] `breeyoTheme` clobbered MD3's reserved `animation` key**
- **Found during:** Task 2, surfaced by typechecking the new `PaperProvider`
- **Issue:** `packages/ui/src/theme/theme.ts` set `animation: { duration: … }`, replacing
  `MD3LightTheme.animation` wholesale. react-native-paper reads `theme.animation.scale` internally
  (ripples, FAB, Snackbar), so wrapping the app in a real `PaperProvider` — which this plan does for
  the first time — would have left every Paper animation with `scale === undefined`. Latent until
  now only because no PaperProvider consumed the theme outside Storybook.
- **Fix:** `animation: { ...MD3LightTheme.animation, duration: animationDurations }` — preserves
  `scale` and keeps the Breeyo duration tokens. Also clears the resulting `ThemeProp` type error.
- **Files modified:** `packages/ui/src/theme/theme.ts` (outside the plan's `files_modified`)
- **Verified:** all 177 `@breeyo/ui` tests pass, including
  `breeyoTheme.animation.duration.microFeedback === 100`
- **Commit:** `61f89d4`

**4. [Rule 3 — Blocking] Mobile `test` script ran vitest in watch mode**
- **Found during:** Task 3
- **Issue:** `"test": "vitest"` never exits. The plan's own verify command
  (`pnpm --filter @breeyo/mobile test -- …`) hung until timeout, and CI would too.
- **Fix:** `"test": "vitest run"` with the watcher preserved as `"test:watch": "vitest"`, matching
  the convention already used by `@breeyo/ui` and `@breeyo/validators`.
- **Commit:** `b03d0d1`

**5. [Rule 3 — Stale path, coordinator-confirmed] Billing env vars went in the root `.env.example`**
- **Found during:** Task 3
- **Issue:** `apps/api/.env.example` does not exist; the repo keeps one root `./.env.example` holding
  the whole API contract (`DATABASE_URL`, `JWT_SECRET`, `MSG91_*`, …).
- **Fix:** Appended the four billing variables to the root `./.env.example`.
- **⚠️ For the verifier:** this plan's `must_haves.artifacts` names
  `apps/api/.env.example` as the artifact that must contain `BILLING_ENCRYPTION_KEY`. **That path
  reference is stale** — treat root `./.env.example` as the satisfying artifact.
- **Commit:** `441a188`

**6. [Rule 1 — Bug in own work] The first version of the smoke test was vacuous**
- **Found during:** Task 3 TDD fail-fast investigation
- **Issue:** The test passed on the very first run, so per the fail-fast rule I checked whether it
  actually tested anything. It did not: `vi.mock(spec, factory)` short-circuits module resolution
  entirely. A control test mocking `expo-print-definitely-not-a-real-package` — a package that does
  not exist — **also passed**. Written as the plan specified, the resolution test would never have
  caught a missing dependency, which is its entire purpose.
- **Fix:** Rewrote the resolution assertion to use `createRequire(import.meta.url).resolve()`, which
  runs Node's real resolution algorithm and throws `MODULE_NOT_FOUND` when a package is absent. Added
  an in-test negative control asserting a known-fake specifier throws, so the test can never silently
  become vacuous again. Extended coverage to `react-native-svg` and `react-native-qrcode-svg`.
- **Commit:** `b03d0d1`

**7. [Deferred — out of scope] `apps/api` also runs vitest in watch mode**
- `apps/api/package.json` has the same `"test": "vitest"` watch-mode problem. Not fixed — it did not
  block this plan and `apps/api` test scripts are not in this plan's scope. Worth a one-line fix in a
  later Phase 6 plan.

## Verification Results

| Check | Result |
|-------|--------|
| `pnpm install --frozen-lockfile` | Lockfile up to date, no drift |
| `npx expo install --check` | `Dependencies are up to date` |
| `pnpm --filter @breeyo/mobile test` | **16 files, 211 tests passed** |
| `pdf-deps.test.ts` | **3 tests passed** |
| `pnpm --filter @breeyo/ui test` | **15 files, 177 tests passed** |
| mobile `tsc --noEmit` | 401 errors — **identical to the pre-existing baseline**; zero in `app/_layout.tsx` |
| `razorpay` exact pin | `2.9.8`, no caret |
| `npm view razorpay@2.9.8 scripts.postinstall` | empty |
| `import Razorpay from 'razorpay'` under NodeNext | type-checks, including `paymentLink.create/fetch/cancel/edit`, `payments.refund`, `refunds.fetch`, `Razorpay.validateWebhookSignature` |
| Credential-shaped values in `.env.example` | **0** |
| Root `package-lock.json` / root `node_modules` in git | none |
| `apps/mobile/package.json` diff vs `956566e` | additive; `expo`/`react`/`react-native` unchanged |

**Note on the mobile typecheck:** `apps/mobile` has 401 pre-existing TS errors across ~130 files
(mostly unbuilt `@breeyo/types`/`@breeyo/validators` declarations and MD3 `Text` overload issues in
`packages/ui`). This plan added zero. The plan's `tsc --noEmit` verification cannot pass today and
did not pass before this plan either — out of scope here, flagged for a future cleanup plan.

**Note on the mobile test suite:** 6 test files fail from a cold checkout until
`pnpm --filter @breeyo/types --filter @breeyo/validators build` has been run, because Vite cannot
resolve workspace packages that have no build output. After building, all 16 files pass. This was
previously invisible because the test script never exited.

## Environment / credentials status

**Razorpay test credentials are NOT provisioned.** This plan only documents variable names, so it is
complete — but **BIL-05 (payment links) and BIL-06 (webhook confirmation) development is blocked**
until someone supplies:

- `RAZORPAY_TEST_KEY_ID` / `RAZORPAY_TEST_KEY_SECRET` — Razorpay Dashboard → Account & Settings → API Keys
- `BILLING_ENCRYPTION_KEY` — `openssl rand -hex 32`
- `RAZORPAY_WEBHOOK_DEV_TOKEN` + a test-mode webhook on the tunnelled dev URL for
  `payment_link.paid`, `payment_link.partially_paid`, `payment_link.cancelled`,
  `payment_link.expired`, `refund.processed`, `refund.failed`

**Long-lead item:** each of the 20 Beta pilot clinics needs its own Razorpay account with completed
KYC and its own webhook (D-29 locks per-clinic keys). Start in parallel with development.

## Owed to other plans

- **Plan 06-20 owes the CI gate.** Task 2 forbids editing `.github/workflows/ci.yml` here; 06-20 adds
  the `Expo dependency check` step (`cd apps/mobile && npx expo install --check`) on this plan's
  behalf so an SDK-mismatched native module fails CI rather than the native build (06-RESEARCH.md
  Pitfall 8). **Until 06-20 lands, that protection does not exist.**

## Known Stubs

None. This plan ships no UI surface — only dependency declarations, a provider wiring and a test.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns or schema changes were introduced.
The two trust boundaries in the plan's threat register were handled as specified: T-06-SC via the
blocking human gate plus the exact `razorpay` pin and postinstall assertions; T-06-23 via the
credential-shape grep over `.env.example` (returns 0).

## Self-Check

- `apps/mobile/src/features/pdf/__tests__/pdf-deps.test.ts` — FOUND
- `apps/mobile/app/_layout.tsx` contains `PaperProvider` (4 occurrences) and `@breeyo/ui` — FOUND
- `apps/mobile/package.json` contains `react-native-qrcode-svg` — FOUND
- `apps/api/package.json` contains `razorpay: "2.9.8"` — FOUND
- `.env.example` contains all four billing vars — FOUND
- Commits `dd0452b`, `61f89d4`, `b03d0d1`, `441a188` — FOUND

## Self-Check: PASSED
