# Phase 9: Web Dashboard & Owner Portal - Context

**Gathered:** 2026-05-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Build Breeyo's browser-based admin surface and owner web portal on top of the already-defined mobile, billing, scheduling, inventory, and WhatsApp foundations. This phase delivers a full-depth web dashboard for clinic operations and management, plus a no-login owner portal reached through WhatsApp magic links where owners can view read-only pet records, inspect invoices, and pay outstanding balances. Mobile remains strongest for on-the-floor and in-consult work, but the browser becomes a serious day-to-day operational surface for approved desk/admin roles.

</domain>

<decisions>
## Implementation Decisions

### Dashboard Home
- **D-01:** The browser dashboard lands on an operations cockpit, not a static module switchboard or a schedule-only page.
- **D-02:** Above the fold, queue, scheduling, billing, inventory, and user-management awareness should feel balanced rather than dominated by one module.
- **D-03:** The home screen is action-heavy. Admins and approved staff should be able to take meaningful quick actions directly from the home surface.
- **D-04:** The default time horizon is today-first. Future planning lives behind deeper scheduling and inventory views.
- **D-05:** The browser home uses scrollable priority sections rather than a rigid fixed desktop grid.
- **D-06:** Alerts and exceptions appear first in the scroll order, ahead of the rest of the operational summaries.
- **D-07:** Queue and scheduling remain separate panels on the browser home. Do not collapse them into one blended operational board.
- **D-08:** The home screen should expose action-ready snippets instead of rich analytics-heavy dashboards. Show enough detail to decide the next click.
- **D-09:** Browser home does not include a persistent clinic-wide activity feed. Live activity should stay inside the relevant modules.
- **D-10:** Browser search stays module-local rather than introducing a persistent global command bar in Phase 9.
- **D-11:** User management should appear on home as an inline mini-panel for awareness and quick follow-through, not only as a deep settings page.
- **D-12:** Owner portal issues should surface on home only as exception cases needing staff attention.
- **D-13:** Phase 7 WhatsApp issues should also surface on the browser home as action exceptions, even though the main communications workflow remains mobile-first.
- **D-14:** Home configuration is partially personal: users can reorder the clinic-defined panel set, but should not fully redesign or remove the core operational panels.

### Browser Access And Permissions
- **D-15:** Admin has browser access by default. Clinicians do not get browser access in Phase 9.
- **D-16:** Front Desk browser access is supported, but it is clinic-configurable and disabled by default until an admin enables it.
- **D-17:** When enabled, Front Desk can actively manage queue, billing, and scheduling in the browser.
- **D-18:** For Front Desk, inventory is visible in the browser but remains view-only.
- **D-19:** Browser permissions are configured through per-role module toggles rather than per-user custom rule sets.
- **D-20:** Modules or actions a browser user cannot access should be hidden rather than shown as locked placeholders.
- **D-21:** User management, role changes, and permission administration stay Admin-only.
- **D-22:** Refunds and invoice voids stay Admin-only even when Front Desk has broader browser access for routine billing work.
- **D-23:** High-risk browser actions use strong confirmation steps, while ordinary operational edits should stay fast.
- **D-24:** Sensitive operational changes should always show the acting user clearly in the UI and history, not only in backend logs.

### Module Depth
- **D-25:** Phase 9 web modules should be full-depth operational surfaces overall, not just light monitoring pages.
- **D-26:** Inventory gets the richest browser workflow depth first.
- **D-27:** Queue and scheduling are still operational on the browser, but simpler than inventory in Phase 9.
- **D-28:** User management should be core-admin complete, but not expand into a much broader staffing platform in this phase.

