---
phase: 8
slug: scheduling-calendar
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-12
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (API, mobile), supertest (API integration) |
| **Config file** | see per-package `vitest.config.ts` |
| **Quick run command** | `pnpm --filter @breeyo/api test`, `pnpm --filter @breeyo/mobile test` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~{N} seconds |

---

## Sampling Rate

- **After every task commit:** Run the quick run command scoped to the touched package
- **After every plan wave:** Run the full suite command
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** {N} seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| {N}-01-01 | 01 | 1 | REQ-{XX} | T-{N}-01 / — | {expected secure behavior or "N/A"} | unit | `{command}` | ✅ / ❌ W0 | ⬜ pending |

*To be populated by the planner when PLAN.md files are generated.*

---

## Wave 0 Requirements

- [ ] Prisma appointment/availability schema + factories (Wave 1, 08-01-PLAN.md)
- [ ] Shared scheduling contracts (@breeyo/types, @breeyo/validators) with tests

*To be finalized by the planner alongside Wave 1 task breakdown.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|--------------------|
| Real-time calendar sync across mobile and web | SCH-02 | Requires two live clients observing a socket event | Open mobile + web simultaneously, create an appointment on one, confirm the other updates without refresh |
| Push notification delivery for upcoming appointments/queue changes | SCH-05 | Requires device-level push delivery, not mockable in CI | Trigger a reminder/queue-backup condition on a physical/simulator device, confirm push arrives |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < {N}s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
