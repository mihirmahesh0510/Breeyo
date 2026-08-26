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
- **D-34:** If two offline devices independently check in the same patient, reconnect auto-merges the duplicate into a single queue entry (lightweight operational review per D-10) rather than keeping both entries for manual review or merging with no review trace at all.
- **D-38 (verify-fix 10.1, 2026-08-26):** A late offline replay targeting an already-finalized consultation is auto-applied as a clinical addendum via Phase 4's existing addendum mechanism (`EmrService`/`EmrRepository.addAddendum`, `04-CONTEXT.md`'s "addendum-only" post-finalization editability), not treated as a draft conflict. `consultationOfflineReplay.service.ts` checks `consultation.status === 'finalized'` before running the draft/conflict diff at all; `ConsultationDraft` is never read or written on this path.

### Reconnect Priority
- **D-12:** On reconnect, queue actions sync first.
- **D-13:** After queue actions, backlog replay should follow operational priority tiers rather than strict raw timestamp order.
- **D-14:** Higher-priority operational work should preempt lower-priority replay during reconnect instead of waiting for the entire backlog to drain.
- **D-37:** Queue-first tier ordering (D-12 to D-14) has no severity-based exception. A safety-critical clinical conflict never preempts or interrupts queue replay; it stays visible and actionable in the failure center but waits its own `CLINICAL_MEDIUM` turn like any other clinical item.

### Offline Data Window
- **D-15:** Beyond the active edit queue, the offline data target is a same-day working set rather than the full clinic dataset.
- **D-16:** The app should be most aggressive about caching today's operational records: current queue state, active patients, today's consultations, and stock items actively in motion.
- **D-17:** Older data outside the active working set can remain available only as limited fallback read-only context; broad historical offline access is not required.
- **D-35:** The same-day working-set window anchors "today" to the calendar day the device went offline, not to local midnight. If an offline stretch spans midnight (e.g. an overnight emergency shift), the working set stays fully editable/aggressively cached until reconnect rather than demoting active overnight work to read-only fallback mid-shift.

### Sync Visibility
- **D-18:** Sync state should always be visible during normal clinic use.
- **D-19:** Pending-but-not-broken sync work should use a calm persistent badge rather than repeated banners.
- **D-20:** Failed sync items should escalate into an actionable failure center, not vague generic warnings.
- **D-21:** Successful recovery after backlog sync should use a subtle recovery cue rather than loud celebration or total silence.

### Failure Ownership
- **D-22:** The originating user owns the first recovery attempt for a stuck or repeatedly failed sync item.
- **D-23:** Escalation happens after a guided retry fails, not immediately and not only by manual handoff.
- **D-24:** For safety-critical conflicts, the next escalation owner should be the assigned clinician.
- **D-36:** If a guided retry fails and the assigned clinician is also unreachable or their shift ends before acting, the stuck safety-critical item escalates further to any other on-duty clinician (not to Admin, and not left waiting indefinitely on the original clinician).

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
- `.planning/phases/06-invoicing-payments/06-CONTEXT.md` -- **D-41 already locks billing offline behavior**: Invoice Builder, Payment Collection, Quick Sale, Credit Note, Refund, and Billing Settings all block the action offline with a clear message and show only cached/read-only data. Phase 10's offline action boundaries (D-01 to D-04) deliberately do NOT extend to billing/payment -- the walk-in-to-payment golden-path proof (10-06-PLAN.md) must complete its invoice/payment step only after reconnect, not attempt offline invoice/payment capture.
- `.planning/phases/07-whatsapp-communication/07-CONTEXT.md` -- Reminder/retry/action-item patterns and WhatsApp-triggered clinic flows that must still line up under integration proof.
- `.planning/phases/08-scheduling-calendar/08-CONTEXT.md` -- Queue/scheduling coexistence and real-time handoff expectations that offline recovery must not break.
- `.planning/phases/09-web-dashboard-owner-portal/09-CONTEXT.md` -- Browser/mobile stale-state philosophy, owner portal, and broader Phase 9 integration surfaces that Phase 10 must prove end to end.

### Technology And Codebase Context
- `.planning/research/STACK.md` -- Planned stack including React Native/Expo, PostgreSQL, Redis, React Query, Zustand, Socket.IO, BullMQ, and the offline-first variant notes.
- `.planning/intel/codebase-map.md` -- **Stale as of the 2026-08-24 plan re-review.** Phases 1-9 are now merged to `main` (Phase 9 landed via PR #20 on 2026-08-23). Planning must target the actual shipped module structure below, not a greenfield assumption.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`apps/web/src/features/dashboard/components/StaleStateBanner.tsx`** already exists (Phase 9, D-40): a generic `status: 'stale' | 'conflict'` banner with `onRefresh`/`onReviewChanges` props. Plan 10-05's `useReplayStaleState.ts` should drive this existing component rather than build a parallel one.
- **`apps/api/src/modules/shared/browser-sync.service.ts`'s `BrowserSyncService.resolveStaleStatus`**, plus the `knownVersion` query-param pattern already used by `webQueueBoardQuerySchema` and the billing workbench query schema, are the existing versioning primitive for read-side staleness. Plan 10-05 should extend this same versioning scheme for replay broadcasts rather than inventing a second one.
- **Known gap to close, not just preserve:** a `no-mistakes` review of the Phase 9 branch (2026-08-22) found that `knownVersion` is read-only — no browser mutation path (`queue.schema.ts`'s `statusUpdateBodySchema`, billing's `collectPaymentBodySchema`, inventory's adjust schema) accepts or verifies an expected version before writing, so `StaleStateBanner`'s "conflict" state is never backed by a server-side rejection (a browser can silently overwrite a row that changed elsewhere). This finding was not part of Phase 9's auto-fix round and shipped as-is. D-05 ("review before overwrite, not silent last-write-wins") applies to the browser side of any offline-recovery race just as much as to mobile replay, so Plan 10-05 must add real optimistic-concurrency checks to these browser mutation paths, not only new prompt UI. See the corresponding edit in `10-05-PLAN.md`.
- Phase 3 queue flow, Phase 4 consultation/note-taking, Phase 5 inventory scanning, Phase 7 WhatsApp actions, and Phase 8 scheduling handoff are all now real, merged code (not planning targets) — read the actual modules under `apps/api/src/modules/` and `apps/mobile/src/features/` before extending them, rather than the pre-implementation assumptions in `10-RESEARCH.md`.

### Established Patterns
- Actual architecture is a modular monolith with REST endpoints, zod boundary validation, PostgreSQL RLS multi-tenancy, and event-driven realtime updates -- confirmed in the shipped code, not just planned.
- React Query + Zustand client patterns and a Socket.IO-based live update model are the existing baseline that offline replay and stale/conflict prompts must preserve.
- Mobile-first product posture means offline hardening centers on the mobile app; Phase 9's browser/web surfaces get replay-visibility (stale prompts) but not offline editing themselves, consistent with D-01's mobile-workflow scope.

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
