# PRD-10: Offline Hardening & Integration Polish

**Type:** Technical PRD
**Phase:** 10 - Offline Hardening & Integration Polish
**Status:** Draft
**Author:** Auto-generated
**Date:** 2026-08-03

---

## 1. Executive Summary

Phase 10 is the final hardening phase of Breeyo's v1 build. It does not introduce new user-facing features. Instead, it makes the existing system trustworthy under real-world connectivity conditions and proves that all modules -- built across Phases 1 through 9 -- work together end to end without data loss, broken handoffs, or silent corruption.

The phase delivers three capabilities: (1) robust offline support for core mobile workflows (patient check-in, barcode scanning, clinical note-taking), where offline actions are operationally real and not merely drafts; (2) structured conflict resolution and sync visibility so clinic staff always know whether their work is pending, conflicted, or safely caught up; and (3) verified integration proof that the complete system -- from walk-in check-in through invoice payment, including offline recovery and WhatsApp-triggered flows -- works reliably on mid-range Android hardware under flaky network conditions.

This phase satisfies requirements PLT-03 (offline auto-sync for core mobile flows) and PLT-07 (performance target verification on real hardware). It is the gate between development completion and Beta deployment to 20 pilot clinics.

---

## 2. Problem Statement

Breeyo targets solo veterinarians in Indian metro and Tier 1/2 cities. These clinics operate in environments where mobile connectivity is unreliable -- urban dead zones, crowded areas with degraded signal, ISP outages during business hours, and power-related network drops are routine. The primary users (Dr. Priya and her staff) work on mid-range Android devices and cannot afford to stop seeing patients because their app loses connectivity.

Phases 1 through 9 build Breeyo's feature set assuming a connected state. Without Phase 10:

- **Patient flow stops on network loss.** Check-in, the most time-critical clinic operation, fails if the server is unreachable. A front desk user cannot queue walk-in patients, and the vet cannot call the next patient into consultation.
- **Clinical data is at risk.** A vet writing SOAP notes during a consultation could lose work if connectivity drops mid-save. Worse, if two devices edit the same record while offline, a naive last-write-wins strategy could silently overwrite clinical data -- a safety concern.
- **Inventory truth degrades.** Barcode scanning and stock movements captured offline must reconcile cleanly with server-side FIFO batch logic. Without explicit reconciliation, stock counts diverge from reality.
- **Staff lose trust in the system.** If the app provides no visibility into sync state -- whether work is pending, stuck, or lost -- staff revert to paper as their source of truth, negating Breeyo's core value proposition.
- **Integration seams hide bugs.** Nine phases of module development create integration points (queue-to-consultation, consultation-to-invoice, invoice-to-payment, WhatsApp-to-booking) that have never been exercised as a complete flow under realistic conditions.

Phase 10 exists because reliability under real-world conditions is not optional for a medical practice management system. A clinic cannot be told "try again when you have better signal."

---

## 3. Target Users & Personas

### Primary: Dr. Priya -- Solo Vet / Admin

- **Context:** Conducting consultations in a clinic where connectivity drops several times a day. Needs to continue writing SOAP notes, recording vitals, and prescribing medications without interruption. Expects that her work syncs automatically when connectivity returns and that no clinical data is silently overwritten.
- **Phase 10 need:** Offline note-taking that feels indistinguishable from online use. Clear indication of sync state. Ownership of clinical conflict resolution when two devices edit the same consultation record.

### Primary: Receptionist Rekha -- Front Desk Staff

- **Context:** Managing the walk-in queue during a network outage. Patients are arriving, and she needs to check them in, see the queue, and call the next patient -- regardless of connectivity.
- **Phase 10 need:** Offline check-in that is operationally real (not a draft waiting for server confirmation). Queue state that is locally authoritative during disconnection and reconciles cleanly on reconnect. A calm badge that tells her sync status without interrupting her workflow.

### Secondary: Inventory Manager Inder

- **Context:** Receiving stock deliveries and scanning barcodes in a storage area with poor signal. Needs to complete the stock receipt workflow and trust that quantities will reconcile when he walks back into range.
- **Phase 10 need:** Full offline barcode scanning with local stock actions. Lighter conflict review for inventory discrepancies (compared to clinical records). Confidence that FIFO dispensing rules are preserved after reconciliation.

