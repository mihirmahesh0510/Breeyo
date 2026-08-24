# Phase 10: Offline Hardening & Integration Polish - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-05-07
**Phase:** 10-offline-hardening-integration-polish
**Areas discussed:** Conflict handling, Offline action boundaries, Sync visibility, Integration proof, Reconnect priority, Offline data window, Failure ownership, Test environment bar

---

## Conflict handling

| Option | Description | Selected |
|--------|-------------|----------|
| Review before overwrite | Staff review required for meaningful conflicts | ✓ |
| Auto-merge where possible | Prefer broad automatic combination of changes | |
| Last write wins | Latest change silently overwrites older state | |

**User's choice:** Review before overwrite.
**Notes:** Clinical records are the most conflict-sensitive. Safe auto-merge is allowed only for clearly non-destructive cases. Conflict review should use a structured resolution sheet. Clinical conflict escalation should land with the assigned clinician. Queue and inventory conflicts can use lighter flows, but unresolved conflicts stay visible until cleared.

---

## Offline action boundaries

| Option | Description | Selected |
|--------|-------------|----------|
| Fully editable offline | Core named mobile workflows work end to end offline | ✓ |
| Draft-first offline | Some actions only become real after reconnect | |
| Mixed by workflow | Different named flows stop at different offline stages | |

**User's choice:** Fully editable offline.
**Notes:** Actions needing external or realtime coordination should queue for sync later when safe. Offline queue entries are operationally real locally. Barcode scanning and stock updates should support full local stock actions.

---

## Sync visibility

| Option | Description | Selected |
|--------|-------------|----------|
| Always visible | Sync state is always present in the app | ✓ |
| Only when something is wrong | Hide sync unless it fails | |
| Mostly background | Sync is mostly invisible | |

**User's choice:** Always visible.
**Notes:** Pending sync uses a calm persistent badge. Failures escalate into an actionable failure center. Successful recovery gets only a subtle cue.

---

## Integration proof

| Option | Description | Selected |
|--------|-------------|----------|
| Broader than one golden path | Prove more than a single happy-path flow | ✓ |
| Single golden path | Only the main walk-in-to-payment flow is required | |
| Very broad matrix | Nearly every major combination must be proven | |

**User's choice:** Broader than one golden path.
**Notes:** Offline recovery is the most important additional proof area. Real disconnect/reconnect drills are mandatory. Integrity comes before polish when issues are found. The second mandatory proof path after offline recovery is a WhatsApp-triggered clinic flow. Even non-critical integration issues should be fixed before Phase 10 is called done.

---

## Reconnect priority

| Option | Description | Selected |
|--------|-------------|----------|
| Queue actions first | Reconnect prioritizes live operational queue work | ✓ |
| Clinical notes first | Reconnect prioritizes medical note integrity first | |
| Strict created-order | Reconnect replays everything in original capture order | |

**User's choice:** Queue actions first.
**Notes:** After queue work, the backlog should replay in operational priority tiers rather than raw timestamp order. Higher-priority work can preempt lower-priority replay during reconnect.

---

## Offline data window

| Option | Description | Selected |
|--------|-------------|----------|
| Same-day working set | Cache the records most likely needed for today's clinic work | ✓ |
| Only current screens | Keep offline data very narrow | |
| Broad clinic slice | Cache a much wider clinic footprint offline | |

**User's choice:** Same-day working set.
**Notes:** The app should aggressively cache today's operational records first. Older data outside that working set can remain available only as limited fallback read-only context.

---

## Failure ownership

| Option | Description | Selected |
|--------|-------------|----------|
| The originating user | The creator owns first recovery attempt | ✓ |
| Front Desk | Operational staff own most sync cleanup | |
| Admin | Admin gets the first failure queue | |

**User's choice:** The originating user.
**Notes:** Escalation should happen after a guided retry fails. For the most safety-critical conflicts, the next escalation owner should be the assigned clinician.

---

## Test environment bar

