# Roadmap: Breeyo

## Overview

Breeyo goes from zero to a deployable Beta for 20 pilot clinics across 10 phases. The build follows the natural dependency chain of a veterinary practice day: foundation and auth first, then a design system and component library to establish mobile-first UX patterns before any feature UI is built, then patient registration and the walk-in queue (the primary daily workflow), then clinical records, then inventory, then billing (which ties consultation and inventory together), then WhatsApp communication (which sits on top of all modules), then scheduled appointments (layered onto the walk-in queue), then the web dashboard (admin surface for everything built so far), and finally offline hardening and integration polish. Every phase delivers a coherent, testable capability.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation & Authentication** - Monorepo, database with RLS multi-tenancy, auth system with roles, API skeleton
- [x] **Phase 2: UI/UX Design & Design System** - Design tokens, component library, screen flow wireframes, mobile-first UX patterns, walk-in queue UX
- [x] **Phase 3: Patient Registration & Walk-in Queue** - Pet/owner registration, walk-in queue as the primary workflow with real-time updates
- [ ] **Phase 4: EMR & Clinical Records** - SOAP notes, vitals, prescriptions, voice-to-text, medical history, audit trail
- [ ] **Phase 5: Inventory Management** - Stock tracking, barcode scanning, batch/lot/expiry management, par-level alerts, offline scanning
- [ ] **Phase 6: Invoicing & Payments** - Invoice builder with stock validation, GST calculation, Razorpay integration, payment recording
- [ ] **Phase 7: WhatsApp Communication** - Simulator with abstraction layer, preventive-care reminders, invoice delivery, booking flow, mobile message log
- [ ] **Phase 8: Scheduling & Calendar** - Future appointments merging into walk-in queue, calendar views, multi-device sync, push notifications
- [ ] **Phase 9: Web Dashboard & Owner Portal** - Browser-based admin interface for analytics, inventory management, user/role management; pet owner portal via tokenised magic links for EMR access and invoice payment
- [ ] **Phase 10: Offline Hardening & Integration Polish** - Full offline sync for core mobile flows, cross-module integration testing, performance optimization

## Phase Details

### Phase 1: Foundation & Authentication

**Goal**: A solo vet can create an account, log in on their phone, and have their clinic's data isolated from every other clinic in the system — with infrastructure for notifications and disaster recovery from day one
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, PLT-04, PLT-05, PLT-06, NTF-01
**Success Criteria** (what must be TRUE):

  1. User can sign up with email/password and log in via mobile OTP, with sessions persisting across app restarts
  2. User can log out from any screen in the app
  3. Admin can create users and assign roles (Admin, Clinician, Front Desk, Inventory Manager) with permissions enforced across all API endpoints
  4. Data created by Clinic A is completely invisible to Clinic B (multi-tenant isolation verified)
  5. All data is stored in the India region (AWS Mumbai)
  6. Automated daily database backups are enabled with point-in-time recovery; recovery procedure is documented and tested
  7. Notification service foundation exists: push token registration (Expo), notification preferences model, and a module-agnostic dispatch API that later phases can hook into

**Plans:** 3 plans

Plans:

- [x] 01-01-PLAN.md -- Monorepo scaffold, Prisma schema with RLS, Fastify app skeleton, Docker, test infrastructure
- [x] 01-02-PLAN.md -- Auth system: signup, email verification, login, OTP, token refresh, logout
- [x] 01-03-PLAN.md -- RBAC, permissions, staff management, tenant isolation tests, CI/CD

### Phase 2: UI/UX Design & Design System

**Goal**: Every screen in the app draws from a single design system with consistent tokens and reusable components, so that all subsequent feature phases build UI from pre-validated patterns instead of ad-hoc designs
**Depends on**: Phase 1
**Requirements**: UX-01, UX-02, UX-03, UX-04, UX-05, NTF-02
**Success Criteria** (what must be TRUE):

  1. A design token file defines the complete color palette, typography scale (at least 5 levels), spacing scale, elevation/shadow system, and border radii -- and every token is consumable by React Native and web components
  2. A component library exists with at least: Button, TextInput, Card, ListItem, Modal, BottomSheet, NavigationBar, StatusBadge -- each rendered in a Storybook-style catalog with all variants visible
  3. Screen flow wireframes exist for every major module (auth, queue, EMR, inventory, billing, scheduling, WhatsApp, dashboard) showing navigation paths and key states (empty, loading, populated, error)
  4. All interactive elements meet mobile-first targets: minimum 44x44pt tap targets, one-handed reachability for primary actions, and iconography that communicates meaning without text labels
  5. Walk-in queue UX is designed end-to-end: the 2-tap check-in flow, real-time status board layout, consultation transition animation, and queue position display are all wireframed and component-mapped
  6. Notification UI components exist: NotificationBadge (nav bar unread count), NotificationList (filterable by module), and notification toast pattern — all in the component library