### Secondary: Clinic Owner (Web Dashboard)

- **Context:** Reviewing daily operations on the web dashboard while a mobile device is replaying offline backlog. Needs to know when data on the dashboard might be stale because a mobile device is still syncing.
- **Phase 10 need:** Stale-state prompts on the web dashboard when replay broadcasts indicate the underlying data has changed. No silent overwrites from the browser side.

---

## 4. Strategic Context

- **Beta gate:** Phase 10 is the final phase before Beta deployment to 20 pilot clinics. The offline hardening and integration proof delivered here determine whether Breeyo can be trusted in a real clinic environment. Shipping without this phase means shipping a system that works only under ideal network conditions -- a condition that does not describe Indian veterinary clinics.
- **Offline is a constraint, not a feature:** The project's constraints document (PROJECT.md) lists offline support as a hard requirement: "Core scanning and data entry must work offline with auto-sync on reconnect." This is not a nice-to-have optimization; it is a precondition for the product to function in its target market.
- **Trust over speed:** Phase 10 deliberately prioritizes data integrity over sync speed. The default conflict posture is review-before-overwrite (D-05), not silent last-write-wins. Clinical records receive the strongest protection (D-06) because they represent medical truth. This design choice accepts a small amount of friction (a conflict resolution step) in exchange for zero risk of silently corrupted medical records.
- **Integration proof as a quality bar:** The 10-phase build produces nine modules that must work together. Phase 10's integration proof requirement (D-25 through D-30) ensures that the complete walk-in-to-payment path, offline recovery drills, and WhatsApp-triggered flows all function correctly before the product ships. Issues found during proof runs are fixed in Phase 10 -- they are not deferred.
- **Mid-range Android reality:** The target hardware is a Galaxy A14 or Redmi Note 12 class device (Android 12+, 4GB RAM). Performance targets (cold start under 3 seconds, API p95 under 500ms, queue real-time update under 2 seconds) must be verified on this class of device, not on emulators or flagship phones (D-31).

---

## 5. Solution Overview

### 5.1 Offline Sync Engine

| Capability | Details |
|---|---|
| **Local operations ledger** | SQLite-backed (`expo-sqlite`) transactional queue for all offline writes. Each operation is domain-tagged (queue, EMR, inventory) and carries a `deviceId + operationId` pair for idempotent replay. |
| **Same-day working-set cache** (D-15, D-16) | On-device cache of today's operational data: current queue state, active patients, today's consultations and drafts, and inventory items in motion. Historical records outside the working set are available only as limited read-only fallback context (D-17). |
| **Operationally real offline actions** (D-01, D-03) | Offline queue entries, clinical notes, and stock movements are locally authoritative. They are not drafts or placeholders -- the staff member can act on them immediately. |
| **Queued external-service actions** (D-02) | Actions requiring live external services (payment processing, WhatsApp delivery) are captured locally when safe and queued for sync when connectivity returns, rather than being blocked. |

### 5.2 Reconnect & Replay

| Capability | Details |
|---|---|
| **Queue-first replay** (D-12) | On reconnect, queue actions (check-in, status changes, call-next) sync before any other domain's backlog. The clinic's patient flow is the highest-priority operational truth to restore. |
| **Priority-tiered backlog** (D-13, D-14) | After queue actions, remaining backlog replays by operational priority tier (clinical records before inventory adjustments, inventory before analytics), not by raw timestamp. Higher-priority work can preempt lower-priority replay mid-stream. |
| **Idempotent server ingestion** | The API's sync module validates replay envelopes, deduplicates by `deviceId + operationId`, and applies domain-specific validation before committing. Replaying the same operation twice produces the same outcome. |
| **Replay broadcasts** | After successful replay, Socket.IO broadcasts notify other connected clients (mobile and web) that specific data has changed, triggering stale-state review prompts rather than silent overwrites. |

### 5.3 Conflict Handling

