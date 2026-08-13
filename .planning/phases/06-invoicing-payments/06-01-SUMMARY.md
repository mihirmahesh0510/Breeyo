---
phase: 06-invoicing-payments
plan: "01"
subsystem: build-dependencies
status: paused-at-checkpoint
tags: [dependencies, expo, razorpay, supply-chain, package-legitimacy, md3]
requires: []
provides:
  - "package-legitimacy provenance record for react-native-qrcode-svg and react-native-paper"
affects:
  - apps/mobile/package.json
  - apps/api/package.json
  - apps/mobile/app/_layout.tsx
tech-stack:
  added: []
  patterns:
    - "blocking-human package-legitimacy gate before any package-manager install"
key-files:
  created: []
  modified: []
decisions: []
metrics:
  tasks-completed: 0
  tasks-total: 3
  completed: null
---

# Phase 6 Plan 01: Wave 0b Billing Dependency Install — Summary (IN PROGRESS)

Execution paused at **Task 1**, the `gate="blocking-human"` package-legitimacy checkpoint, which by
phase security policy must be answered by a human before any package-manager install runs. Zero
installs have been executed and zero source files have been modified. This summary records the
provenance evidence gathered for the gate plus several stale-premise findings that materially
reduce the scope of Tasks 2 and 3.

## Status

| Task | Type | Status |
|------|------|--------|
| 1. Package legitimacy verification | `checkpoint:human-verify` (`blocking-human`) | **AWAITING HUMAN** — evidence gathered, decision required |
| 2. Install mobile native modules + wire PaperProvider | `auto` | Not started (blocked by Task 1) |
| 3. Razorpay SDK + env contract + PDF smoke test | `auto` `tdd` | Not started (blocked by Task 1) |

## Task 1 Evidence (read-only provenance checks — no installs)

### `react-native-qrcode-svg` — the single `[ASSUMED]` package

| Signal | Observed value | Verdict |
|--------|----------------|---------|
| Latest version | `6.3.21` (matches the planned `^6.3.21`) | Matches plan |
| Repository | `git+https://github.com/Expensify/react-native-qrcode-svg.git` | Real project, corporate steward (Expensify) |
| First published | `2016-05-05` (10+ years old) | Not a fresh/typosquat registration |
| Last modified | `2025-12-04` (~8 months before today) | Well inside the 24-month freshness bar |
| Weekly downloads | **883,449** | Far above the "tens of thousands" bar |
| License | MIT | OK |
| Maintainers | `awesomejerry`, `expensify <infra@expensify.com>` | Original author + corporate maintainer |
| Runtime deps | `prop-types ^15.8.0`, `qrcode ^1.5.4`, `text-encoding ^0.7.0` | Small, all well-known |
| Peer deps | `react *`, `react-native >=0.63.4`, `react-native-svg >=14.0.0` | Satisfied — workspace has RN `^0.76.0` and `react-native-svg 15.8.0` |
| `postinstall` script | **absent** (`prepack`, `test`, `lint`, `check:*` only — all publish/dev-time) | No install-time code execution |
| Prop API | README documents `size` (default 100) and `value` (QR string) | Matches the `value` + `size` usage in 06-RESEARCH.md |

`npm view react-native-qrcode-svg scripts` output, verbatim:

```
{
  prepack: 'rm -rf example',
  test: 'jest',
  'test:update': 'npm run test -- --updateSnapshot',
  lint: "standard 'src/**/*.js'",
  'lint:fix': "standard 'src/**/*.js' --fix",
  'lint:staged': 'lint-staged',
  'check:update': 'npx npm-check-updates -u',
  'check:outdated': 'npm outdated'
}
```

`prepack` runs on the *publisher's* machine at pack time, not on a consumer's `pnpm add`, so it is
not an install-time execution vector.

### `react-native-paper`

| Signal | Observed value | Verdict |
|--------|----------------|---------|
| Latest version | `5.15.3` | Exists, as the plan claims |
| Version pinned in `packages/ui/package.json` | `^5.15.1` | See deviation D-1 below — the plan's "pin 5.15.3" instruction conflicts with the in-tree pin |
| `postinstall` script | **absent** (`prepack`, `test`, `lint*`, `docs`, `example`, `release`, `typescript`) | No install-time code execution |

## Findings that change the scope of Tasks 2 and 3

The plan's objective was written against a stale reading of the tree. Verified current state:

