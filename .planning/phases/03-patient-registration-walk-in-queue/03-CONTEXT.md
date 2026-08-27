# Phase 3: Patient Registration & Walk-in Queue - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Pet owner registration, pet profile management, and walk-in queue as the primary daily workflow. Front desk users and solo vets can register new patients (owner + pet), check in walk-in patients in 2 taps, manage the real-time queue board (call next, status transitions, no-show handling), search patients, and view pet profiles with visit history. Real-time updates across all connected devices via WebSocket. This phase delivers the core patient flow that EMR (Phase 4), Inventory (Phase 5), and Billing (Phase 6) build upon.

</domain>

<decisions>
## Implementation Decisions

### Registration Flow
- **D-01:** Two-step wizard for new patient registration — Step 1: Owner info (mobile + name required). Step 2: Pet info (name + species required). Matches Phase 2 wizard pattern (D-11)
- **D-02:** Searchable dropdown for species and breed — pre-loaded list of companion animals (dogs, cats, birds, rabbits, fish, reptiles). User types to filter. Custom entry for exotic pets
- **D-03:** Companion animals only — no livestock species (cow, buffalo, goat). Focus on urban/metro companion animal clinics
- **D-04:** Minimal required fields — pet name + species required at registration. Breed, age/DOB, weight, color, microchip ID all optional. Get the patient in fast, details filled during consultation
- **D-05:** Auto-detect returning owner by mobile number — front desk enters mobile, system finds existing owner + all their pets, select pet to check in. No re-registration for returning patients
- **D-06:** Mobile number as unique key for owners — one owner per mobile number, prevents duplicates at source. If mobile exists, system shows existing owner profile instead of creating new
- **D-07:** "Add another pet" button after completing pet step — loops back to pet form for multi-pet owners. No limit on pets per owner
- **D-08:** Owner info collected: mobile number + name required. Address, email, alternate phone optional. Fast registration — address collected if needed for invoicing later
- **D-09:** Optional pet photo — camera/gallery option on pet form but not required. Helps identify patients visually when multiple pets of same breed visit
- **D-10:** Approximate age input — "Years" and "Months" number fields. Most owners don't know exact DOB. System calculates approximate DOB for records
- **D-11:** Optional notes field at end of registration — free text for behavioral warnings, allergies, special handling needs. Visible to vet during consultation
- **D-12:** Quick inline registration from check-in flow — minimal fields only (owner mobile + name, pet name + species). Full two-step wizard available from Patients tab. Quick reg gets walk-ins into queue ASAP

### Check-in Experience
- **D-13:** 2-tap check-in flow for returning patients: Tap 1 — FAB opens check-in bottom sheet with mobile number input. Type mobile, auto-shows owner + pets. Tap 2 — tap the pet to check in. Done
- **D-14:** Optional visit reason quick-select after check-in — bottom sheet with common reasons: Vaccination, Sick visit, Follow-up, Deworming, Grooming, Other. Quick tap or skip
- **D-15:** Optional emergency priority toggle at check-in — Emergency patients get red badge and jump to top of queue. Normal patients enter at bottom. Simple binary (emergency or not)
- **D-16:** Post-check-in feedback: toast notification "Buddy checked in — Position #5" and return to queue view. Patient appears at bottom of Waiting section with badge. Non-disruptive

### Queue Board Behavior
- **D-17:** "Call Next" button at top of queue — calls the next Waiting patient, auto-moves to In Consult. Can also tap any specific patient card to call them directly (skip queue for emergencies)
- **D-18:** Tap status badge to cycle: Waiting -> In Consult -> Done. Long-press for No-show. Linear flow matches consultation lifecycle
- **D-19:** Simple average wait estimation — estimated wait = (queue position) x (average consultation time from last 7 days). Display as "~15 min wait". Gets smarter with data over time
- **D-20:** Queue grouped by status — three sections: In Consult (top, highlighted), Waiting (middle, ordered by position), Done (bottom, collapsed/dimmed). Full day view on one screen
- **D-21:** Essential info on queue cards: pet name, species icon, owner name, check-in time, queue position, status badge, visit reason (if entered). Emergency patients shown with red border/icon
- **D-22:** Manual no-show marking — long-press status badge shows "Mark No-show" option. Card moves to Done section with "No-show" label. Counts as visit for analytics, no consultation recorded
- **D-23:** Auto-archive at midnight — queue resets at midnight (or configurable clinic closing time). Done/No-show entries archived to visit history. Fresh queue each morning
- **D-24:** Subtle sound + haptic notification when new patient checks in or status changes on another device. Configurable per-user (on/off)