**Plans:** 4 plans
**UI hint**: yes

Plans:
**Wave 1**

- [x] 02-01-PLAN.md -- packages/ui scaffold, design tokens (colors, typography, spacing, elevation, border radii, animation), Breeyo theme extending MD3, i18n, CSS token generator

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 02-02-PLAN.md -- Atom components (Button, TextInput, StatusBadge, Typography, Avatar, Chip, IconButton, Divider, ProgressIndicator) and molecule components (SearchBar, ListItem, FormField, EmptyState, Toast, AccordionItem, SkeletonLoader) with accessibility tests

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 02-03-PLAN.md -- Organism components (Card, Modal, BottomSheet, NavigationBar, BottomTabBar, QueueCard, WizardStepper), wireframe screens for all modules with 4 states, Storybook integration, human verification

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 02-04-PLAN.md -- Notification UI components (NTF-02): NotificationBadge atom (nav bar unread count), NotificationItem molecule (per-notification row), NotificationList organism (filterable by module), notification screen wireframe with 4 states

### Phase 3: Patient Registration & Walk-in Queue

**Goal**: A front desk user can register walk-in patients and manage the queue as the primary daily workflow, with real-time updates visible on all connected devices — and existing practices can bulk-import their patient records
**Depends on**: Phase 2
**Requirements**: PAT-01, PAT-02, PAT-03, PAT-04, PAT-05, PAT-06, QUE-01, QUE-02, QUE-03, QUE-04, QUE-05, QUE-06, ONB-01
**Success Criteria** (what must be TRUE):

  1. User can register a pet owner by mobile number and link multiple pets to that owner
  2. User can check in a walk-in patient in 2 taps or fewer, with returning patients auto-filling from existing records
  3. Walk-in queue displays in real time on all connected devices, showing position and estimated wait for each entry
  4. User can move patients through queue statuses (waiting, in-consult, done, no-show) and call next patient into consultation
  5. User can search patients by owner name, mobile number, or pet name and view a pet's complete visit history
  6. User can bulk-import owners and pets from a CSV file (name, mobile, pet name, species, breed) with validation errors surfaced per row
  7. New clinic sees a guided first-use prompt after setup wizard: register first patient, check in, and proceed to consultation — with skip option (full onboarding path completes when Phase 6 adds invoicing)

**Plans:** 8 plans
**UI hint**: yes

Plans:

- [x] 03-01-PLAN.md -- Shared types, zod schemas, constants (species/breeds, queue status state machine, socket events), Prisma schema (Owner/Pet/QueueEntry with RLS), Wave 0 test scaffolds
- [x] 03-02-PLAN.md -- Patient API: owner registration with per-clinic mobile uniqueness, pet registration, trigram-powered search, pet profile with visit history, mobile lookup for auto-fill
- [x] 03-03-PLAN.md -- Queue API: check-in with position/emergency, status transitions (state machine), call-next (emergency FIFO), queue board, Socket.IO real-time broadcasting, midnight archive
- [x] 03-04-PLAN.md -- Mobile patient screens: 2-step registration wizard, patient list with live search, pet profile with visit history, owner detail, species/breed picker
- [x] 03-05-PLAN.md -- Mobile queue screens: queue status board (3 sections), 2-tap check-in bottom sheet, queue cards with swipe/tap gestures, Socket.IO hooks, offline banner
- [x] 03-06-PLAN.md -- Cross-module navigation wiring, auto-check-in from registration, human verification of all 7 end-to-end flows
- [x] 03-07-PLAN.md -- CSV bulk import: shared import types, server-side CSV parsing (papaparse) with per-row zod validation, multipart upload route, mobile file picker and import result screen
- [x] 03-08-PLAN.md -- Guided first-use onboarding: onboarding state model (JSONB on Clinic), OnboardingService with auto-completion hooks in PatientService and QueueService, OnboardingCard on QueueScreen

### Phase 4: EMR & Clinical Records