### Inventory Web Workflow
- **D-29:** Browser inventory should optimize for both operations and analysis, not only one of them.
- **D-30:** The inventory web module must cover all three of these well: batch/stock management, reordering workflow, and inventory analytics -- while still staying clean and intuitive.
- **D-31:** Inventory stays one module with sub-tabs, not three separate top-level browser areas.
- **D-32:** The default inventory browser sub-tab is Stock + Batches.
- **D-33:** The stock-and-batches browser view supports direct table actions for normal work.
- **D-34:** High-risk stock changes still require stronger workflow steps and confirmations instead of purely inline edits.
- **D-35:** Reordering and analytics should stay connected to the operational stock tabs rather than feeling like isolated report screens.
- **D-36:** Browser inventory analytics support both CSV and PDF export in Phase 9.
- **D-37:** Barcode scanning and on-the-floor inventory actions remain clearly mobile-first even after the browser inventory module becomes strong.

### Cross-Device Coexistence
- **D-38:** Browser/mobile responsibility follows a role-shaped split rather than device parity for everyone.
- **D-39:** Default device choice is role-dependent rather than globally browser-first or globally mobile-first.
- **D-40:** When a user has browser and mobile open at once, changes should live-sync, but overtaken edits must surface conflict or stale-state prompts.
- **D-41:** Browser flows should preserve the same mental model as mobile -- statuses, action meanings, and workflow concepts stay aligned even when layouts differ.

### Realtime Alerts
- **D-42:** Browser live updates are inline-first. Toasts and other interruptive alerts are reserved for a smaller set of important cases.
- **D-43:** Interruptive alerts should be used for failures and action-blocking exceptions, not for every normal workflow change.
- **D-44:** Alerts should fade after they are seen rather than staying pinned until explicit resolution in the global home surface.
- **D-45:** Phase 9 should not add a separate unified alert center. Use the home cockpit plus module-local alerts.

### Portal Home
- **D-46:** The owner portal lands on an owner overview page, not a pay-first page and not directly on the pet record by default.
- **D-47:** When there is an unpaid invoice, payment and record access should receive equal emphasis on the home screen rather than payment dominating everything else.
- **D-48:** If a due payment and a recent clinical update both exist, the top of home should combine them into one summary area rather than privileging one over the other.
- **D-49:** Pet snapshot cards should appear above the fold, and the portal home should include a rich medical preview rather than a billing-only posture.
- **D-50:** If there is no unpaid balance, the portal home should emphasize pet records first.
- **D-51:** When multiple unpaid invoices exist, home shows one total due plus the individual invoice list.
- **D-52:** Clinic help/contact actions remain always visible on the portal home.
- **D-53:** Within the valid magic-link window, the portal should remember where the owner left off and restore that context.
- **D-54:** Payment status and receipt history primarily live inside invoice detail views rather than becoming a large home-screen widget.
- **D-55:** Owners should open PDFs and documents from invoice or pet detail views, not directly from home cards.
- **D-56:** The portal home should always show a visible trust banner explaining the secure clinic-linked context.

### Portal Navigation
- **D-57:** The owner portal uses top-level tabs rather than a single long page.
- **D-58:** Multi-pet owners use a pet switcher inside the shared owner portal.
- **D-59:** Invoice navigation is nested under each pet, not one global owner invoice list, even though payment selection can still combine invoices across pets.
- **D-60:** Deep links from WhatsApp should open the specific target first.
- **D-61:** Within a selected pet, read-only medical history is organized as a visit timeline.
- **D-62:** Payments stay inside invoice flows rather than getting their own top-level portal tab.
- **D-63:** After a deep link opens a specific invoice or record, the rest of the portal remains fully reachable.
- **D-64:** Expired links go to an expired screen with a built-in reissue path.

### Portal Trust And Payment Flow
- **D-65:** The no-login magic-link model is explained through a clear trust banner using plain language, not a separate intro gate.
- **D-66:** Payment transitions use an explicit handoff that prepares the owner for the external Razorpay step and return path.
- **D-67:** The easiest expired-link recovery is requesting a new WhatsApp link directly from the portal.
- **D-68:** Security messaging inside the portal should provide light reassurance, not a technical security console.
- **D-69:** Owners can choose to pay one invoice or multiple invoices.
- **D-70:** If they choose multiple invoices, Phase 9 should support one combined checkout with a clear invoice-and-pet breakdown.
- **D-71:** After successful payment, the owner should see a success summary with receipt access before navigating elsewhere.
- **D-72:** Failed or interrupted payments should return the owner to the portal with retry choices and clinic help available.

