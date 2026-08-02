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