### Patient Search & Profiles
- **D-25:** Live search bar on Patients tab — results update as user types (debounced). Searches owner name, mobile number, and pet name simultaneously. Matching owner + their pets grouped together
- **D-26:** Patients tab default view: recent patients sorted by most recent visit. Shows pet name, species icon, owner name, last visit date. Search bar always visible at top
- **D-27:** Pet profile page layout — Top: pet photo (if exists), name, species, breed, age, weight, owner name + phone. Middle: quick stats (total visits, last visit date). Bottom: visit history timeline (date, reason, vet). Tap visit to expand details (EMR data added in Phase 4)
- **D-28:** Owner-to-pet navigation: owner card with pet list. Tap owner shows owner details (name, mobile, address) + list of their pets as cards below. Tap any pet to go to pet profile
- **D-29:** Visit history shows current clinic only — no cross-clinic data for Beta. Cross-clinic sharing (Phase 1, D-25 consent model) deferred to post-Beta
- **D-30:** Edit mode for pet profiles — tap "Edit" button to enable editing. Save/Cancel buttons appear. Explicit mode prevents accidental changes
- **D-31:** Chronological visit timeline — newest visit at top. Each visit as a card: date, reason, vet name, brief summary. Tap to expand. Simple and scannable
- **D-32:** No pet record merge tool for Beta — if duplicates arise, admin handles manually via database or support. Build merge UI only if it becomes a real problem
- **D-44 (added post-launch, E2E-BUG-FIX-PLAN.md §3.6):** Per-route permission matrix for patient/queue routes — `patient.routes.ts` and `queue.routes.ts` previously shared one `preHandler = [authenticate, tenantContext]` array across every route with zero `requirePermission(...)` calls, despite `seed.ts` already defining the codes. Now: all `GET` routes on both modules require `VIEW_PATIENTS` / `VIEW_QUEUE`; all mutating routes (including `POST /queue/call-next`, since it advances queue state, not just reads it) require `EDIT_PATIENTS` / `MANAGE_QUEUE`. Fixing this also surfaced that `auth.routes.ts`'s `permissionService` decoration doesn't reach these sibling route registrations (Fastify plugin encapsulation) — both files now re-decorate locally, guarded, matching billing/inventory/whatsapp/scheduling/clinic.
- **D-45 (added post-launch, E2E-BUG-FIX-PLAN.md §3.8):** Owner edit (`PATCH /owners/:ownerId` + a mobile edit screen) does not exist and is explicitly deferred, not built as part of the E2E bug-fix pass — it is net-new scope, not a regression against anything Phase 3 already shipped. Revisit as its own scoped feature if it becomes a real support burden.

### Real-time Sync
- **D-33:** Instant push via WebSocket (Socket.IO) — new check-ins and status changes appear on all connected devices within 1-2 seconds. No manual refresh needed
- **D-34:** Offline behavior: show last-known queue state with yellow "Offline — data may be outdated" banner. Reconnect auto-syncs. No offline queue modifications — check-in requires connectivity. Full offline queuing deferred to Phase 10
- **D-35:** Last-write-wins for concurrent status changes — most recent timestamp wins. Toast notifies other user: "Status updated by Dr. Priya". Simple, pragmatic for small teams

### Multi-user Queue Workflow
- **D-36:** Same view, same actions for all roles — front desk and vet see the same queue, can both check in, call next, change status. Solo vets do everything themselves. Multi-staff clinics coordinate verbally (small teams)
- **D-37:** In Consult cards show treating vet name — "with Dr. Priya" below status badge. Useful when clinic has 2+ vets

### Queue Capacity & Edge Cases
- **D-38:** Unlimited queue size — no artificial cap. 15-25 patients/day typical, scrollable list handles any volume
- **D-39:** In Consult entries persist past midnight auto-archive — only Waiting and Done entries auto-archive. Fresh queue next morning only has carryover In Consults (rare edge case)
- **D-40:** Same-day re-check-in allowed with confirmation — "Buddy was already seen today. Check in again?" Handles legitimate same-day return visits

### Data Entry & Accessibility
- **D-41:** Unicode/Hindi (Devanagari) support for all name fields — owner names and pet names accept both scripts. Search works across both scripts. No transliteration needed
- **D-42:** 10-digit Indian mobile number with auto-format (98765 43210) — validates: must start with 6-9, exactly 10 digits. Numeric keyboard auto-opens. No country code prefix for Beta (India-only)
- **D-43:** Contextual form suggestions — breed dropdown suggests common breeds after species selected. Age defaults to years. Notes field shows placeholder hints. Mobile field remembers recent entries for quick access

