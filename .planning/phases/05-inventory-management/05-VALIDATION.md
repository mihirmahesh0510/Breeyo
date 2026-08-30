---
phase: 5
slug: inventory-management
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-19
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (from project stack) |
| **Config file** | `vitest.config.ts` (verify exists — see Wave 0) |
| **Quick run command** | `npx vitest run --reporter=verbose src/modules/inventory` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose src/modules/inventory`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 0 | INV-01 | unit | `npx vitest run tests/inventory/item-crud.test.ts -t "create item"` | ❌ W0 | ⬜ pending |
| 05-01-02 | 01 | 0 | INV-02 | unit | `npx vitest run tests/inventory/stock-adjustment.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-03 | 01 | 0 | INV-04 | unit | `npx vitest run tests/inventory/stock-receipt.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-04 | 01 | 0 | INV-05 | unit | `npx vitest run tests/inventory/fifo-dispense.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-05 | 01 | 0 | INV-06 | unit | `npx vitest run tests/inventory/par-level-alerts.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-06 | 01 | 0 | INV-07 | unit | `npx vitest run tests/inventory/want-list.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-07 | 01 | 0 | INV-08 | unit | `npx vitest run tests/inventory/offline-queue.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-08 | 01 | 0 | INV-03 | unit | `npx vitest run tests/inventory/barcode-lookup.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-09 | 01 | 0 | INV-05 | unit | `npx vitest run tests/inventory/stock-movement.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/inventory/item-crud.test.ts` — stubs for INV-01
- [ ] `tests/inventory/stock-adjustment.test.ts` — stubs for INV-02
- [ ] `tests/inventory/stock-receipt.test.ts` — stubs for INV-04
- [ ] `tests/inventory/fifo-dispense.test.ts` — stubs for INV-05 (critical: multi-batch FIFO, expired batch blocking, override)
- [ ] `tests/inventory/par-level-alerts.test.ts` — stubs for INV-06
- [ ] `tests/inventory/want-list.test.ts` — stubs for INV-07
- [ ] `tests/inventory/offline-queue.test.ts` — stubs for INV-08 queue logic (not camera)
- [ ] `tests/inventory/barcode-lookup.test.ts` — stubs for INV-03 lookup logic (not camera)
- [ ] `tests/inventory/stock-movement.test.ts` — stubs for D-45, D-46 audit trail
- [ ] Test fixtures: shared Prisma mock setup for inventory module
- [ ] VisionCamera V5 + barcode scanning spike on physical device (manual, not automated)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Barcode scanning with phone camera | INV-03 | Requires physical camera hardware | Launch app on Android 8+ device, scan EAN-13 barcode, verify item card appears |
| Continuous scanning mode | INV-03 | Requires physical camera + multiple barcodes | Scan 5 barcodes consecutively, verify all appear in scan list |
| Offline barcode scanning | INV-08 | Requires airplane mode on device | Enable airplane mode, scan cached barcode, verify offline queue, reconnect, verify sync |
| Camera overlay with bottom sheet | INV-03 | Visual/interaction verification on device | Verify full-screen camera, torch toggle, scan region guide, bottom sheet overlay on mid-range Android |
| WhatsApp want-list sharing | INV-07 | Requires WhatsApp installed on device | Generate want-list, tap share, verify text format in WhatsApp compose |

---

## E2E Bug Fix Additions (E2E-BUG-FIX-PLAN.md §5.1, 2026-08-19)

| Behavior | Test | Why it matters |
|----------|------|-----------------|
| The Save/Save Changes button is disabled until name, category, unit, and a positive selling price are all filled | `apps/mobile/src/features/inventory/lib/__tests__/item-form-validation.test.ts` (`isRequiredFieldsValid`) | `requiredFieldsValid()` already existed but was never wired to the Save button's `disabled` prop — the button was clickable at all times regardless of form validity. Extracted the predicate so both the button gate and the existing silent-draft-creation effect share one tested source of truth. The category/unit picker's `BottomSheet` focus-corruption bug (§2.1) is a separate fix — re-verify manually once that lands, no additional Phase 5 code change needed for it. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
