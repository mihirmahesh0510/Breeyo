# Phase 10: Offline Hardening & Integration Polish - Context

**Gathered:** 2026-05-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Harden Breeyo's mobile-first system so the core clinic workflows remain trustworthy through real connectivity loss and recovery, then prove the full cross-module product works end to end. This phase delivers robust offline behavior for the named mobile workflows, structured reconnect and conflict handling, clear sync-state UX, and realistic integration proof that the clinic can move from walk-in through payment without data loss or broken handoffs.

</domain>

<decisions>
## Implementation Decisions

### Offline Action Boundaries
- **D-01:** The named core mobile workflows in Phase 10 should be fully editable offline, not only draftable or view-only.
- **D-02:** Actions that need live external services or real-time coordination should be captured locally when safe and queued for sync later rather than blocked immediately.
- **D-03:** Offline-created queue entries are operationally real for the staff using the device; they are not just placeholders waiting for the server.
- **D-04:** Offline barcode scanning and stock updates should support full local stock actions on-device, then reconcile on reconnect.

### Conflict Handling
- **D-05:** Default conflict posture is review before overwrite, not silent last-write-wins.
- **D-06:** Clinical records are the most conflict-sensitive domain and get the strongest protection.
- **D-07:** Safe auto-merge is allowed only for clearly non-destructive cases; broad automatic merging is out of bounds.
- **D-08:** Conflict review should use a structured resolution sheet that compares local and server state explicitly.
- **D-09:** If two offline devices change the same clinical record, the assigned clinician should own resolution when possible.
- **D-10:** Queue and inventory conflicts should use a lighter operational review flow than clinical-record conflicts.
- **D-11:** Unresolved conflicts stay persistently visible until they are actually cleared.

### Reconnect Priority
- **D-12:** On reconnect, queue actions sync first.
- **D-13:** After queue actions, backlog replay should follow operational priority tiers rather than strict raw timestamp order.
- **D-14:** Higher-priority operational work should preempt lower-priority replay during reconnect instead of waiting for the entire backlog to drain.

### Offline Data Window
- **D-15:** Beyond the active edit queue, the offline data target is a same-day working set rather than the full clinic dataset.
- **D-16:** The app should be most aggressive about caching today's operational records: current queue state, active patients, today's consultations, and stock items actively in motion.
- **D-17:** Older data outside the active working set can remain available only as limited fallback read-only context; broad historical offline access is not required.

### Sync Visibility
- **D-18:** Sync state should always be visible during normal clinic use.
- **D-19:** Pending-but-not-broken sync work should use a calm persistent badge rather than repeated banners.
- **D-20:** Failed sync items should escalate into an actionable failure center, not vague generic warnings.
- **D-21:** Successful recovery after backlog sync should use a subtle recovery cue rather than loud celebration or total silence.

### Failure Ownership
- **D-22:** The originating user owns the first recovery attempt for a stuck or repeatedly failed sync item.
- **D-23:** Escalation happens after a guided retry fails, not immediately and not only by manual handoff.
- **D-24:** For safety-critical conflicts, the next escalation owner should be the assigned clinician.

### Integration Proof
- **D-25:** Phase 10 completion requires proof broader than a single happy-path demo.
- **D-26:** Offline recovery is the most important additional proof area beyond the walk-in-to-payment golden path.
- **D-27:** Phase 10 proof must include real disconnect/reconnect drills, not only mocked automation.
- **D-28:** When integration proof finds issues, fix integrity first.
- **D-29:** The second mandatory proof path after offline recovery is a WhatsApp-triggered clinic flow.
- **D-30:** Even non-critical issues found in the Phase 10 proof bar should be fixed before calling the phase done.

### Test Environment Bar
- **D-31:** Phase 10 proof must explicitly cover mid-range Android hardware under flaky network conditions, not only emulator or simulator confidence.
- **D-32:** The app should remain meaningfully usable offline for several hours, not only for a brief outage.
- **D-33:** Proof runs should include multiple drop/recover cycles rather than a single clean reconnect at the end.

