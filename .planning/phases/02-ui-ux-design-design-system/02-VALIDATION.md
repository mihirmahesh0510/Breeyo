---
phase: 02
slug: ui-ux-design-design-system
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-17
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `packages/ui/vitest.config.ts` (Wave 0 creates) |
| **Quick run command** | `pnpm --filter @breeyo/ui test` |
| **Full suite command** | `pnpm turbo test --filter=@breeyo/ui` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @breeyo/ui test`
- **After every plan wave:** Run `pnpm turbo test --filter=@breeyo/ui`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | UX-01 | unit | `pnpm --filter @breeyo/ui test -- tokens.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | UX-01 | unit | `pnpm --filter @breeyo/ui test -- theme.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 1 | UX-02 | unit | `pnpm --filter @breeyo/ui test -- Button.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-02 | 02 | 1 | UX-02 | unit | `pnpm --filter @breeyo/ui test -- Card.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-03 | 02 | 1 | UX-04 | unit | `pnpm --filter @breeyo/ui test -- accessibility.test.ts` | ❌ W0 | ⬜ pending |
| 02-03-01 | 03 | 2 | UX-03 | manual | Launch Storybook, verify wireframes | N/A | ⬜ pending |
| 02-03-02 | 03 | 2 | UX-05 | unit | `pnpm --filter @breeyo/ui test -- StatusBadge.test.ts` | ❌ W0 | ⬜ pending |
| 02-03-03 | 03 | 2 | UX-05 | unit | `pnpm --filter @breeyo/ui test -- QueueCard.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/ui/vitest.config.ts` — Vitest configuration for UI package
- [ ] `packages/ui/tests/setup.ts` — Test setup with RN Paper provider wrapper
- [ ] `packages/ui/src/theme/__tests__/tokens.test.ts` — Token completeness tests
- [ ] `packages/ui/src/theme/__tests__/theme.test.ts` — Theme integration tests
- [ ] Framework install: `pnpm add -D vitest @testing-library/react-native` in packages/ui

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Storybook wireframes render all 4 states per screen | UX-03 | Visual inspection required | Launch Storybook, navigate each wireframe, verify empty/loading/populated/error states |
| 44x44pt tap targets feel correct on device | UX-04 | Physical device interaction | Run on physical Android 8+ device, verify all buttons/inputs reachable with one hand |
| Hindi text renders without clipping | UX-04 | Device rendering check | Switch locale to Hindi, verify all 7 typography levels render correctly |
| Walk-in queue board is glanceable | UX-05 | Subjective UX evaluation | View queue board from arm's length, verify status/position readable |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
