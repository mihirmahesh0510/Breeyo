# PRD-09a: Web Admin Dashboard

**Type:** Lightweight PRD
**Phase:** 09a - Web Admin Dashboard (Part 1 of Phase 9)
**Status:** Draft
**Author:** Auto-generated
**Date:** 2026-08-03

---

## 1. Executive Summary

Phase 9a delivers a browser-based operations dashboard for Breeyo, built with Next.js and deployed as the `@breeyo/web` package within the existing monorepo. The dashboard gives Admin users -- and optionally Front Desk staff -- a full-depth web surface for managing clinic operations from a desktop or laptop browser. It is not a mobile-app port; it is purpose-built for the larger screen, optimized for data-dense views, keyboard-driven workflows, batch/stock management, reorder analytics, and administrative oversight that mobile cannot serve well.

The dashboard home is a today-first operations cockpit with scrollable priority sections for queue, scheduling, billing, inventory, and user management. Alerts and exceptions appear first in scroll order. Queue and scheduling are separate panels. Inventory receives the deepest browser treatment of any module: full batch/stock management, reordering workflows, and analytics with CSV and PDF export. Queue, scheduling, and billing are operational but simpler. User management is core-admin complete. All modules live-sync with mobile via shared real-time channels, with conflict and stale-state prompts surfaced when edits collide across devices.

Browser access is Admin-only by default. Front Desk can be granted configurable browser access (disabled until an Admin enables it), scoped to queue, scheduling, and billing -- with inventory visible but view-only. Unauthorized modules are hidden entirely, not shown as locked placeholders. High-risk actions (refunds, invoice voids, role changes) use strong confirmation; routine operational edits stay fast.

This PRD covers the admin dashboard only. The pet owner portal is a separate product surface covered in PRD-09b.

---

## 2. Problem Statement

Breeyo's mobile app is the correct primary interface for clinical work -- exam room consultations, barcode scanning, queue check-ins at the reception counter. But by Phase 8, the platform encompasses queue management, scheduling, inventory with batch/expiry tracking, invoicing with GST compliance, WhatsApp communication, and user administration. Several of these domains create acute friction when managed exclusively on a phone:

- **Inventory management at depth is impractical on mobile.** Reviewing batch expiry dates across hundreds of items, analyzing consumption trends, running reorder calculations, and exporting stock reports for accountants or auditors requires tabular layouts, sorting, filtering, and export capabilities that a 6-inch screen cannot serve. Admins currently have no good way to do this work without leaving Breeyo for a spreadsheet.

- **Queue and scheduling oversight suffers from small-screen serialization.** An Admin monitoring a busy walk-in morning while simultaneously adjusting afternoon appointment slots is forced into constant tab-switching on mobile. A side-by-side layout on a larger screen eliminates this context loss.

- **Billing review and reconciliation is tap-heavy.** Finding a specific overdue invoice, cross-referencing payment status, recording cash payments, and exporting PDF invoices for record-keeping all benefit from keyboard input, wide tabular views, and multi-select bulk actions.

- **User management is high-consequence work done on a cramped form.** Adding staff, changing roles, enabling or disabling access -- these are infrequent actions with significant security implications. They deserve deliberate, confirmation-gated interfaces with clear audit visibility, not a mobile form squeezed between clinical tasks.

- **Cross-module awareness is fragmented on mobile.** An Admin editing inventory on their phone may miss a queue alert. A billing review may not surface an inventory exception. The mobile app correctly optimizes for single-task depth; a browser cockpit can provide multi-module awareness without sacrificing that depth.

Without a browser dashboard, Admins either tolerate these inefficiencies or fragment their workflow across spreadsheets, WhatsApp groups, and the mobile app -- undermining the value of a unified platform.

---

## 3. Target Users & Personas

### Primary: Dr. Priya -- Admin / Clinic Owner

- **Role:** Veterinarian and sole owner-operator of a small clinic (1-3 staff, 15-25 patients/day).
- **Tech comfort:** High. Uses a laptop daily for accounting, supplier email, and WhatsApp Web. Comfortable with browser-based tools.
- **Context:** Between appointments, Dr. Priya sits at her desk to review the day's queue status, check inventory levels before calling suppliers, reconcile billing, and occasionally onboard a new staff member. She already has a browser open -- she should not need to pick up her phone for these tasks.
- **Key need:** A single browser tab that gives her an at-a-glance operations cockpit with drill-down depth into inventory, queue, scheduling, billing, and user management. Inventory is her most browser-intensive workflow: she wants to review batches, analyze consumption, generate reorder lists, and export stock reports.
- **Frustration:** "I already have my laptop open for Tally. Switching to my phone to check if we're running low on Rabisin, then switching back to order it, is absurd."

### Secondary: Receptionist Rekha -- Front Desk (browser-enabled by Admin)