### Claude's Discretion
- Exact WebSocket reconnection strategy and retry logic
- Queue card animation details (status transitions, new entry appearance, reorder animation)
- Search debounce timing (200-500ms range)
- Exact species and breed lists for the searchable dropdown
- Wait time display format and update frequency
- Toast notification duration and positioning
- Queue position numbering reset behavior
- Pull-to-refresh behavior as WebSocket fallback

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Context
- `.planning/PROJECT.md` -- Core value (mobile-first for solo vets), constraints (mid-range Android 8+, offline support, walk-in coexistence), key decisions
- `.planning/REQUIREMENTS.md` -- PAT-01 through PAT-05 (patient management) and QUE-01 through QUE-06 (walk-in queue) are the requirements for this phase
- `.planning/ROADMAP.md` -- Phase 3 goal, success criteria, dependency on Phase 2

### Prior Phase Context
- `.planning/phases/01-foundation-authentication/01-CONTEXT.md` -- Auth system, RBAC, multi-tenant with RLS, multi-clinic support with clinic switcher (D-22/D-23), two-layer patient data sharing model (D-25), API conventions (D-27-D-30), audit trail patterns (D-34-D-36)
- `.planning/phases/02-ui-ux-design-design-system/02-CONTEXT.md` -- Design system decisions: Material Design 3 (D-01), warm colors (D-02), 7-level typography (D-03), 8px spacing (D-04), bottom tab bar with Queue/Patients/Inventory/More (D-25), FABs for primary actions (D-30), walk-in queue as status board with live badges (D-36), step-by-step wizards (D-11), illustrative empty states (D-13), progressive disclosure (D-35)
- `.planning/phases/02-ui-ux-design-design-system/02-UI-SPEC.md` -- UI design contract with component inventory, design tokens, spacing scale, color palette, typography, navigation structure, screen states

### Technology Stack
- `.planning/research/STACK.md` -- React Native/Expo, Node.js/Fastify, PostgreSQL, Redis, Socket.IO, Prisma, TypeScript, Zustand, React Query, zod

No additional external specs or ADRs -- requirements fully captured in decisions above and REQUIREMENTS.md.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None yet -- Phase 1 (auth/infra) and Phase 2 (design system) create the foundation. Phase 3 is the first feature phase consuming both

### Established Patterns
- Monorepo structure from Phase 1 -- patient/queue modules will follow the same bounded context pattern
- PostgreSQL RLS multi-tenancy from Phase 1 -- all patient/queue data scoped to clinic tenant
- Auth middleware from Phase 1 -- all API endpoints require authentication with role-based access
- Design system from Phase 2 -- all UI components (cards, badges, FAB, bottom sheet, search bar) drawn from the component library
- API conventions from Phase 1 (D-27-D-30) -- REST endpoints follow `/api/v1/{resource}` pattern

### Integration Points
- Auth system (Phase 1) -- logged-in user context needed for queue operations (who checked in, who's consulting)
- Design system (Phase 2) -- queue cards, status badges, FAB, bottom sheet, search bar, toast notifications all come from component library
- Walk-in queue UX (Phase 2, D-36) -- status board layout, live badges, card-based design already wireframed
- Future: EMR (Phase 4) will extend pet profiles with clinical data and link consultations to queue entries
- Future: Scheduling (Phase 8) will merge scheduled appointments into this walk-in queue

</code_context>

<specifics>
## Specific Ideas

- Walk-in queue is the home screen (Phase 1, D-06) -- vet sees their primary workflow immediately after login
- Queue should feel like the whiteboard in real vet clinics -- live updating, glanceable, clear patient flow
- "2 taps or fewer" for returning patients is a hard requirement -- FAB -> mobile search -> tap pet is the exact flow
- Quick inline registration for new walk-ins prioritizes speed over completeness -- get them in the queue, fill details later
- Mobile number is the universal Indian identity for pet owners -- auto-detect, auto-format, unique key
- Companion animals only reflects the target market (urban/metro solo vets) -- livestock vets have different workflows
- "Kitna saal ka hai?" (How many years old?) -- approximate age input matches how Indian vets actually ask about pet age
- Vet name on In Consult cards supports the multi-vet use case without adding complexity

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope (registration, queue, search, profiles, sync, edge cases). No feature suggestions or scope creep encountered.

</deferred>

---

*Phase: 03-patient-registration-walk-in-queue*
*Context gathered: 2026-04-17*
