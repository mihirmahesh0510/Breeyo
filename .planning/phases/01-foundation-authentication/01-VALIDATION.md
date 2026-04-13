---
phase: 1
slug: foundation-authentication
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-13
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | none — Wave 0 installs |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test -- --run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test -- --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | AUTH-01 | integration | `npm test` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | AUTH-02 | integration | `npm test` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | AUTH-03 | integration | `npm test` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | AUTH-04 | unit | `npm test` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | AUTH-05 | integration | `npm test` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | AUTH-06 | unit | `npm test` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PLT-04 | integration | `npm test` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PLT-05 | config | `npm test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Test framework (vitest) installed and configured
- [ ] Test database setup (PostgreSQL test instance)
- [ ] Test fixtures for multi-tenant RLS verification
- [ ] Auth test helpers (token generation, user factories)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SMS OTP delivery | AUTH-02 | External SMS provider | Verify OTP received on test phone via MSG91 dashboard |
| India region deployment | PLT-05 | Infrastructure config | Verify AWS console shows Mumbai (ap-south-1) region |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