| Capability | Details |
|---|---|
| **Review before overwrite** (D-05) | The default conflict posture. When the server detects that a record has been modified since the offline device last read it, a conflict record is created instead of silently applying last-write-wins. |
| **Clinical conflict resolution** (D-06, D-08, D-09) | Clinical records (consultations, SOAP notes, prescriptions) receive the strongest protection. Conflicts surface as a structured resolution sheet comparing local and server state field by field. The assigned clinician owns resolution when possible. |
| **Queue and inventory conflict review** (D-10) | Queue entry and inventory conflicts use a lighter operational review flow -- still explicit, but without the full structured comparison sheet required for clinical records. |
| **Safe auto-merge** (D-07) | Auto-merge is permitted only for clearly non-destructive cases (e.g., appending to a list where no existing item was modified). Broad automatic merging is not allowed. |
| **Persistent conflict visibility** (D-11) | Unresolved conflicts remain visible in the UI until the responsible user explicitly resolves them. They do not time out or disappear. |

### 5.4 Sync Visibility & Failure Ownership

| Capability | Details |
|---|---|
| **Calm persistent badge** (D-18, D-19) | Sync state is always visible during normal clinic use. Pending-but-healthy sync work shows as a non-intrusive badge (e.g., a small indicator on the navigation bar), not as repeated banners or modals. |
| **Actionable failure center** (D-20) | When sync items fail, they escalate into a dedicated failure center screen that lists each failed item with its domain, error context, and available actions (retry, review, escalate). No vague generic warnings. |
| **Subtle recovery cue** (D-21) | After backlog sync completes successfully, the UI shows a brief, subtle confirmation (e.g., badge clears with a brief checkmark animation) rather than a loud celebration or total silence. |
| **Originating user owns first retry** (D-22) | The user who created the offline action is responsible for the first recovery attempt if sync fails. The failure center guides them through retry steps. |
| **Guided escalation** (D-23, D-24) | Escalation happens only after guided retry fails, not immediately. For safety-critical items (clinical conflicts), the escalation path leads to the assigned clinician. |

### 5.5 Offline Capabilities by Domain

| Domain | Offline Capability | Reconnect Behavior |
|---|---|---|
| **Queue** (Phase 3) | Check-in new patients, update queue status, call next patient. Offline entries are operationally real with local position assignment. | Queue actions replay first. Position conflicts resolved via lightweight operational review. |
| **EMR** (Phase 4) | Create and edit SOAP notes, record vitals, write prescriptions, save consultation drafts. Full clinical note-taking without connectivity. | Clinical records replay after queue. Conflicts use structured resolution sheet with clinician ownership. |
| **Inventory** (Phase 5) | Barcode scanning, stock receipt, manual stock adjustment. Full local stock actions on-device. | Stock movements reconcile with server-side FIFO batch logic. Quantity conflicts use lighter operational review. |
| **Billing** (Phase 6) | Invoice can be drafted from consultation and dispensed items. Payment capture queued for sync. | Invoice state replays after clinical and inventory data. Payment gateway actions execute on reconnect. |

### 5.6 Integration Proof

| Proof Area | Description |
|---|---|
| **Walk-in-to-payment golden path** (D-25) | End-to-end flow: patient arrives, check-in, queue management, consultation (SOAP notes, prescription, dispense), invoice generation, payment via Razorpay -- verified across mobile and web surfaces. |
| **Offline recovery drills** (D-26, D-27, D-33) | Real disconnect/reconnect drills (not mocked) with multiple drop/recover cycles. Includes several-hour offline stretches (D-32) on mid-range Android under flaky network conditions (D-31). |
| **WhatsApp-triggered clinic flow** (D-29) | A pet owner initiates a booking via WhatsApp, the appointment appears in the queue, the patient is seen, and the workflow completes through invoicing -- verified as a second mandatory proof path. |
| **Fix-before-ship bar** (D-28, D-30) | Issues found during integration proof are fixed in Phase 10. Integrity issues are fixed first. Even non-critical issues must be resolved before the phase is marked complete. |

### 5.7 Performance Verification

| Target | Threshold | Measurement |
|---|---|---|
| **Mobile app cold start** | < 3 seconds | Measured on real mid-range Android (Galaxy A14 / Redmi Note 12 class, 4GB RAM) via Maestro measurement flow. |
| **API p95 response time** | < 500ms | Measured across all major endpoint groups (auth, queue, EMR, inventory, billing, sync) via Vitest benchmark harness. |
| **Queue real-time update latency** | < 2 seconds | Measured as time from queue state change to UI update on a connected client, under representative data load. |