**Goal**: A vet can conduct a full consultation -- recording SOAP notes, vitals, and prescriptions -- with voice-to-text assistance, a complete audit trail, and pre-loaded drug/breed seed data
**Depends on**: Phase 3
**Requirements**: EMR-01, EMR-02, EMR-03, EMR-04, EMR-05, EMR-06, EMR-07, ONB-02
**Success Criteria** (what must be TRUE):

  1. User can create SOAP notes (Subjective, Objective, Assessment, Plan) and record vitals (weight, temperature, heart rate, respiratory rate) during a consultation
  2. User can write prescriptions with drug name, dosage, frequency, and duration
  3. User can use voice-to-text to transcribe clinical notes into a text field on their phone
  4. User can view a complete medical history timeline for any pet, including attached lab/imaging files
  5. All EMR changes are audit-trailed with who changed what and when
  6. System ships with seed data: drug database (200-300 common vet drugs), breed lists per species, and default service catalog presets (consultation, vaccination, surgery, grooming)

**Plans:** 8 plans
**UI hint**: yes

Plans:

- [ ] 04-01-PLAN.md -- Shared types, validators, constants (vitals ranges, body systems, drug data, vaccination intervals), Prisma schema (Consultation, Vitals, Drug, Prescription, VaccinationRecord, DewormingRecord, ConsultationAttachment, ConsultationDraft, ConsultationLock, audit triggers)
- [ ] 04-02-PLAN.md -- EMR API: consultation lifecycle (create/saveDraft/finalize/addendum), consultation locking (5-min TTL + heartbeat), dosage validation, drug search/seed, file attachment presigned URLs
- [ ] 04-03-PLAN.md -- Vaccination API: vaccination/deworming CRUD with auto-calculated next due dates, preventive care status, certificate data generation
- [ ] 04-04-PLAN.md -- Mobile consultation screen: accordion layout (7 sections), patient banner, vitals with species-aware ranges, SOAP sections with quick-pick chips, body system checklist, auto-save drafts, consultation lock UI
- [ ] 04-05-PLAN.md -- Mobile prescriptions: drug search (client-side cached), medication form, dosage warnings, owner-friendly instructions, Repeat Rx, prescription list management
- [ ] 04-06-PLAN.md -- Mobile voice-to-text (expo-speech-recognition), file attachments (S3 presigned URLs), medical history timeline, preventive care cards, weight trend chart, PDF generation (4 templates), share options
- [ ] 04-07-PLAN.md -- Navigation wiring (queue to consultation to detail), resume banner, finalized consultation detail with addendum, vaccination/deworming forms, human verification of 9 end-to-end flows
- [ ] 04-08-PLAN.md -- Service catalog: ServiceCatalog Prisma model, shared billing types/schema, 20 default service presets with GST/SAC codes, per-clinic seed function (ONB-02)

### Phase 5: Inventory Management

**Goal**: A vet or inventory manager can track stock with barcode scanning, manage batches and expiry dates, get automatic alerts when items run low, and maintain HSN/SAC codes for GST-compliant invoicing -- even when offline
**Depends on**: Phase 4
**Requirements**: INV-01, INV-02, INV-03, INV-04, INV-05, INV-06, INV-07, INV-08, INV-09
**Success Criteria** (what must be TRUE):

  1. User can add inventory items and update stock quantities manually (add/remove)
  2. User can scan barcodes with their phone camera to identify and update stock items, including while offline
  3. User can record batch/lot numbers and expiry dates for each stock receipt, and the system enforces FIFO dispensing
  4. User can set par-level thresholds per item and receives alerts when stock falls below the threshold
  5. System generates want-lists of all items below par level for easy reordering
  6. Inventory items carry HSN/SAC codes that flow through to invoice line items for GST compliance

**Plans:** 8 plans
**UI hint**: yes

Plans:

- [ ] 05-01-PLAN.md -- Shared types, zod validators, constants (categories, units, reasons, barcode formats), Prisma schema (InventoryItem, StockBatch, StockMovement, InventoryBarcode with RLS + pg_trgm), test scaffolds
- [ ] 05-02-PLAN.md -- Item CRUD API: repository with trigram search, item service, stock receipt service (new batch per receipt), barcode lookup with catalog sync, inventory permissions middleware, Fastify routes
- [ ] 05-03-PLAN.md -- FIFO dispense + adjustments API: FIFO dispense service (raw SQL FOR UPDATE), stock adjustment with required reasons, stock-take service, par-level alerts, want-list with WhatsApp text, return-to-stock
- [ ] 05-04-PLAN.md -- Mobile inventory list screen (summary header, AttentionCard with tabs, search/filter/sort), item profile screen (tabbed: Batches/History/Details), item create/edit form, stock movement timeline with CSV export button
- [ ] 05-05-PLAN.md -- Mobile barcode scanner (VisionCamera V5 + bottom sheet), offline barcode cache (expo-sqlite), pending operations queue with FIFO replay, scanner/offline Zustand stores, useOfflineSync hook
- [ ] 05-06-PLAN.md -- Mobile stock receipt screen, dispense screen (FIFO batch display, quantity stepper, override, expired blocker), stock adjustment bottom sheet with reason picker, haptic + toast feedback
- [ ] 05-07-PLAN.md -- Mobile stock-take screen (scan+count, 24h session persistence), want-list with WhatsApp share, CSV export (papaparse + UTF-8 BOM), InventoryNavigator wiring, cross-phase EMR dispense hook, human verification of 10 flows
- [ ] 05-08-PLAN.md -- HSN/SAC codes and GST rate on inventory items (INV-09): Prisma migration, shared types/validators, HSN code constants, API persistence, mobile item form with HSN autocomplete and GST rate picker, Details tab display

### Phase 6: Invoicing & Payments

**Goal**: A vet can generate a GST filing-ready invoice from consultation services and dispensed items, accept real payments via UPI/card, have payment status update automatically, and see a daily business summary
**Depends on**: Phase 5
**Requirements**: BIL-01, BIL-02, BIL-03, BIL-04, BIL-05, BIL-06, BIL-07, RPT-01
**Success Criteria** (what must be TRUE):

  1. User can generate an invoice that pulls consultation services and dispensed inventory items, with real-time stock validation before finalizing
  2. User can accept payment via Razorpay (UPI and card), and payment confirmation automatically updates invoice status via webhook
  3. User can mark invoices as paid or unpaid manually and can print or export invoices as PDF
  4. Invoices include full GST breakdown: CGST/SGST for intra-state transactions, IGST for inter-state, with HSN/SAC codes per line item pulled from inventory/service catalog
  5. Billing dashboard shows a daily summary card: patients seen today, revenue collected today, total outstanding balance

**Plans**: 20 plans

Plans:

- [ ] 06-00-PLAN.md -- [Wave 0a, BLOCKING] Tenant-client remediation (pooled client, transaction-scoped `set_config`), baseline migration for the 15 untracked Phase 3/4 tables, RLS ENABLE+FORCE and per-operation policies on all clinic-scoped tables, orphan RLS file deleted, cross-tenant isolation tests
- [ ] 06-01-PLAN.md -- [Wave 0b] Dependency provisioning: `razorpay@2.9.8`, `expo-print`/`expo-sharing`/`expo-file-system`/`react-native-svg` via `expo install`, `react-native-qrcode-svg`, `react-native-paper`, `@breeyo/ui`, PaperProvider at the mobile root, billing env contract, PDF resolution smoke test
- [ ] 06-02-PLAN.md -- [Wave 0c] Migrate all eight clinic-scoped modules to the per-request tenant client, exemption list for auth/worker/cron, HTTP-layer cross-tenant IDOR tests, `check-tenant-client.sh` CI gate
- [ ] 06-03-PLAN.md -- Prisma billing schema: 10 models (Invoice, InvoiceLineItem, Payment, PaymentReceipt, Refund, CreditNote, CreditNoteLineItem, InvoiceNumberCounter, WebhookEvent, BillingAuditLog) + D-29 Clinic settings, migration with the draft partial unique index, billing RLS policies, [BLOCKING] `prisma db push`, test factories
- [ ] 06-04-PLAN.md -- Shared contracts: billing entity types, invoice state machine (7 statuses), GST constants (slabs 0/5/18/40, Rule 46A document types, GSTIN regex), socket events, 11 Zod schemas that accept no client-supplied total
- [ ] 06-05-PLAN.md -- [TDD] GST engine: integer-paise `money.ts` with `toPaise` boundary adapter and remainder-exact pro-rata, `gst.service.ts` with per-line exempt-aware CGST/SGST/IGST, invoice-level per-head rounding and Rule 46A document typing (BIL-07)
- [ ] 06-06-PLAN.md -- [TDD] Cross-cutting primitives: gap-free per-clinic monthly numbering (counter-row `ON CONFLICT`), AES-256-GCM credential encryption, dedicated append-only `billing_audit_log` (D-15, D-19, D-29, D-32)
- [ ] 06-07-PLAN.md -- Invoice core: repository sourcing dispensed quantities from `StockMovement`, `FOR UPDATE` FIFO stock validator, single-transaction finalize (numbering + GST freeze + stock deduction), state guards, void with stock restoration (BIL-01, BIL-02, BIL-03)
- [ ] 06-08-PLAN.md -- Billing HTTP surface: 12 routes with three permission gates, `CREATE_INVOICES` removed from the Clinician seed (D-05) without breaking the D-03 draft hook, integration tests for quantity sourcing, concurrent finalize and draft immutability
- [ ] 06-09-PLAN.md -- Payments: per-clinic Razorpay client factory with credential decryption and 502 error normalisation, cash/split/Payment Link collection with a 16-minute expiry buffer, receipt records, 4 payment endpoints (BIL-05)
- [ ] 06-10-PLAN.md -- Webhook pipeline: raw-body rate-limit-exempt route with timing-safe HMAC and insert-based idempotency, BullMQ worker with clinic-room Socket.IO push, overdue and payment-link-expiry IST crons (BIL-06, D-11, D-23)
- [ ] 06-11-PLAN.md -- Refunds bounded by captured-minus-pending payments with async gateway completion, credit notes with CN numbering and frozen-rate tax that leave the invoice immutable, 6 endpoints (D-12, D-19, D-22)
- [ ] 06-12-PLAN.md -- Dashboard aggregate (D-24's four cards + RPT-01 patients-seen-today, IST-bounded, two queries), service catalog CRUD with soft deactivation, billing settings with presence-only credential reads and a webhook health flag (RPT-01, D-02, D-29)
- [ ] 06-13-PLAN.md -- D-03 best-effort draft-invoice hook in the consultation finalize path (ungated, non-blocking, idempotent) and the D-04 Quick Sale create-and-finalize endpoint with row-locked stock
- [ ] 06-14-PLAN.md -- Mobile Billing tab: five summary cards with skeletons, filterable/sortable invoice list, shared paise-only money formatter, `invoice:updated` socket subscription (RPT-01, D-24, D-28)
- [ ] 06-15-PLAN.md -- PDF templates: Rule 46-compliant invoice with Rule 46A heading switching and no tax artefact for unregistered clinics, 80mm payment receipt, credit note, plus the missing Print and Download actions (BIL-04)
- [ ] 06-16-PLAN.md -- Mobile invoice builder: catalog service add, dispensed-product hydration, line and invoice discounts, server-computed live totals, stock-shortfall banner, no total ever sent (BIL-01, BIL-02, BIL-07)
- [ ] 06-17-PLAN.md -- Mobile invoice detail with transition-table-gated action bar, payment collection sheet with device-rendered QR and push-driven confirmation, void/refund/credit-note flows (BIL-03, BIL-05, BIL-06)
- [ ] 06-18-PLAN.md -- Mobile Quick Sale cart and checkout, billing settings with write-only credential fields and GST-off default, pet-profile Invoices tab (D-04, D-25, D-29)
- [ ] 06-19-PLAN.md -- Phase gate: one-command requirement-to-test verification script with phase-wide money/tenancy/credential invariants, plus blocking human verification of the eight core flows and the GST/Razorpay-onboarding review

### Phase 7: WhatsApp Communication

**Goal**: The clinic can communicate with pet owners via WhatsApp for reminders, invoice delivery, and appointment booking -- all through a simulator that can be swapped for the real API later
**Depends on**: Phase 6
**Requirements**: WHA-01, WHA-02, WHA-03, WHA-04, WHA-05
**Success Criteria** (what must be TRUE):

  1. System sends automated follow-up, vaccination-due, and deworming-due reminders and delivers invoices to pet owners via WhatsApp (simulated)
  2. Pet owners can book appointments via a WhatsApp conversation flow (simulated)
  3. WhatsApp integration uses a clean abstraction layer where the simulator can be swapped for the real Meta Business API via configuration
  4. All WhatsApp message flows are logged and viewable in the mobile inbox/log surface used by staff

**Plans**: 16 plans
**UI hint**: yes

Plans:
**Wave 0** *(blocking prerequisites — nothing else can be verified until these land)*

- [ ] 07-01-PLAN.md -- [BLOCKING] Backfill the missing Phase 3-6 Prisma migrations (D-19) plus the Phase 7 WhatsApp data model and migration
- [ ] 07-02-PLAN.md -- Shared contracts: @breeyo/types domain types and constant tables, socket events, @breeyo/validators Zod schemas with per-template variable caps
- [ ] 07-03-PLAN.md -- Mobile UI library spike (D-17): React Native Paper v5 + @breeyo/ui on Expo SDK 52, or a recorded deviation

**Wave 1** *(blocked on Wave 0)*

- [ ] 07-04-PLAN.md -- API test infrastructure: Phase 7 factories, cleanup ordering, shared IST date module, audit events, WHATSAPP_* env vars, integration suite scaffolds
- [ ] 07-05-PLAN.md -- WaProvider port, capability guards, phone normalizer, constraint-enforcing simulator adapter, provider registry (WHA-04)
- [ ] 07-06-PLAN.md -- Mobile presentational components and UI store with a tested pure-formatting module

**Wave 2** *(blocked on Wave 1)*

- [ ] 07-07-PLAN.md -- Cloud API adapter: Meta payload mapper, error-code normalization, raw-body HMAC webhook verification, fetch-based provider (WHA-04)
- [ ] 07-08-PLAN.md -- Template registry, repository, BullMQ queues, send authorization (consent/STOP/category), persist-then-dispatch send service

**Wave 3** *(blocked on Wave 2)*

- [ ] 07-09-PLAN.md -- Delivery-status funnel with monotonic ranking, inbound router, outbound and simulator workers, unauthenticated webhook plugin (WHA-05)

**Wave 4** *(blocked on Wave 3)*

- [ ] 07-10-PLAN.md -- Booking conversation: slot generation, auto-confirm, unique-constraint slot arbitration, staff-only move and cancel (WHA-03)
- [ ] 07-11-PLAN.md -- Reminder scheduling: latest-record-only discovery, two-touch tasks, bounded escalation, daily 08:30 IST BullMQ sweep (WHA-01)

**Wave 5** *(blocked on Wave 4)*

- [ ] 07-12-PLAN.md -- API read surface: inbox filters and search, thread detail, route registration, app.ts wiring, authz and tenant-isolation tests

**Wave 6** *(blocked on Wave 5)*

- [ ] 07-13-PLAN.md -- API action surface: owner preferences, consent, Admin-only simulator config, booking move/cancel, mark resolved, invoice delivery proof
- [ ] 07-14-PLAN.md -- Mobile data layer: query-key factory, thread queries, realtime socket, mutation hooks, TemplateSendSheet

**Wave 7** *(blocked on Wave 6)*

- [ ] 07-15-PLAN.md -- Mobile inbox and thread screens with four states each, role gating (D-20), navigation, human verification

**Wave 8** *(blocked on Wave 7)*

- [ ] 07-16-PLAN.md -- Admin simulator config screen, owner preference and invalid-number flows, booking detail, cross-module send launcher, end-of-phase human verification

### Phase 8: Scheduling & Calendar

**Goal**: A vet can schedule future appointments that merge into the walk-in queue at their time slot, with calendar views syncing across mobile and web in real time
**Depends on**: Phase 7
**Requirements**: SCH-01, SCH-02, SCH-03, SCH-04, SCH-05
**Success Criteria** (what must be TRUE):

  1. User can schedule a future appointment for a patient, and that appointment appears in the walk-in queue at its scheduled time
  2. User can view a calendar in day and week views, with real-time sync across mobile and web
  3. User receives push notifications for upcoming appointments and queue changes

**Plans**: 7 plans
**UI hint**: yes

Plans:

- **Wave 1**
- [ ] 08-01-PLAN.md -- Shared scheduling contracts, Wave 0 tests, Prisma appointment schema, and blocking schema push

- **Wave 2** *(blocked on Wave 1 completion)*
- [ ] 08-02-PLAN.md -- Availability engine, schedule templates/overrides, blocked periods, reason catalog, and settings API
- [ ] 08-03-PLAN.md -- Appointment lifecycle, provisional booking, queue handoff, queue expected-arrival support, and audit-trail API

- **Wave 3** *(blocked on Wave 2 completion)*
- [ ] 08-04-PLAN.md -- Reminder producer, owner-action bridge, push/socket notifications, workers, and scheduling route registration

- **Wave 4** *(blocked on Wave 3 completion)*
- [ ] 08-05-PLAN.md -- Mobile day agenda, quick-action bottom sheet, queue scheduled badges, and WhatsApp-linked mobile state
- [ ] 08-06-PLAN.md -- Web 7-day staff-first week grid, quick drawer, realtime hook, and browser-notification prompt

- **Wave 5** *(blocked on Wave 4 completion)*
- [ ] 08-07-PLAN.md -- Mobile/web shell wiring, dashboard/sidebar schedule entry points, and human end-to-end verification

Cross-cutting constraints:

- Queue remains the mobile home surface; Scheduling is linked but separate (D-09 + project walk-in-first rule)
- Scheduled patients enter Queue as `EXPECTED` first, then become true waiting entries only after check-in (D-21, D-22)
- Mobile defaults to day agenda; dense 7-day week planning belongs to larger screens (D-02, D-03)
- Reminder timing is clinic-configurable, with shipped same-day-only defaults and `KEEP / MOVE / CANCEL` owner actions (D-25 to D-27)

### Phase 9: Web Dashboard & Owner Portal

**Goal**: An admin user can manage the clinic from a browser AND pet owners can access their pet's records, see upcoming care dates, and pay outstanding invoices via a tokenised web portal -- no app install required
**Depends on**: Phase 8
**Requirements**: PLT-01, PLT-02, OWN-01, OWN-02, OWN-03, OWN-04, OWN-05, OWN-06, OWN-07
**Success Criteria** (what must be TRUE):

  1. Mobile app runs on Android 8+ and iOS 14+ via React Native/Expo with all clinical workflows functional
  2. Web dashboard is accessible via modern browsers (Chrome, Safari, Firefox) and provides admin-oriented views for queue, inventory, scheduling, billing, and user management
  3. Mobile and web share the same data and reflect changes in real time
  4. Pet owner can open a magic link from WhatsApp and view their pet's EMR history (diagnosis + prescriptions only), upcoming vaccination/deworming due dates, next scheduled appointment, past invoices, and pay any outstanding balance via UPI -- without logging in or installing an app
  5. Owner portal enforces strict data isolation -- owner sees only their own pets and invoices, token mismatch returns 403 with no data exposed

**Plans**: 7 plans
**UI hint**: yes

Plans:

- **Wave 1** *(foundation for all web and portal work)*
- [ ] 09-01-PLAN.md -- Shared dashboard/portal contracts, browser-access + magic-link schema, and blocking schema push

- **Wave 2** *(blocked on Wave 1 completion)*
- [ ] 09-02-PLAN.md -- Browser access policy, dashboard shell/home cockpit, user-management mini-panel, and shared high-risk web UX
- [ ] 09-05-PLAN.md -- Owner-portal token validation, scoped EMR/invoice read models, combined checkout, and WhatsApp link reissue

- **Wave 3** *(module surfaces after shared shell and portal APIs exist)*
- [ ] 09-03-PLAN.md -- Inventory web workbench with stock/batch table, reordering workflow, analytics export, and mobile-first scanning boundary
- [ ] 09-04-PLAN.md -- Queue board + billing web workbench with live sync, stale-state prompts, and admin-only risky actions
- [ ] 09-06-PLAN.md -- Owner-portal web UI, deep links, payment return states, performance budget, and human verification

- **Wave 4** *(blocked on Wave 3 portal UI completion)*
- [ ] 09-07-PLAN.md -- Upcoming care dates API and portal UI: vaccination/deworming due dates + next appointment per pet (OWN-07)

Cross-cutting constraints:

- Browser/mobile must share one live data model and surface stale/conflict prompts instead of silently overwriting edits.
- Unauthorized browser modules/actions are hidden, not shown as locked placeholders.
- Owner portal stays read-only for EMR, uses 7-day tokenised links, and never exposes pets/invoices outside the validated owner scope.

### Phase 10: Offline Hardening & Integration Polish

**Goal**: Core mobile workflows (check-in, barcode scanning, note-taking) work reliably offline with automatic sync on reconnect, performance targets are verified on real hardware, and the full system is integration-tested end to end
**Depends on**: Phase 9
**Requirements**: PLT-03, PLT-07
**Success Criteria** (what must be TRUE):

  1. User can check in patients, scan barcodes, and take clinical notes while fully offline, with all data syncing automatically when connectivity returns
  2. Offline-to-online sync handles conflicts gracefully (no data loss, clear resolution)
  3. End-to-end workflow (walk-in check-in through invoice payment) completes without errors across mobile and web
  4. Performance targets verified on mid-range Android: app cold start < 3s, API p95 < 500ms, queue real-time update < 2s (measured since Phase 3, final verification here)

**Plans**: 7 plans

Plans:

- **Wave 1**
- [ ] 10-01-PLAN.md -- Shared offline-sync contracts, transactional local replay foundation, sync persistence schema, and blocking schema push

- **Wave 2** *(blocked on Wave 1 completion)*
- [ ] 10-02-PLAN.md -- Queue offline check-in/status replay, optimistic local queue truth, and queue-first reconnect preemption
- [ ] 10-03-PLAN.md -- EMR offline note-taking, clinician-owned conflict resolution, and consultation replay safeguards
- [ ] 10-04-PLAN.md -- Inventory offline barcode/stock actions, FIFO-safe reconciliation, and lighter operational conflict review

- **Wave 3** *(blocked on Wave 2 completion)*
- [ ] 10-05-PLAN.md -- Calm sync badge, actionable failure center, retry escalation, replay broadcasts, and browser stale-state prompts

- **Wave 4** *(blocked on Wave 3 completion)*
- [ ] 10-06-PLAN.md -- Automated integration proof harnesses, repeated disconnect drills, WhatsApp-triggered recovery proof, and final human verification
- [ ] 10-07-PLAN.md -- Performance target verification (PLT-07): API p95, queue real-time latency, and cold start benchmarks with real mid-range Android hardware confirmation

Cross-cutting constraints:

- Offline queue actions are operationally real and replay before all other backlog work (D-03, D-12 to D-14)
- Clinical conflicts use structured compare-and-resolve flow with clinician ownership, and unresolved items stay visible until cleared (D-05 to D-11, D-24)
- Offline storage stays limited to the same-day working set plus narrow read-only fallback, not a full clinic-history mirror (D-15 to D-17)
- Sync state stays visible through a calm badge, actionable failure center, and subtle recovery cue during normal clinic use (D-18 to D-23)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10

**Implementation Progress:**

| Phase | Plans | Status | Merged to Main |
|-------|-------|--------|----------------|
| 1. Foundation & Authentication | 3/3 | **Done** | 2026-08-03 (PR #3) |
| 2. UI/UX Design & Design System | 4/4 | **Done** | 2026-08-03 (PR #3) |
| 3. Patient Registration & Walk-in Queue | 8/8 | **Done** | 2026-08-03 (PR #3) |
| 4. EMR & Clinical Records | 8/8 | Next | - |
| 5. Inventory Management | 8/8 | Planned | - |
| 6. Invoicing & Payments | 4/4 | Planned | - |
| 7. WhatsApp Communication | 16/16 | Planned | - |
| 8. Scheduling & Calendar | 7/7 | Planned | - |
| 9. Web Dashboard & Owner Portal | 7/7 | Planned | - |
| 10. Offline Hardening & Integration Polish | 7/7 | Planned | - |

**Planning Audit View:**
This table tracks planning-packet readiness by phase.

| Phase | Plans Authored | Planning Packet | Audit Readiness |
|-------|----------------|-----------------|-----------------|
| 1. Foundation & Authentication | 3/3 | Complete | **Implemented** |
| 2. UI/UX Design & Design System | 4/4 | Complete | **Implemented** |
| 3. Patient Registration & Walk-in Queue | 8/8 | Complete | **Implemented** |
| 4. EMR & Clinical Records | 8/8 | Context, research, research addendum, discussion log, UI spec, validation, plans present | Ready |
| 5. Inventory Management | 8/8 | Context, research, discussion log, UI spec, validation, plans present | Ready |
| 6. Invoicing & Payments | 4/4 | Context, research, discussion log, UI spec, validation, plans present | Ready |
| 7. WhatsApp Communication | 16/16 | Context, research, discussion log, UI spec, validation, plans present | Ready |
| 8. Scheduling & Calendar | 7/7 | Context, research, discussion log, UI spec, validation, and full plan set present | Ready |
| 9. Web Dashboard & Owner Portal | 7/7 | Context, research, discussion log, UI spec, validation, plans present | Ready |
| 10. Offline Hardening & Integration Polish | 7/7 | Context, research, discussion log, validation, and full plan set present | Ready |

> **2026-07-30 gap review:** All phases have complete plan coverage. Phase 5 (INV-09) is the only remaining gap.
> **2026-08-03 implementation update:** Phases 01-03 implemented and merged to main via PR #3. 15 of 67 plans completed (30%).
