# Breeyo — Development Status

*Last updated: 2026-08-12*

## Where things stand

Breeyo is being built across **10 phases**, going from a bare monorepo to a deployable beta for 20 pilot veterinary clinics. We're currently **3.5 of 10 phases complete**, with a 4th finishing up and 5th and 6th already planned ahead of schedule.

| Phase | Status |
|---|---|
| 01 — Foundation & Authentication | ✅ Done |
| 02 — UI/UX Design System | ✅ Done |
| 03 — Patient Registration & Walk-in Queue | ✅ Done |
| 04 — EMR & Clinical Records | ✅ Built, pending merge to main |
| 05 — Inventory Management | 📋 Planned, not started |
| 06 — Invoicing & Payments | 📋 Planned, not started |
| 07 — WhatsApp Communication | 📋 Researched & planned |
| 08 — Scheduling & Calendar | ⏳ Not started |
| 09 — Web Dashboard & Owner Portal | ⏳ Not started |
| 10 — Offline Hardening & Integration Polish | ⏳ Not started |

**Overall progress: ~53%** (by plan count: 17 of 59 total plans across the roadmap are complete)

## Where the task planner (Kanban board) lives

There isn't a separate visual Kanban tool (Jira/Linear/Trello) for this project — work is tracked directly **in the repo** using a structured planning system. Think of it as a text-based Kanban board with three columns (Planned → In Progress → Done), version-controlled alongside the code:

```
.planning/
├── ROADMAP.md      ← the board itself: all 10 phases, each with a checklist of plans
├── STATE.md         ← "now" view: current phase, current plan, velocity, blockers
├── PROJECT.md       ← product vision, key decisions log
├── REQUIREMENTS.md  ← every requirement ID (e.g. EMR-01, INV-05) referenced by phases
└── phases/
    ├── 04-emr-clinical-records/   ← one folder per phase, with individual PLAN.md files
    ├── 05-inventory-management/
    └── ...
```

- **To see the whole backlog:** open [`.planning/ROADMAP.md`](../.planning/ROADMAP.md) — every phase is a checkbox, every plan inside a phase is a sub-checkbox.
- **To see what's active right now:** open [`.planning/STATE.md`](../.planning/STATE.md) — it has the current phase/plan, velocity metrics, and a running list of blockers and decisions.
- **To see a specific phase's task breakdown:** open the matching folder under `.planning/phases/<NN-phase-name>/`, e.g. `04-emr-clinical-records/04-01-PLAN.md` through `04-08-PLAN.md`.

Each "card" (plan) moves through: not started → in progress → implemented → merged, and gets checked off in `ROADMAP.md` once done. Note `ROADMAP.md`'s Phase 4 checkboxes hadn't been ticked off as of this writing even though the work is functionally complete per `STATE.md` — that file update is one of the pending housekeeping items.

## Current focus

- **Phase 4 (EMR & Clinical Records)** — all 8 plans implemented (SOAP notes, vitals, prescriptions, voice-to-text, attachments, medical history timeline, vaccination/deworming, service catalog). Sitting on branch `breeyo/phase-04-emr-clinical-records`, not yet merged to `main`.
- **Phase 5 (Inventory Management)** — research and planning decisions recorded; execution not started.
- **Phase 6 (Invoicing & Payments)** — full plan created (20 plans across 14 waves); execution not started.
- **Phase 7 (WhatsApp Communication)** — domain research and 16-plan breakdown complete; execution not started.

## Open items / blockers

- WhatsApp Business API Meta verification hasn't been started (blocks swapping the real API in for the Phase 7 simulator).
- CSV bulk import (PAT-06) and guided onboarding (ONB-01) are scaffolded but not fully implemented.
- Phase 5 planning needs an update for requirement INV-09.
- Phase 4 branch needs to be merged into `main`.

## Velocity

- 15 plans completed across Phases 01–03 in one continuous development cycle (~30 hours total, ~2 hours/plan average).
- Phase 04 (8 plans) has since been completed on top of that.
- Trend: accelerating — infrastructure-heavy phases are behind us, feature phases are ahead.