- **Role:** Front Desk staff at a two-vet clinic.
- **Tech comfort:** Moderate. Comfortable with browsers and familiar with Breeyo's mobile app. Less confident with complex admin tools.
- **Context:** Dr. Priya has enabled browser access for Rekha so she can manage the walk-in queue and check appointment schedules from the reception desktop. Rekha fields phone calls while monitoring the queue -- the phone screen is too small for both tasks simultaneously.
- **Key need:** Queue and scheduling panels in the browser. Billing access so she can check invoice status and record cash payments when patients pay at the desk. Inventory visible but read-only so she can answer patient questions about medication availability.
- **Frustration:** "Five people are waiting, two are calling, and I can barely see the queue on my phone. A big screen would save me."

### Explicitly Not Targeted (Phase 9a)

- **Clinician role:** Does not receive browser access in Phase 9. Clinicians continue to use mobile exclusively for clinical workflows. Browser-based clinical tools are a future consideration.

---

## 4. Strategic Context

### Platform Requirements

Phase 9a directly fulfills requirement **PLT-02**: _Web dashboard accessible via modern browsers (Chrome, Safari, Firefox)._ It also confirms the continued delivery of **PLT-01**: _Mobile app runs on Android 8+ and iOS 14+ via React Native/Expo_ -- the mobile app is unchanged by this phase.

### Roadmap Position

Phase 9 is the first phase to extend Breeyo beyond mobile. It depends on all eight prior phases being complete:

- Phase 1 provides authentication, RBAC, and multi-tenant isolation.
- Phase 2 provides the design system and interaction patterns.
- Phase 3 provides queue and patient management.
- Phase 4 provides EMR and clinical records.
- Phase 5 provides inventory operations and batch management.
- Phase 6 provides invoicing and payment infrastructure.
- Phase 7 provides WhatsApp communication.
- Phase 8 provides scheduling and calendar.

The dashboard surfaces all of these modules on a larger screen. It does not introduce new domain logic -- it provides a new access surface for existing capabilities, with deeper UI affordances that mobile cannot offer.

Phase 9 is split into two PRDs: 9a (this document, admin dashboard) and 9b (pet owner portal). They share the same Next.js deployment and Fastify API but target entirely different users, access models, and interaction patterns.

### Market Differentiation

India's veterinary PMS landscape is either desktop-only (legacy Windows apps with no mobile story) or mobile-only (newer startups with no admin depth). Breeyo's differentiator is cross-device live sync: a queue update on mobile appears on the dashboard within seconds, and vice versa. The dashboard is not a replacement for mobile -- it is a complement that lets the right user use the right device for the right task.

### Role-Shaped Device Strategy (D-38, D-39)

Browser and mobile responsibility follows a role-shaped split, not device parity. Admins default to browser for administrative depth; clinicians default to mobile for clinical workflows. Front Desk is configurable. This means the dashboard does not try to replicate every mobile screen -- it provides the admin-optimized surface that mobile cannot.

---

## 5. Solution Overview

### 5.1 Operations Cockpit (Home)

The dashboard home is a today-first, action-heavy operations cockpit (D-01, D-03, D-04). It uses scrollable priority sections rather than a fixed desktop grid (D-05). Alerts and exceptions appear first in scroll order (D-06), followed by operational summaries across all modules.

| Aspect | Details |
|---|---|
| **Layout** | Scrollable priority sections. Alerts/exceptions at top, then queue, scheduling, billing, inventory, user management panels below (D-05, D-06, D-07). |
| **Time horizon** | Today-first. Future planning lives behind deeper scheduling and inventory views (D-04). |
| **Balance** | Queue, scheduling, billing, inventory, and user-management awareness are balanced above the fold -- no single module dominates (D-02). |
| **Action orientation** | Each panel shows action-ready snippets with enough detail to decide the next click, not rich analytics dashboards (D-08). Quick actions available directly from the home surface (D-03). |
| **Queue + Scheduling** | Separate panels on home -- not collapsed into one blended board (D-07). |
| **User management** | Inline mini-panel on home for awareness and quick follow-through, not only buried in a settings page (D-11). |
| **WhatsApp exceptions** | Phase 7 WhatsApp issues surface on home as action exceptions, since the communications workflow itself remains mobile-first (D-13). |
| **Owner portal exceptions** | Owner portal issues surface on home only as exception cases needing staff attention (D-12). |
| **No activity feed** | No persistent clinic-wide activity feed on home. Live activity stays inside relevant modules (D-09). |
| **No global search bar** | Search stays module-local in Phase 9 (D-10). |
| **Personalization** | Users can reorder the clinic-defined panel set, but cannot fully redesign or remove core operational panels (D-14). |

### 5.2 Queue Panel

The browser queue panel provides real-time operational management of the walk-in queue (D-27). It is simpler than the inventory module but fully operational (D-27).