| Option | Description | Selected |
|--------|-------------|----------|
| Mid-range Android + flaky network | Real proof on target hardware and unstable connectivity | ✓ |
| Any modern phone | Hardware realism matters less | |
| Mostly emulator/simulator | Controlled environments are sufficient | |

**User's choice:** Mid-range Android + flaky network.
**Notes:** The app should survive several hours offline in a meaningful way, and proof runs should include multiple drop/recover cycles rather than one clean reconnect.

---

## the agent's Discretion

- Exact sync-queue storage and retry orchestration mechanics
- Exact visual treatment of sync badges, failure center, and resolution-sheet UI
- Exact safe-auto-merge thresholds outside the explicitly protected clinical domain

## Deferred Ideas

None — discussion stayed within Phase 10 scope.

---

## Plan Review Follow-Up (2026-08-20)

Four product gaps surfaced during `/breeyo-build --review phase 10` that D-01 to D-33 didn't resolve. A fifth candidate gap (offline billing/payment scope) turned out to already be answered by Phase 6's D-41 (billing blocked offline with a clear message) — not re-litigated here, just cross-referenced into 10-CONTEXT.md's canonical refs.

### Duplicate offline check-in (same patient, two devices)

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-merge into one entry | Quiet merge, lightweight review per D-10 | ✓ |
| Keep both, staff reviews | Both entries persist pending manual review | |
| Auto-merge silently, no review | Combine with no trace at all | |

**User's choice:** Auto-merge into one entry. Recorded as **D-34**.

### Same-day window at midnight rollover

| Option | Description | Selected |
|--------|-------------|----------|
| Anchor "today" to when offline began | Working set stays editable through the outage regardless of date rollover | ✓ |
| Roll over at local midnight regardless | Prior-day data demotes to read-only fallback at midnight even while still offline | |

**User's choice:** Anchor to when offline began. Recorded as **D-35**.

### Escalation backstop beyond the assigned clinician

| Option | Description | Selected |
|--------|-------------|----------|
| Any other on-duty clinician | Escalates further rather than stalling on one unreachable person | ✓ |
| Clinic Admin | Falls back to Admin as catch-all owner | |
| Stays with original clinician indefinitely | No further escalation tier | |

**User's choice:** Any other on-duty clinician. Recorded as **D-36**.

### Queue-first ordering vs. safety-critical severity

| Option | Description | Selected |
|--------|-------------|----------|
| Queue always first, no exception | Matches locked D-12 to D-14; safety-critical items stay visible but wait their tier | ✓ |
| Safety-critical severity can preempt queue tier | Carves out a severity-based exception to tier ordering | |

**User's choice:** Queue always first, no exception. Recorded as **D-37**.

---

## Plan Re-Review After Phase 9 Merge (2026-08-24)

Phase 9 merged to `main` on 2026-08-23 (PR #20) after an independent `no-mistakes` code review caught and fixed real bugs (missing RLS on 5 new tables, unenforced browser-module toggles, a Clinician browser-access bypass, a racy session-state upsert). Re-ran the Phase 10 plan review against the actual shipped code instead of the pre-implementation assumptions in `10-RESEARCH.md`/`10-CONTEXT.md`.

**No new product decision needed**, but one gap required a plan fix, applied directly (not a product judgment call — it follows straight from the already-locked D-05):

- Phase 9's `StaleStateBanner`/`knownVersion` mechanism only computes staleness for **reads**; no browser mutation path (queue status update, billing collect/refund/void, inventory adjust) checks a version before writing, so the "conflict" banner state is never backed by a real rejection. This was flagged by the `no-mistakes` review as a Warning-severity finding and was not part of Phase 9's auto-fix round, so it shipped as-is. Since D-05 requires review-before-overwrite (not silent last-write-wins) and Phase 10 owns closing exactly this kind of gap, `10-05-PLAN.md` Task 2 was extended to add real `expectedVersion` enforcement to the browser write paths, not just new prompt UI. `10-CONTEXT.md`'s Reusable Assets section and `10-VALIDATION.md`'s 10-05-02 row were updated to match.