### Owner-Facing Record Language
- **D-73:** Portal language for records uses a mixed clinical + plain approach. Keep the clinic's real terminology visible, but pair it with simpler owner-friendly wording where helpful.
- **D-74:** Prescriptions should appear as simple usage cards rather than raw rows or only narrative notes.
- **D-75:** Diagnosis and visit-history entries should add a short plain-language gloss where useful.
- **D-76:** Abbreviations and shorthand should be expanded or paired with understandable wording in the owner view.
- **D-77:** Record views should include light action guidance when useful, but should not become a heavy coaching product.

### Portal Support Boundaries
- **D-78:** Phase 9 owner self-service is intentionally bounded. It should definitely support link recovery and payment recovery.
- **D-79:** Clinic contact actions should be available from anywhere in the portal as escalation paths.
- **D-80:** The portal should not add a direct structured correction-request workflow for records or invoices in Phase 9.
- **D-81:** The portal should try to be helpful first with clear wording and retry options, then fall back to human clinic support.

### the agent's Discretion
- Exact browser information density, visual layout, and component composition can follow the Phase 2 design system and the later UI design contract for this phase.
- Exact tab labels, card titles, and trust-copy wording can be finalized during UI work as long as they preserve the decisions above.
- Exact real-time transport details, route structure, caching behavior, and conflict-resolution mechanics are left to research and planning.
- Exact export formatting and analytics metric formulas are open to the planner unless they conflict with the browser-depth decisions above.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Context
- `.planning/PROJECT.md` -- Core value, browser-vs-mobile product intent, owner portal rationale, India-market constraints, and the no-extra-app posture for owners.
- `.planning/REQUIREMENTS.md` -- Phase 9 requirements: `PLT-01`, `PLT-02`, and `OWN-01` through `OWN-06`; also confirms what is deferred to later phases.
- `.planning/ROADMAP.md` -- Phase 9 goal, success criteria, dependency on Phase 8, and explicit scope boundary before Phase 10 offline hardening.

### Product Reference
- `docs/Breeyo - Product Requirement Document (PRD).md` -- Product-level browser dashboard, analytics, payment, and owner-experience intent that informed the Phase 9 discussion.

### Prior Phase Context
- `.planning/phases/01-foundation-authentication/01-CONTEXT.md` -- Auth, RBAC, tenant isolation, and audit expectations that govern browser access, owner-link security, and role-based web permissions.
- `.planning/phases/02-ui-ux-design-design-system/02-CONTEXT.md` -- Shared design-system, navigation, density, and interaction principles that web and owner portal surfaces should preserve.
- `.planning/phases/02-ui-ux-design-design-system/02-UI-SPEC.md` -- Locked UI contract for tokens, hierarchy, and reusable component behavior that browser/portal design work should build from.
- `.planning/phases/03-patient-registration-walk-in-queue/03-CONTEXT.md` -- Owner mobile-number identity, patient lookup patterns, queue behavior, and staff workflow assumptions reused by the web dashboard.
- `.planning/phases/04-emr-clinical-records/04-CONTEXT.md` -- Read-only visit history, diagnosis, prescription, and owner-facing medical-document context that the owner portal exposes.
- `.planning/phases/05-inventory-management/05-CONTEXT.md` -- Inventory operations, batch/expiry workflows, want-list logic, and mobile scanning boundaries that shape the richest browser module.
- `.planning/phases/06-invoicing-payments/06-CONTEXT.md` -- Invoice lifecycle, Razorpay links, receipts, refunds, invoice-per-pet decisions, and payment-state expectations used by the owner portal and browser billing surfaces.
- `.planning/phases/07-whatsapp-communication/07-CONTEXT.md` -- WhatsApp logs, reminder/payment-link context, owner-thread conventions, and the decision that web can reuse communication issues in later phases.
- `.planning/phases/08-scheduling-calendar/08-CONTEXT.md` -- Larger-screen planning assumptions, queue/schedule separation, and cross-device scheduling expectations that carry into the browser dashboard.