| Capability | Details |
|---|---|
| **Live queue board** | All current entries with patient/pet name, species, arrival time, live-updating wait duration, status (Waiting / In Consultation / Completed / No-Show). |
| **Status transitions** | Inline status changes via click. Same state machine as mobile. |
| **Real-time sync** | Queue updates from mobile appear inline without page refresh (D-42). Toasts reserved for failures and exceptions (D-43). |
| **Workflow alignment** | Browser flows preserve the same statuses, action meanings, and workflow concepts as mobile (D-41). |

### 5.3 Scheduling Panel

The browser scheduling panel provides appointment overview and management, kept separate from the queue panel (D-07).

| Capability | Details |
|---|---|
| **Calendar views** | Day view (default) and week view. Today-first time horizon; future planning accessible via deeper views (D-04). |
| **Appointment management** | Create, reschedule, and cancel appointments. Conflict detection. |
| **Split layout** | On wide viewports, queue and scheduling display side-by-side so Admins can coordinate walk-ins and scheduled visits simultaneously. |
| **Operational depth** | Operational but simpler than inventory in Phase 9 (D-27). |

### 5.4 Inventory Workbench

Inventory is the deepest browser module (D-26). It is organized as one module with sub-tabs, not three separate top-level areas (D-31). The default sub-tab is Stock + Batches (D-32). Browser inventory optimizes for both operations and analysis (D-29).

| Sub-tab | Capabilities |
|---|---|
| **Stock + Batches (default, D-32)** | Sortable, filterable table of all items with current stock, batch count, reorder status. Expand any item to see individual batches with expiry dates, quantities, purchase prices. FIFO order visualized. Direct table actions for normal work (D-33). High-risk stock changes (write-offs, large adjustments) require stronger workflow steps and confirmation (D-34). |
| **Reordering** | Items below par level with consumption trends, suggested reorder quantities, supplier lead time. Create purchase orders. Mark items as ordered. Receive stock with batch creation. Connected to the operational stock view, not an isolated report (D-35). |
| **Analytics** | Consumption trend analysis, stock turnover metrics, expiry risk reports. CSV and PDF export (D-36). Analytics stay connected to operational data, not a separate reporting silo (D-35). |

**Mobile boundary preserved:** Barcode scanning and on-the-floor inventory actions remain clearly mobile-first even though the browser inventory module is deep (D-37). The browser workbench does not attempt to replicate scanning workflows.

### 5.5 Billing Workbench

The billing surface provides operational invoice and payment management with live cross-device sync.

| Capability | Details |
|---|---|
| **Invoice list** | Searchable, filterable table with status (Draft / Issued / Paid / Overdue / Voided / Cancelled), date range, patient/pet name, amount. |
| **Invoice detail** | Full line-item view. Edit capability for Draft invoices. Read-only for finalized invoices. |
| **Payment recording** | Record cash/UPI/card payments against invoices. Payment confirmation syncs to mobile. |
| **Admin-only actions** | Refunds and invoice voids are Admin-only even when Front Desk has broader billing access (D-22). |
| **Live sync** | Invoice changes on mobile appear on web within seconds; web changes reflect on mobile. Stale-state prompts on conflict (D-40). |

### 5.6 User Management

Core-admin complete but scoped -- not expanded into a broader staffing or HR platform (D-28).

| Capability | Details |
|---|---|
| **Staff list** | All clinic staff with name, role(s), status (Active/Inactive), last login, browser access status. |
| **Role assignment** | Assign or change roles: Admin, Clinician, Front Desk, Inventory Manager. Strong confirmation required for role changes (D-23). |
| **Browser access configuration** | Per-role module toggles (D-19). Admin has browser access by default (D-15). Front Desk browser access is clinic-configurable, disabled by default (D-16). |
| **Staff lifecycle** | Invite new staff via SMS. Activate/deactivate accounts. Deactivation terminates active sessions. |
| **Audit visibility** | Sensitive operational changes show the acting user clearly in the UI and history, not only in backend logs (D-24). |
| **Admin-only** | User management, role changes, and permission administration are Admin-only (D-21). |

### 5.7 Browser Access & Permissions

| Rule | Details | Decision Ref |
|---|---|---|
| Admin has browser access by default | Cannot be disabled | D-15 |
| Clinician does not get browser access | Not in Phase 9 scope | D-15 |
| Front Desk browser access is configurable | Disabled by default; Admin enables per clinic | D-16 |
| Front Desk browser scope (when enabled) | Queue, scheduling, billing: active. Inventory: view-only | D-17, D-18 |
| Permission model | Per-role module toggles, not per-user custom rule sets | D-19 |
| Unauthorized modules | Hidden entirely -- not shown as locked placeholders | D-20 |
| Admin-only capabilities | User management, refunds, invoice voids | D-21, D-22 |

### 5.8 Cross-Device Coexistence