1. **Five of the seven "missing" mobile dependencies are already declared.**
   `apps/mobile/package.json` already contains `expo-print ~14.0.3`, `expo-sharing ~13.0.1`,
   `expo-file-system ~18.0.12`, `react-native-svg 15.8.0`, `react-native-paper ^5.15.1` and
   `@breeyo/ui workspace:^`. These landed in the Phase 4 and Phase 5 merges (`9904cd5`, `956566e`).
2. **`expo-print` *is* in `pnpm-lock.yaml`** (3 occurrences), contradicting the objective's claim
   that it "does not appear in `pnpm-lock.yaml` at all".
3. **`react-native-qrcode-svg` is the only genuinely missing mobile dependency** — absent from every
   `package.json` in the workspace and absent from `pnpm-lock.yaml`.
4. **`PaperProvider` is genuinely absent** from `apps/mobile/app/_layout.tsx` (0 occurrences), so
   the MD3 provider wiring in Task 2 is still required and is the substantive part of that task.
5. **`razorpay` is genuinely absent** from `apps/api/package.json`.
6. **`apps/api/.env.example` does not exist.** The repo keeps a single root `./.env.example` that
   already holds the API contract (`DATABASE_URL`, `JWT_SECRET`, `MSG91_*`, `SENTRY_DSN`, …).
   Task 3 and the plan's `must_haves.artifacts` both name `apps/api/.env.example`. See deviation
   D-2 — this needs resolving during Task 3.

Net effect: Task 2 shrinks to one install (`react-native-qrcode-svg`) plus the PaperProvider wiring;
the `npx expo install` step for the four already-declared Expo modules becomes a verification
(`npx expo install --check`) rather than an install.

## Deviations from Plan

### Pending / anticipated (not yet applied — no files modified)

**D-1. `react-native-paper` version conflict inside the plan**
- **Where:** Task 2 action vs. Task 2 `read_first`
- **Issue:** The action says `pnpm --filter @breeyo/mobile add react-native-paper@5.15.3`, but the
  same task's `read_first` says to match `packages/ui/package.json` exactly, which pins `^5.15.1`.
  `apps/mobile/package.json` already declares `^5.15.1`.
- **Planned resolution:** Keep the existing `^5.15.1` range (it already resolves up to `5.15.3`) and
  do not install. Changing it would diverge the mobile app from `@breeyo/ui` and risk two copies of
  Paper in the bundle. Will be recorded as a Rule 3 deviation when Task 2 runs.

**D-2. `apps/api/.env.example` does not exist**
- **Where:** Task 3 action and `must_haves.artifacts`
- **Issue:** The plan says to *append* to `apps/api/.env.example`; there is no such file. The live
  env contract is the root `./.env.example`.
- **Planned resolution:** To be decided at Task 3 execution. Preference is to append the four
  billing variables to the root `./.env.example` (the file the rest of the API contract actually
  lives in) rather than fragment the contract across two files, and to note the `must_haves` path
  mismatch for the verifier. Will be recorded as a Rule 3 deviation.

### Applied

None — no installs run, no source files modified.

## Environment / credentials status

**Razorpay test credentials are NOT provisioned.** The plan's `user_setup` block requires
`RAZORPAY_TEST_KEY_ID`, `RAZORPAY_TEST_KEY_SECRET` and a locally generated `BILLING_ENCRYPTION_KEY`,
plus a test-mode webhook. None are present in the environment. This plan only documents the variable
*names*, so it is not blocked — but **BIL-05 (payment links) and BIL-06 (webhook confirmation)
development in later plans is blocked until these are provisioned.** The per-clinic Razorpay KYC
onboarding for the 20 Beta pilot clinics (D-29) is flagged in the plan as a long-lead item that
should be started in parallel.

## Owed to other plans

- **Plan 06-20 owes the CI gate.** Task 2 explicitly forbids editing `.github/workflows/ci.yml` in
  this plan; 06-20 adds the `Expo dependency check` step (`cd apps/mobile && npx expo install --check`)
  on this plan's behalf so an SDK-mismatched native module fails CI rather than the native build
  (06-RESEARCH.md Pitfall 8). Until 06-20 lands, that protection does not exist.

## Resume instructions

Answer the Task 1 checkpoint with `approved` (or name a replacement QR package). On resume, a
continuation agent starts at Task 2. Task 1 requires no code changes — only the recorded decision.
