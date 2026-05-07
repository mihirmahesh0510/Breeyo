# Phase 9: Web Dashboard & Owner Portal - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-05-07
**Phase:** 09-web-dashboard-owner-portal
**Areas discussed:** Dashboard home, Web permissions, Portal home, Portal navigation, Module detail depth, Realtime alerts, Portal trust flow, Record language, Inventory web workflow, Cross-device coexistence, Owner payment journey, Portal support boundaries

---

## Dashboard home

| Option | Description | Selected |
|--------|-------------|----------|
| Operations cockpit | Browser lands on a live clinic control center | ✓ |
| Schedule-first workspace | Browser lands mainly on scheduling | |
| Module switchboard | Browser lands on a routing page with module cards | |

**User's choice:** Operations cockpit.
**Notes:** Mixed equal panels above the fold, action-heavy home, today-first horizon, alerts first in scroll order, queue/schedule stay separate, per-user panel reordering only, module-local search, no persistent activity feed, and web home can surface WhatsApp/portal exceptions.

---

## Web permissions

| Option | Description | Selected |
|--------|-------------|----------|
| Admin-only browser | Only admins use the browser | |
| Configurable Admin + Front Desk | Browser access includes Front Desk when enabled by clinic config | ✓ |
| All staff role-limited | Every staff role can use browser surfaces | |

**User's choice:** Admin by default, with configurable Front Desk browser access.
**Notes:** Clinicians have no Phase 9 browser access. Front Desk can manage queue, billing, and scheduling when enabled, but inventory is view-only. Admin alone handles users/roles/permissions, refunds/voids stay Admin-only, unauthorized modules are hidden, and sensitive browser actions need strong confirmations with visible actor attribution.

---

## Portal home

| Option | Description | Selected |
|--------|-------------|----------|
| Owner overview | Home balances pets, records, and invoices | ✓ |
| Pay-first screen | Payment dominates the first screen | |
| Pet record first | Home opens straight into medical history | |

**User's choice:** Owner overview.
**Notes:** Payment and records should get equal emphasis when money is due. Pet snapshot cards and rich medical preview belong above the fold. If no balance is due, records lead. Multiple unpaid invoices should show a total due plus list. Contact/help stays always visible, context is remembered within the valid link window, and trust messaging stays explicit.

---

## Portal navigation

| Option | Description | Selected |
|--------|-------------|----------|
| Top-level tabs | Clear owner-level sections | ✓ |
| Single long page | One scrolling portal | |
| Pet-first switcher only | Navigation is driven almost entirely by pet pages | |

**User's choice:** Top-level tabs.
**Notes:** Multi-pet owners use a pet switcher. Invoices are browsed under each pet, but deep links open their target first and the full portal remains reachable afterward. Medical history is a visit timeline. Payments stay within invoice flows. Expired links go to an expired screen with reissue.

---

## Module detail depth

| Option | Description | Selected |
|--------|-------------|----------|
| Full web depth | Browser modules are strong operational surfaces | ✓ |
| Mixed by module | Some modules go deep, others stay light | |
| Mostly lighter views | Browser is mostly oversight | |

**User's choice:** Full web depth.
**Notes:** Inventory gets the deepest browser treatment first. Queue and scheduling are still operational but lighter than inventory. User management should be core-admin complete, not a broad staffing platform.

---

## Realtime alerts

| Option | Description | Selected |
|--------|-------------|----------|
| Inline first | Live changes appear mostly in-place | ✓ |
| Toast-heavy | Frequent interruptive alerts | |
| Quiet badges only | Mostly passive status changes | |

**User's choice:** Inline first.
**Notes:** Interruptive alerts are for failures/action blockers only. Alerts fade after being seen. No unified alert-center workflow in Phase 9 -- use home and module-local alerting.

---

## Portal trust flow

| Option | Description | Selected |
|--------|-------------|----------|
| Clear trust banner | Explain secure magic-link access in plain language | ✓ |
| Guided intro screen | Dedicated pre-portal explanation | |
| Minimal explanation | Keep trust details subtle | |

**User's choice:** Clear trust banner.
**Notes:** Payment uses an explicit handoff to the external provider, expired links should be recoverable from inside the portal, and trust messaging should reassure without feeling technical.

---

## Record language

| Option | Description | Selected |
|--------|-------------|----------|
| Mixed clinical + plain | Keep real clinic terms while adding owner-helpful wording | ✓ |
| Mostly clinical | Show records almost as-is | |
| Mostly simplified | Heavily rewrite the record voice for owners | |

**User's choice:** Mixed clinical + plain.
**Notes:** Prescriptions should use simple usage cards. Diagnoses get a short plain-language gloss. Abbreviations should be expanded where shown. Guidance should stay light rather than turning the portal into a coaching layer.

---

## Inventory web workflow

| Option | Description | Selected |
|--------|-------------|----------|
| Operations + analysis | Browser inventory is both operational and analytical | ✓ |
| Analysis first | Browser is mainly reporting/reorder review | |
| Operations first | Browser is mainly a stock-operations workspace | |

**User's choice:** Operations + analysis.
**Notes:** Inventory should cover stock/batches, reordering, and analytics together in one module with sub-tabs. Stock + Batches is the default tab. Direct table actions are welcome, but high-risk changes need stronger steps. Reordering and analytics should connect directly back into operations. CSV and PDF exports are in scope. Scanning stays mobile-first.

---

## Cross-device coexistence

| Option | Description | Selected |
|--------|-------------|----------|
| Role-shaped split | Browser/mobile responsibility depends on role and context | ✓ |
| Near-full parity | Both devices do most things equally | |
| Mobile still primary | Browser remains secondary for most work | |

**User's choice:** Role-shaped split.
**Notes:** Device default is role-dependent. Live updates should sync across browser and mobile, with conflict prompts when edits collide. Browser should keep the same workflow meanings as mobile rather than inventing a different product logic.

---

## Owner payment journey

| Option | Description | Selected |
|--------|-------------|----------|
| Pick one or many | Owners can pay a single invoice or combine multiple | ✓ |
| One invoice at a time | Each invoice is paid separately | |
| Auto-total all due | Portal defaults owners into paying everything due | |

**User's choice:** Pick one or many.
**Notes:** Multiple selected invoices should use one combined checkout with a clear breakdown. After success, owners see a success summary plus receipts. Failed or interrupted payments should return to the portal with retry choices and clinic contact paths.

---

## Portal support boundaries

| Option | Description | Selected |
|--------|-------------|----------|
| Link + payment recovery | Practical self-service without broad support tooling | ✓ |
| Broader support toolkit | Add richer support/reporting actions | |
| Very strict scope | Read/pay only with little self-service help | |

**User's choice:** Link + payment recovery.
**Notes:** Contact escalation should always be available. Phase 9 should not add structured correction-request or support-case workflows. The portal should try to help first, then hand off to humans when needed.

---

## the agent's Discretion

- Exact browser component composition and information density within the chosen workflow boundaries.
- Exact copy for trust banners, receipts, and light guidance text.
- Exact real-time transport and conflict-resolution implementation details.

## Deferred Ideas

- Unified alert center across modules
- Structured owner correction requests or support cases
- Clinician browser workflows in a later phase
- Browser-first replacement of mobile scanning/on-floor inventory actions