| Aspect | Details | Decision Ref |
|---|---|---|
| **Live sync** | When browser and mobile are open simultaneously, changes live-sync across devices | D-40 |
| **Conflict handling** | Overtaken edits surface conflict or stale-state prompts -- no silent overwrites | D-40 |
| **Workflow alignment** | Browser flows preserve the same mental model as mobile: same statuses, action meanings, and workflow concepts even when layouts differ | D-41 |
| **Role-shaped split** | Device responsibility follows roles, not device parity for everyone | D-38 |
| **Default device** | Role-dependent: Admin defaults to browser for admin work; others default to mobile | D-39 |

### 5.9 Real-Time Updates & Alerts

| Aspect | Details | Decision Ref |
|---|---|---|
| **Inline-first updates** | Live data updates are inline within panels, not interruptive by default | D-42 |
| **Toasts reserved** | Interruptive alerts (toasts, modals) are reserved for failures and action-blocking exceptions, not normal workflow changes | D-43 |
| **Alert fade** | Alerts fade after they are seen rather than staying pinned until explicit resolution | D-44 |
| **No unified alert center** | Use the home cockpit plus module-local alerts. No separate unified alert center in Phase 9 | D-45 |

### 5.10 High-Risk Action Confirmation

High-risk browser actions use strong confirmation steps. Routine operational edits stay fast (D-23).

Actions requiring strong confirmation:
- Refunding a payment or voiding an invoice (Admin-only)
- Changing a user's role
- Deactivating a staff account
- High-risk stock changes (large write-offs, batch deletions)
- Revoking browser access (terminates active sessions)

Confirmation dialogs must:
- State the action in plain language and show what will be affected
- Require a deliberate click (not keyboard-shortcut-confirmable)
- Log the action and acting user in the audit trail (D-24)
- Be dismissible via Cancel or Escape

---

## 6. Success Metrics

| # | Metric | Target | Measurement |
|---|---|---|---|
| 1 | **Web dashboard accessible via modern browsers** | Chrome 90+, Firefox 90+, Safari 15+ render correctly and all features function | Automated cross-browser test suite; manual QA on target browsers |
| 2 | **Cross-device real-time sync** | Queue, billing, inventory, and scheduling updates appear on dashboard within 2 seconds of mobile action (and vice versa) | Automated monitoring: WebSocket event latency p95 |
| 3 | **Admin dashboard adoption** | 70% of Admin users use the dashboard at least 3 times per week within 60 days of launch | Analytics: unique Admin browser sessions per week |
| 4 | **Inventory workflow depth** | Admin can complete full batch review, reorder, and export workflow entirely in the browser | Manual QA: timed task completion for stock review, reorder creation, CSV/PDF export |
| 5 | **Stale-state conflict surfacing** | 100% of cross-device edit collisions produce a user-visible stale-state prompt | Integration tests: concurrent edit scenarios across browser and mobile clients |
| 6 | **Permission enforcement accuracy** | Unauthorized modules return hidden UI and 403 at API; zero unauthorized access in test suite | Automated role-based access tests: positive and negative cases per role |
| 7 | **Dashboard initial load** | Operations cockpit renders within 3 seconds on standard broadband | Performance monitoring: page load timing p95 |
| 8 | **Front Desk browser enablement** | 30% of multi-staff clinics enable Front Desk browser access within 90 days | Analytics: browser access configuration events |

---

## 7. User Stories & Requirements

### 7.1 Operations Cockpit

**US-DASH-01: View operations cockpit on login**
> As Dr. Priya (Admin), I want to see a today-first operations cockpit when I open the dashboard, so that I immediately know the current state of my clinic without navigating into sub-pages.

Acceptance Criteria:
- Given I am logged in as Admin, when the dashboard loads, then I see the operations cockpit as the home view.
- Alerts and exceptions appear first in scroll order, above operational summaries.
- The cockpit displays scrollable priority sections for: queue snapshot (length, average wait, next patient, stalled entries), today's appointment summary, inventory alerts (low stock, expiring batches), today's billing summary (revenue, outstanding count), and user management awareness (pending invites, recent role changes).
- Each section shows action-ready snippets -- enough detail to decide the next click, not full analytics.
- Queue and scheduling appear as separate panels, not blended into one board.
- Each panel updates in real time via WebSocket. Updates are inline; toasts appear only for failures or action-blocking exceptions.
- Each panel is clickable and navigates to the corresponding full module view.
- The cockpit loads within 3 seconds on standard broadband.

**US-DASH-02: Quick actions from cockpit**
> As Dr. Priya, I want quick-action shortcuts on the cockpit so that I can jump to common tasks in one click.

Acceptance Criteria:
- Given the cockpit is displayed, then action shortcuts are visible without scrolling (e.g., "Add Walk-in," "View Full Queue," "Open Inventory," "Check Appointments").
- Quick actions are role-scoped: Front Desk (if browser-enabled) sees only queue, scheduling, and billing actions; inventory and user management shortcuts are hidden.
- Clicking a quick action navigates to the relevant module view or opens the appropriate creation flow.