---

## 6. Success Metrics

| # | Metric | Target | Measurement |
|---|---|---|---|
| 1 | **Offline check-in reliability** | User can check in patients, update queue status, and call next patient while fully offline; all data syncs correctly on reconnect | Automated integration tests + manual disconnect drills on real device |
| 2 | **Offline barcode scanning** | User can scan barcodes and perform stock actions offline; quantities reconcile correctly with server-side FIFO logic on reconnect | Automated replay tests + manual verification with real scanner |
| 3 | **Offline clinical note-taking** | User can create and edit SOAP notes, vitals, and prescriptions offline; data syncs without loss on reconnect | Automated draft replay tests + manual multi-hour offline session |
| 4 | **Conflict resolution integrity** | No data is silently lost or overwritten during sync; clinical conflicts surface structured resolution sheet; queue/inventory conflicts surface operational review | Concurrent-edit test scenarios (two devices editing same record offline) |
| 5 | **Sync visibility** | Staff can always determine sync state (synced, pending, failed) from any screen; failed items appear in actionable failure center | UI verification across all sync states |
| 6 | **Multi-hour offline survival** | App remains meaningfully usable for several continuous hours offline on mid-range Android | Manual endurance test on real device (D-32) |
| 7 | **Multiple drop/recover cycles** | System handles repeated connectivity drops and reconnections without data loss or corrupted state | Manual drill with 5+ drop/recover cycles (D-33) |
| 8 | **Walk-in-to-payment golden path** | Complete end-to-end flow succeeds without errors across mobile and web | Automated integration harness + human verification |
| 9 | **WhatsApp-triggered flow** | WhatsApp booking through consultation and invoicing completes as second proof path | Automated + human verification |
| 10 | **Cold start performance** | < 3 seconds on mid-range Android (Galaxy A14 / Redmi Note 12 class) | Maestro measurement on real device |
| 11 | **API p95 latency** | < 500ms across all endpoint groups | Vitest benchmark harness with representative data |
| 12 | **Queue real-time latency** | < 2 seconds from state change to UI update | Benchmark under representative load |

---

## 7. User Stories & Requirements

### Offline Sync

| ID | Story | Acceptance Criteria |
|---|---|---|
| PLT-03 | As a front desk user, I want to check in walk-in patients even when the clinic's internet is down, so that patient flow is never interrupted by connectivity issues. | Check-in creates a locally authoritative queue entry. Queue position is assigned locally. Entry syncs to server on reconnect. No duplicate entries after sync. |
| PLT-03 | As a vet, I want to write clinical notes during a consultation without worrying about connectivity, so that I can focus on the patient instead of the network. | SOAP notes, vitals, and prescriptions are saved locally via the operations ledger. Drafts auto-save. All data replays to the server on reconnect with no content loss. |
| PLT-03 | As an inventory manager, I want to scan barcodes and record stock receipts in the storage area where there is no signal, so that I can finish my work without walking back and forth to find connectivity. | Barcode scanning works offline using cached item data. Stock movements are recorded locally. On reconnect, movements reconcile with server-side FIFO batch logic. Quantity discrepancies surface for review. |

### Conflict Resolution