### the agent's Discretion
- Exact local queue implementation, sync queue storage model, and retry scheduling mechanics are left to research and planning as long as they preserve the decisions above.
- Exact visual treatment of sync badges, failure-center layout, and resolution-sheet composition may follow the established design system and any later UI contract.
- Exact thresholds for what counts as a safe auto-merge versus a mandatory review can be refined by the researcher and planner, provided clinical records stay the most protected domain.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Context
- `.planning/PROJECT.md` -- Core value, mobile-first clinic reality, offline-support constraint, and the requirement that walk-ins remain the primary workflow.
- `.planning/REQUIREMENTS.md` -- `PLT-03` defines the core offline requirement for this phase; broader product requirements explain which workflows must keep behaving correctly when offline state reconnects.
- `.planning/ROADMAP.md` -- Phase 10 goal, success criteria, and dependency on Phase 9.

### Prior Phase Context
- `.planning/phases/03-patient-registration-walk-in-queue/03-CONTEXT.md` -- Queue is the primary workflow, real-time queue behavior, and the earlier explicit decision that offline queue modifications were deferred to Phase 10.
- `.planning/phases/04-emr-clinical-records/04-CONTEXT.md` -- Consultation, note-taking, prescriptions, and audit sensitivity for clinical-record conflict handling.
- `.planning/phases/05-inventory-management/05-CONTEXT.md` -- Barcode scanning, stock movements, and prior offline-scanning assumptions that Phase 10 now hardens.
- `.planning/phases/07-whatsapp-communication/07-CONTEXT.md` -- Reminder/retry/action-item patterns and WhatsApp-triggered clinic flows that must still line up under integration proof.
- `.planning/phases/08-scheduling-calendar/08-CONTEXT.md` -- Queue/scheduling coexistence and real-time handoff expectations that offline recovery must not break.
- `.planning/phases/09-web-dashboard-owner-portal/09-CONTEXT.md` -- Browser/mobile stale-state philosophy, owner portal, and broader Phase 9 integration surfaces that Phase 10 must prove end to end.

### Technology And Codebase Context
- `.planning/research/STACK.md` -- Planned stack including React Native/Expo, PostgreSQL, Redis, React Query, Zustand, Socket.IO, BullMQ, and the offline-first variant notes.
- `.planning/intel/codebase-map.md` -- Confirms the repo is still planning-only with no implemented source code; planning must target the intended monorepo/module structure and integration seams.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- No implemented source code exists yet, so there are no live offline queues, sync engines, or conflict-resolution components to reuse directly.
- Planned reusable assets from earlier phases should be treated as the offline hardening targets: Phase 3 queue flow, Phase 4 consultation/note-taking, Phase 5 inventory scanning, Phase 7 WhatsApp actions, Phase 8 scheduling handoff, and Phase 9 browser/mobile shared-state behavior.

### Established Patterns
- Planned architecture remains a modular monolith with REST endpoints, zod boundary validation, PostgreSQL RLS multi-tenancy, and event-driven realtime updates.
- Planned React Query + Zustand client patterns and Socket.IO-based live update model create the expected baseline that offline replay and stale/conflict prompts must preserve.
- Planned mobile-first product posture means offline hardening centers on the mobile app, not on bringing equivalent offline behavior to the browser.

### Integration Points
- Queue: offline check-in and reconnect behavior must preserve the walk-in-first operational truth.
- EMR: offline note-taking and consultation state must keep medical integrity ahead of convenience.
- Inventory: offline scanning and stock changes must reconnect without corrupting stock truth or batch history.
- Billing and payments: end-to-end proof still has to complete through invoice/payment state once connectivity returns.
- WhatsApp and owner-facing flows: integration proof must include at least one WhatsApp-triggered clinic path beyond the main golden path.

</code_context>

<specifics>
## Specific Ideas

- Offline should feel trustworthy, not mysterious: staff should always know whether work is pending, conflicted, or safely caught up.
- Queue recovery deserves the fastest reconnect path because the clinic cannot afford operational drift in live patient flow.
- Clinical conflicts deserve more ceremony than queue or inventory conflicts because they change medical truth.
- The app should survive realistic several-hour offline stretches on the kind of Android phones Breeyo actually targets, not just lab-perfect short disconnections.
- Phase 10 should prove real-world resilience, not only technical replay logic: multiple drops, reconnects, and recovery cycles matter.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within the Phase 10 scope of offline hardening, reconnect behavior, and end-to-end integration proof.

</deferred>

---

*Phase: 10-Offline Hardening & Integration Polish*
*Context gathered: 2026-05-07*