**US-DASH-03: Personalize cockpit panel order**
> As Dr. Priya, I want to reorder the cockpit panels to match my workflow preference, so that the information I check most often is closest to the top.

Acceptance Criteria:
- Given I am on the cockpit, I can reorder panels via drag-and-drop or a settings control.
- I cannot remove core operational panels (queue, scheduling, billing, inventory, user management) -- only reorder them.
- My panel order preference persists across sessions.
- Alerts and exceptions always appear first in scroll order, regardless of panel reordering.

### 7.2 Queue Panel

**US-DASH-04: View and manage live queue**
> As Dr. Priya, I want to see the real-time walk-in queue on a dedicated panel in my browser, so that I can monitor patient flow while working on other admin tasks.

Acceptance Criteria:
- Given I am on the Queue panel, then I see all current queue entries with: patient name, pet name, species, arrival time, wait duration (live-updating), status chip (Waiting / In Consultation / Completed / No-Show).
- Queue updates from mobile (new walk-in, status change) appear inline within 2 seconds without page refresh.
- I can change a queue entry's status by clicking the status chip and selecting a new status. The same state machine rules as mobile apply.
- Completed and No-Show entries are visually de-emphasized but remain visible until end of day.
- The queue panel preserves the same workflow concepts as mobile -- statuses, transitions, and action meanings are identical even though the layout differs.

**US-DASH-05: Front Desk queue access (browser)**
> As Receptionist Rekha (Front Desk, browser-enabled), I want to manage the walk-in queue from the reception desktop, so that I can see the full queue while handling phone calls.

Acceptance Criteria:
- Given my Admin has enabled browser access for Front Desk, when I log in to the dashboard, then I see Queue, Scheduling, and Billing panels. Inventory is visible but view-only.
- I can add walk-ins, change queue status, and view appointments.
- User Management is hidden entirely (not shown as locked).
- If my Admin revokes browser access, my active session is terminated and I see a clear "Browser access revoked" message.

### 7.3 Scheduling Panel

**US-DASH-06: View and manage appointments**
> As Dr. Priya, I want a calendar view of appointments as a separate panel from the queue, so that I can coordinate walk-ins and scheduled visits without confusing the two.

Acceptance Criteria:
- Given I am on the Scheduling panel, then I see a day view (default) and can switch to week view.
- Each appointment shows: patient/pet name, time slot, type, assigned vet.
- I can create a new appointment by clicking an empty time slot.
- I can reschedule an appointment by dragging to a new time slot; conflict detection warns if the slot overlaps.
- On wide viewports, Queue and Scheduling panels display side-by-side for simultaneous awareness.
- Queue and Scheduling remain conceptually separate -- they are not merged into one blended operational board.

### 7.4 Inventory Workbench

**US-DASH-07: Browse full inventory with stock and batch management**
> As Dr. Priya, I want a sortable, filterable inventory table with batch drill-down on the web dashboard, so that I can review stock levels, expiry dates, and batch details efficiently on a large screen.

Acceptance Criteria:
- Given I am on the Inventory Workbench, the default sub-tab is Stock + Batches.
- I see a table with columns: Item Name, Category, Current Stock, Unit, Reorder Threshold, Batch Count, Status (OK / Low / Critical / Expired).
- I can sort by any column and filter by category, status, and search term.
- Clicking an item row expands to show a batch sub-table: Batch Number, Expiry Date, Quantity Remaining, Purchase Price, Date Received -- sorted by expiry (earliest first, reflecting FIFO).
- Batches expiring within 30 days show a warning indicator; expired batches show an error indicator.
- Normal stock operations (small adjustments, batch quantity edits) are available as direct table actions without leaving the view.
- High-risk stock changes (large write-offs, batch deletion) require a stronger workflow: confirmation dialog with reason field and acting-user attribution.
- The table supports pagination (25/50/100 rows per page) and loads within 2 seconds for up to 500 items.

**US-DASH-08: Reorder workflow**
> As Dr. Priya, I want to see which items need reordering, review consumption trends, and create purchase orders from the same inventory module, so that reordering feels connected to my stock operations.

Acceptance Criteria:
- Given I am on the Reorder sub-tab within the Inventory Workbench, I see items below par level sorted by urgency.
- Each item shows: current stock, average daily consumption (30-day rolling), days of stock remaining, suggested reorder quantity.
- A consumption trend chart (last 90 days) is available for each item on click.
- I can create a purchase order pre-filled with suggested quantities.
- The Reorder sub-tab is connected to the Stock + Batches tab -- I can navigate between them without losing context.
- Reorder data stays operational, not isolated as a separate report screen.

**US-DASH-09: Inventory analytics and export**
> As Dr. Priya, I want to analyze inventory consumption and export reports as CSV or PDF, so that I can share data with my accountant and make informed purchasing decisions.