### Technology And Codebase Context
- `.planning/research/STACK.md` -- Planned stack: Next.js for web dashboard, React Native mobile app, Fastify API, PostgreSQL, Redis, Prisma, React Query, Zustand, Socket.IO, BullMQ, and Razorpay.
- `.planning/intel/codebase-map.md` -- Confirms the repo is still planning-only with no implemented app source; planners must target the intended monorepo/module structure instead of existing production code.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- No application source code exists yet. There are no implemented browser pages, owner portal routes, web components, or API handlers to reuse directly.
- Planned reusable assets from earlier phases should be treated as required inputs once implemented: Phase 2 design-system primitives, Phase 3 queue/patient flows, Phase 4 EMR history outputs, Phase 5 inventory workflows, Phase 6 invoice/payment outputs, and Phase 8 schedule state.

### Established Patterns
- Planned monorepo shape from `.planning/intel/codebase-map.md` points to `apps/web` for the browser dashboard, `apps/mobile` for mobile, and `apps/api/src/modules/*` for domain modules.
- Planned architecture remains a modular monolith with bounded contexts, REST endpoints, zod validation at the boundary, and PostgreSQL RLS multi-tenancy.
- Planned real-time updates rely on Redis + Socket.IO style live sync rather than disconnected browser-only state.
- Planned React Query + Zustand patterns should give browser and mobile a shared mental model for status, fetch, and conflict handling even when layouts diverge.
- Planned Next.js web surfaces can support denser desktop and tablet workflows than mobile, but should not invent a separate product language from the mobile system.

### Integration Points
- Queue: browser queue panels/actions must reflect the same queue truth as mobile and Phase 3.
- Scheduling: browser schedule surfaces build directly on Phase 8 scheduling rules while keeping queue and schedule separate.
- Inventory: browser inventory becomes the deepest web module, especially for batches, reordering, and analytics, while scanning stays mobile-first.
- Billing: owner payment journeys and browser billing actions build on Phase 6 invoice, receipt, refund, and Razorpay decisions.
- EMR: owner portal reads visit history, diagnoses, prescriptions, and linked records without turning Phase 9 into a clinician-authoring surface.
- WhatsApp: owner access originates from WhatsApp magic links, and browser home can surface communication exceptions without becoming the primary communications workspace.

</code_context>

<specifics>
## Specific Ideas

- The browser dashboard should feel like a real clinic control center, not a static analytics page.
- Inventory deserves the deepest browser treatment because bigger tables, batch history, reorder review, and analytics all benefit from a larger screen.
- Queue and schedule should stay conceptually separate on web even when both are visible together.
- The owner portal should feel trustworthy and useful beyond payment alone: records matter, but payment must still be easy and obvious when due.
- Owners should be able to combine payments across pets/invoices in one clear checkout while still browsing invoices from pet-scoped views.
- Browser/mobile should share the same workflow meaning even when one is denser and one is more operationally mobile.

</specifics>

<deferred>
## Deferred Ideas

- Full clinician browser workflows -- deferred; clinicians do not receive browser access in Phase 9.
- Unified cross-module alert center -- deferred; use home plus module-local alerts in this phase.
- Structured owner correction requests or support-case workflows -- deferred; owners escalate to clinic contact instead.
- Browser-first barcode scanning or replacing on-the-floor mobile inventory work -- deferred; scanning remains mobile-first.

</deferred>

---

*Phase: 09-Web Dashboard & Owner Portal*
*Context gathered: 2026-05-07*