| ID | Story | Acceptance Criteria |
|---|---|---|
| PLT-03 | As a vet, I want to review conflicts in my clinical records before they are overwritten, so that no medical information is lost due to a sync collision. | When the server detects a conflict on a clinical record, a structured resolution sheet is presented comparing local and server state. The assigned clinician resolves the conflict. Record is not updated until resolution is complete. |
| PLT-03 | As a front desk user, I want queue conflicts to be quick to resolve, so that patient flow is not delayed by complex conflict resolution. | Queue conflicts (e.g., two devices changed the same entry's status) surface via a lightweight operational review card. Resolution requires a single-tap choice, not a full field-by-field comparison. |
| PLT-03 | As a user, I want unresolved conflicts to stay visible until I handle them, so that nothing silently falls through the cracks. | Unresolved conflicts persist in the failure center and on relevant screens until explicitly resolved. They do not auto-dismiss or time out. |

### Sync Visibility

| ID | Story | Acceptance Criteria |
|---|---|---|
| PLT-03 | As clinic staff, I want to see at a glance whether my work is synced, pending, or stuck, so that I can trust the system with my data. | A persistent sync badge is visible during normal use. Pending items show a calm count. Failed items escalate to the failure center with actionable context. Successful recovery clears the badge with a subtle confirmation. |
| PLT-03 | As a user who created an offline action that failed to sync, I want guided steps to retry before the problem is escalated to someone else, so that I can fix routine issues myself. | The failure center presents the failed item with error context and a guided retry action. Escalation to another user (or the clinician for clinical items) happens only after the guided retry fails. |

### Integration Proof

| ID | Story | Acceptance Criteria |
|---|---|---|
| PLT-03 | As a clinic owner, I want confidence that the entire system works together, so that I can trust Breeyo for daily operations. | Walk-in-to-payment golden path completes without errors. Offline recovery drills with multiple drop/recover cycles succeed. WhatsApp-triggered clinic flow completes as a second proof path. All issues found are fixed before sign-off. |

### Performance

| ID | Story | Acceptance Criteria |
|---|---|---|
| PLT-07 | As a vet using a mid-range Android phone, I want the app to start quickly and respond promptly, so that technology does not slow down my patient care. | Cold start under 3 seconds on Galaxy A14 / Redmi Note 12 class device. API p95 under 500ms. Queue real-time update under 2 seconds. All targets verified on real hardware, not emulators. |

---

## 8. Out of Scope

The following are explicitly excluded from Phase 10:

- **New user-facing features.** Phase 10 hardens and integrates existing functionality. No new modules, screens, or workflows are introduced.
- **Full historical offline access.** The offline data window is limited to the same-day working set (D-15). Broad offline access to historical EMR records, past invoices, or archived queue data is not in scope. Older data may be available as limited read-only fallback context only.
- **Web/browser offline support.** Offline hardening targets the mobile app (D-31, PROJECT.md mobile-first constraint). The web dashboard receives stale-state prompts when mobile devices replay data, but the browser itself does not gain offline editing capability.
- **Automatic conflict resolution for clinical records.** Clinical conflicts always require human review (D-06). There is no auto-merge path for SOAP notes, prescriptions, or vitals, even when the changes appear non-overlapping.
- **Offline payment processing.** Payments require a live connection to Razorpay. Offline invoices can be created and payment intent can be captured locally, but actual payment execution happens only when connectivity is available.
- **Multi-day offline persistence.** The system is designed for same-day offline survival (D-15, D-16). Multi-day offline operation (e.g., clinic operates for 3 days without internet) is not a target, though work created during an extended outage will still attempt to sync when connectivity returns.
- **Background sync when app is killed.** Sync occurs when the app is foregrounded or in the active background state. System-level background sync (via background fetch APIs) is not in scope.
- **Performance optimization beyond target thresholds.** The goal is to verify that performance targets are met, not to optimize beyond them. If cold start is 2.8 seconds, that passes -- further optimization is not required.
- **Load testing for scale beyond 20 clinics.** Performance verification targets the Beta pilot scale. Horizontal scaling, connection pooling under high concurrency, and multi-region deployment are post-Beta concerns.

---

## 9. Dependencies & Risks

### Dependencies

| Dependency | Type | Impact |
|---|---|---|
| **Phase 9 completion** | Phase dependency | All nine prior phases must be implemented before Phase 10 can begin. Offline hardening wraps existing modules; integration proof exercises existing cross-module flows. |
| **expo-sqlite** | Technical | The local operations ledger and same-day working-set cache depend on expo-sqlite for transactional local storage. |
| **Mid-range Android test device** | Hardware | Performance verification (PLT-07) and offline drills (D-31) require a physical Galaxy A14, Redmi Note 12, or equivalent device. Emulators are insufficient for final sign-off. |
| **Flaky network simulation** | Testing infrastructure | Offline drills must use real disconnect/reconnect conditions (D-27), not only mocked network state. Requires either a physical network toggle or a reliable network conditioning tool on the test device. |
| **Socket.IO + Redis** | Infrastructure | Replay broadcasts depend on the existing real-time infrastructure. Redis must be available for both the sync retry queue (BullMQ) and live update broadcasts. |
| **Razorpay sandbox** | External service | End-to-end golden path includes payment. Integration proof requires a working Razorpay sandbox environment for the payment step. |
| **WhatsApp simulator** | Internal service | WhatsApp-triggered proof path (D-29) depends on the WhatsApp simulator module built in Phase 7 being functional. |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Conflict resolution UX adds too much friction** | Medium | Medium -- staff avoid resolving conflicts, leading to a growing backlog of unresolved items | Design the resolution sheet for speed: pre-select the most likely correct version, allow single-tap resolution for non-clinical domains, and track resolution time to identify UX bottlenecks. |
| **SQLite storage limits on mid-range devices** | Low | Medium -- same-day working set exceeds available storage on low-storage devices | The same-day scope (D-15) limits the data window intentionally. Monitor storage usage during testing. Implement cache eviction for data older than the current working day. |
| **Replay ordering creates subtle data inconsistencies** | Medium | High -- e.g., an invoice references a consultation that has not replayed yet | Enforce replay dependency ordering within the sync coordinator: queue actions first, then clinical records, then inventory, then billing. Validate foreign key dependencies before committing replay operations. |
| **Real-device performance fails to meet targets** | Medium | High -- blocks Phase 10 completion | Identify bottleneck category early (bundle size, render performance, API latency, SQLite query time). Maintain profiling checkpoints throughout the phase, not only at the end. |
| **Multi-hour offline test reveals memory leaks** | Medium | High -- app becomes unusable during extended offline sessions | Profile memory usage during offline endurance testing. Implement periodic cache trimming for the operations ledger (remove successfully synced operations). |
| **Integration proof uncovers bugs in earlier phases** | High | Medium -- fixing earlier-phase bugs delays Phase 10 completion | Accepted risk per D-28: integrity issues are fixed first, even if they originated in a prior phase. Budget time for cross-phase bug fixes. |
| **Concurrent conflict scenarios are hard to reproduce reliably** | Medium | Medium -- test coverage gaps in conflict resolution paths | Build deterministic test fixtures that simulate two-device concurrent edits. Use time-controlled test sequences rather than relying on race conditions. |

---

## 10. Open Questions

| # | Question | Context | Owner |
|---|---|---|---|
| 1 | What is the exact threshold for safe auto-merge versus mandatory review? | D-07 allows auto-merge for "clearly non-destructive cases" but the specific rules (e.g., appending to a list, updating non-overlapping fields) need to be defined per domain. | Engineering |
| 2 | How long should a guided retry cycle run before escalation triggers? | D-22 and D-23 establish the flow (user retries first, then escalation) but the timing thresholds (e.g., 3 retries over 15 minutes) are not specified. | Product + Engineering |
| 3 | What is the eviction policy for the same-day working-set cache? | D-15 targets same-day data, but the exact midnight rollover behavior (clear immediately? keep until next sync?) and handling of in-progress consultations that span midnight need definition. | Engineering |
| 4 | Should the web dashboard show a global sync indicator when any mobile device is replaying? | D-18 says sync state should always be visible, but it is unclear whether this extends to showing other devices' sync status on the web dashboard. | Product |
| 5 | How should the system handle queue conflicts where two devices assigned different positions to the same patient? | Queue replay is highest priority (D-12), but the specific merge strategy for position conflicts (server wins? latest device wins? prompt front desk?) needs definition. | Product + Engineering |
| 6 | What happens to offline data if the user logs out while disconnected? | Offline operations are tied to a user session. If the user logs out offline, should pending operations be preserved for sync on next login, or discarded? | Product |
| 7 | Is there a maximum size for the operations ledger before the app warns the user? | Extended offline periods could accumulate a large backlog. Should the app surface a warning (e.g., "200 pending operations -- reconnect soon") at some threshold? | Product + Engineering |
| 8 | Which mid-range Android devices are representative for the performance verification checkpoint? | D-31 names "mid-range Android" but the exact device list for hardware verification needs confirmation (Galaxy A14, Redmi Note 12, or others available to the team). | Engineering + QA |

---

*This is a Technical PRD for reliability hardening and integration verification. It does not introduce new user-facing features. Detailed technical architecture lives in the phase research document and implementation plans.*