Acceptance Criteria:
- Given I am on the Analytics sub-tab within the Inventory Workbench, I see consumption analysis, stock turnover metrics, and expiry risk summaries.
- Analytics feel connected to operational stock data, not like an isolated reporting silo.
- I can export the current view as CSV (includes all visible columns for the filtered/sorted data).
- I can export as PDF (formatted report with clinic header, date, and tabular data).
- Export files use naming pattern: `breeyo-inventory-{type}-{date}.{csv|pdf}`.
- Export completes within 10 seconds for up to 500 items.

**US-DASH-10: Inventory view-only for Front Desk**
> As Receptionist Rekha (Front Desk, browser-enabled), I want to see inventory data in the browser so I can answer patient questions about medication availability, but I should not be able to modify stock.

Acceptance Criteria:
- Given I am logged in with Front Desk role and browser access is enabled, when I navigate to Inventory, I see the Stock + Batches view in read-only mode.
- Add, edit, adjust, and delete actions are hidden (not shown as disabled).
- API requests for write operations return 403.

### 7.5 Billing Workbench

**US-DASH-11: Browse and filter invoices**
> As Dr. Priya, I want a searchable, filterable table of all invoices, so that I can review billing status and find specific invoices quickly.

Acceptance Criteria:
- Given I am on the Billing Workbench, I see a table with: Invoice #, Patient/Pet, Date, Amount, Status (Draft / Issued / Paid / Overdue / Voided / Cancelled), Payment Method.
- I can filter by status, date range, and search term (patient name, invoice number).
- I can sort by any column. Overdue invoices are visually flagged.
- The table supports pagination.

**US-DASH-12: View and edit invoice details with live sync**
> As Dr. Priya, I want to click an invoice to see full details, edit Draft invoices, and see changes from mobile reflected instantly, so that billing is always current regardless of which device I use.

Acceptance Criteria:
- Clicking an invoice row opens a detail panel showing all line items with descriptions, quantities, unit prices, GST breakdown, and totals.
- Draft invoices are editable; finalized invoices are read-only.
- Changes sync to mobile within 2 seconds.
- If another device modified the invoice since I loaded it, a stale-state prompt appears: "This invoice was updated on another device. Reload to see the latest version?"
- I can choose to reload or continue editing; if I continue and a conflict exists on save, the API returns 409 and the dashboard shows a resolution prompt.

**US-DASH-13: Record payments**
> As Dr. Priya, I want to record payments against invoices on the dashboard, so that I can handle billing from my desk.

Acceptance Criteria:
- Given I am viewing an Issued or Overdue invoice, I see a "Record Payment" action.
- I can record a payment with: amount, method (Cash / UPI / Card), reference number (optional).
- After recording, invoice status updates appropriately (Paid if fully settled, remains Issued if partial).
- Payment recorded on mobile appears on the dashboard within 2 seconds, and vice versa.

**US-DASH-14: Admin-only billing actions**
> As Dr. Priya (Admin), I want refunds and invoice voids to be restricted to Admin users, even when Front Desk has broader billing access.

Acceptance Criteria:
- Refund and invoice void actions are visible only to Admin users.
- Front Desk users with browser billing access cannot see or trigger refund/void actions (hidden in UI, 403 at API).
- Refund and void actions require strong confirmation dialogs showing the financial impact and acting user.
- All refund/void actions are audit-logged with the acting user's identity.

### 7.6 User Management

**US-DASH-15: View and manage staff**
> As Dr. Priya (Admin), I want a user management panel showing all staff with their roles and access status, so that I can control who has access to what.

Acceptance Criteria:
- Given I am on the User Management panel, I see a list of all clinic staff with: Name, Role(s), Status (Active / Inactive / Invited), Last Login, Browser Access (Enabled / Disabled).
- I can click a staff member to view/edit their profile.
- Role changes require a confirmation dialog and are audit-logged.
- Staff deactivation requires confirmation and terminates active sessions.
- The acting user is shown clearly in the UI and change history, not only in backend logs.

**US-DASH-16: Configure browser access**
> As Dr. Priya, I want to enable or disable web dashboard access for specific roles, so that I can control who uses the browser interface and what they see.

Acceptance Criteria:
- Browser access is configured via per-role module toggles, not per-user custom rules.
- Admin role has browser access by default; it cannot be disabled.
- Front Desk role can be granted browser access; it is disabled by default.
- When Front Desk browser access is enabled: queue, scheduling, and billing are active; inventory is view-only; user management is hidden.
- Modules a user cannot access are hidden entirely -- not shown as locked placeholders.
- Toggling browser access off terminates active browser sessions for affected users.

**US-DASH-17: Invite new staff**
> As Dr. Priya, I want to invite a new staff member from the dashboard, so that they can join my clinic.

Acceptance Criteria:
- I can invite a staff member with: Name, Phone Number, Role.
- The system sends an invite via SMS with a join code.
- The invited user appears in the staff list with "Invited" status until they complete onboarding.
- I can resend or revoke an invitation.

### 7.7 Cross-Device Sync & Conflict Handling

**US-DASH-18: Real-time updates across devices**
> As Dr. Priya, I want changes made on mobile to appear on the dashboard instantly and vice versa, so that I always see the latest data regardless of which device I am using.

Acceptance Criteria:
- Queue entry added on mobile appears on dashboard Queue panel within 2 seconds.
- Invoice paid on dashboard reflects on mobile within 2 seconds.
- Inventory stock adjusted on mobile reflects on Inventory Workbench within 2 seconds.
- Live updates are inline. Toasts appear only for failures and action-blocking exceptions.
- WebSocket reconnection is automatic after network interruption, with a visible "Reconnecting..." indicator.

**US-DASH-19: Stale-state conflict prevention**
> As Dr. Priya, I want the dashboard to warn me if I am about to edit a record that was modified on another device, so that I do not accidentally overwrite changes.

Acceptance Criteria:
- Given I loaded an invoice 5 minutes ago and Rekha modified it on mobile 2 minutes ago, when I try to edit, I see a stale-state prompt.
- I can choose "Reload" (fetches latest) or "Continue Editing."
- If I continue and save with a conflict, the API returns 409 and the dashboard shows a resolution prompt.
- No silent overwrites occur. All conflict scenarios produce user-visible prompts.

### 7.8 Real-Time Alert Behavior

**US-DASH-20: Appropriate alert escalation**
> As Dr. Priya, I want live updates to appear inline by default, with interruptive alerts reserved for important exceptions, so that normal workflow does not bombard me with notifications.

Acceptance Criteria:
- Normal changes (new queue entry, payment recorded, stock adjusted) update inline within the relevant panel.
- Interruptive alerts (toasts) appear only for: action failures, blocked exceptions, and critical system errors.
- Alerts fade after they are seen; they do not stay pinned until manually dismissed.
- No unified alert center exists in Phase 9. Alerts appear on the home cockpit and within module-local views.

---

## 8. Out of Scope

The following are explicitly excluded from Phase 9a:

| Exclusion | Rationale |
|---|---|
| **Clinician browser access** | Clinicians do not receive browser access in Phase 9. Clinical workflows (EMR, prescriptions, consultations) remain mobile-only. Deferred to a future phase. |
| **Pet owner portal** | Covered separately in PRD-09b. Different users, different access model, different UX. |
| **Unified cross-module alert center** | Deferred. Phase 9 uses home cockpit + module-local alerts (D-45). |
| **Global command-bar search** | Search stays module-local in Phase 9 (D-10). Global search is a future enhancement. |
| **Browser-based barcode scanning** | Scanning remains mobile-first (D-37). Browser inventory links to mobile for scanning workflows. |
| **Advanced analytics / BI dashboards** | The cockpit shows today-focused operational metrics and action-ready snippets, not rich analytics (D-08). Deep BI is a future phase. |
| **Offline dashboard support** | The web dashboard requires an internet connection. Offline workflows remain mobile-only (Phase 10). |
| **Custom home layout beyond reordering** | Users can reorder panels but cannot remove core operational panels or add custom widgets (D-14). |
| **Persistent clinic-wide activity feed** | No activity feed on browser home. Live activity stays inside relevant modules (D-09). |
| **Per-user custom permission rules** | Permissions use per-role module toggles, not per-user custom rule sets (D-19). |
| **Structured owner correction requests** | Owners escalate to clinic contact. No structured correction-request workflow in Phase 9. |
| **Multi-clinic management** | A single dashboard instance manages one clinic. Multi-clinic admin views are deferred. |
| **Tablet-optimized mobile app** | The mobile app is phone-optimized. Tablet users should use the web dashboard. |
| **Dark mode** | Not in Phase 9 scope. May be considered in a future design system update. |

---

## 9. Dependencies & Risks

### Dependencies

| Dependency | Type | Impact |
|---|---|---|
| **Phases 1-8 complete** | Phase dependency | All API endpoints for queue, scheduling, inventory, billing, user management, and WhatsApp must be implemented and stable before the dashboard can surface them. Phase 9 depends on Phase 8. |
| **`@breeyo/web` Next.js package** | Technical | The Next.js skeleton exists in the monorepo but has no production features. Requires: routing, auth flow, API client, WebSocket client, design system integration. |
| **JWT auth in browser context** | Technical | The existing JWT auth flow (SMS OTP) must work in a browser. Refresh token rotation must be browser-safe (httpOnly cookies or secure storage). CSRF protection required. |
| **WebSocket infrastructure for web clients** | Technical | Real-time channels for queue, inventory, billing, and scheduling events must support web clients in addition to mobile. |
| **RBAC browser access flag** | Technical | The RBAC system needs a `browserAccess` permission concept per role, enforced at API level. Per-role module toggles must be implemented. |
| **Design system web adaptation** | Technical | Phase 2 design tokens and component patterns must be adapted for web. The browser should preserve the same visual language without being a pixel-for-pixel port of mobile components. |
| **Razorpay payment infrastructure** | External service | Billing workbench payment recording relies on the Razorpay integration from Phase 6. |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **WebSocket reliability on varied networks** | Medium | High -- stale data shown to users | Implement heartbeat, auto-reconnect, stale-state prompts. Fall back to polling if WebSocket fails. Reconnection indicator in UI. |
| **JWT security in browser context** | Medium | High -- token theft enables unauthorized access | httpOnly cookies for refresh tokens. Short-lived access tokens (15 min). CSRF protection. Secure headers. |
| **Cross-device conflict resolution complexity** | Medium | Medium -- confusing UX when edits collide | Start with simple "reload or continue" prompts. Log all conflicts. Iterate based on real-world collision frequency. |
| **Scope creep into clinical workflows** | High | Medium -- delays launch | Strict scope boundary: clinicians do not get browser access. Clinical features stay mobile. Enforce via PRD review and sprint planning. |
| **Performance with large inventory datasets** | Medium | Medium -- slow table rendering | Server-side pagination, virtual scrolling for large tables, debounced search. Performance budget: 2s load for 500 items. |
| **Browser compatibility edge cases** | Low | Medium -- broken UI for subset of users | Target modern browsers only (Chrome 90+, Firefox 90+, Safari 15+, Edge 90+). Automated cross-browser test suite. |
| **Front Desk permission complexity** | Medium | Medium -- security gaps or over-restriction | API-enforced permission checks at every endpoint, not just UI-hidden elements. Comprehensive integration tests for each role's positive and negative access paths. |
| **Phase 8 API instability** | Low | High -- dashboard cannot launch | Phase 8 must be feature-complete and API-stable before Phase 9a begins. Integration test suite across all modules. |

---

## 10. Open Questions

| # | Question | Context | Owner |
|---|---|---|---|
| 1 | **Real-time transport implementation:** Should the browser use the existing Socket.IO infrastructure from mobile, or adopt a different WebSocket approach (e.g., native WebSocket, SSE)? | D-40 requires live-sync; exact transport is left to research. Socket.IO is already in place for mobile. Reuse vs. optimization tradeoff. | Engineering |
| 2 | **Browser session concurrency:** Should the dashboard support multiple simultaneous browser sessions for the same user (e.g., laptop and tablet)? Or should a new login terminate the previous browser session? | Mobile already supports unlimited concurrent sessions (Phase 1, D-18). Browser may need different rules given shared desktop computers in clinics. | Product + Engineering |
| 3 | **Conflict resolution mechanics:** What specific UX should the "Continue Editing" path produce when a save conflicts? Simple "your version vs. their version" diff? Or automatic merge where possible? | D-40 says conflicts must surface prompts; exact resolution mechanics are left to research and planning. | Engineering |
| 4 | **Inventory analytics metric formulas:** What exact formulas should be used for consumption trends, stock turnover, and reorder suggestions? | D-29 and D-30 require operational + analytical depth; exact formulas are left to the planner unless they conflict with depth decisions. | Product + Engineering |
| 5 | **Export formatting specifics:** Beyond CSV and PDF, should any other formats be supported (Excel .xlsx, JSON)? Should exports be on-demand only or also schedulable? | D-36 confirms CSV and PDF. Other formats and scheduling are not decided. | Product |
| 6 | **Responsive breakpoints and tablet support:** Should the dashboard support tablet viewports (768px-1024px) as a first-class layout, or only desktop (1280px+)? | Tablet support adds design and testing effort. Solo vets may use tablets at reception desks. | Product + Design |
| 7 | **Browser notification permission:** Should the dashboard request browser notification permission for critical alerts (e.g., queue stalls, inventory emergencies), or rely entirely on in-page alerts and mobile push? | D-42 and D-43 define inline-first with toasts for exceptions; browser OS-level notifications are undecided. | Product |
| 8 | **Audit trail source tagging:** Should Admin actions on the dashboard be tagged with a "source: browser" marker in the audit trail to distinguish them from mobile actions? | D-24 requires acting user visibility in UI and history. Source-device tagging would add traceability. | Engineering |
| 9 | **Caching strategy for browser:** What client-side caching approach should the dashboard use? React Query with the same patterns as mobile, Zustand for local state, or a different strategy? | Planned stack includes React Query + Zustand for both web and mobile. Exact browser caching behavior is left to research. | Engineering |
| 10 | **Localization at launch:** Should the dashboard launch with English + Hindi support from day one, or English-only with Hindi added later? | The `@breeyo/ui` design system includes i18n infrastructure. Mobile supports both languages. Web parity is undecided for Phase 9. | Product |

---

*This is a Lightweight PRD for the web admin dashboard (Phase 9a). The pet owner portal is covered separately in PRD-09b. Detailed technical design, component specifications, and route structure will be defined in the planning packets for Phase 9.*
