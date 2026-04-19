# Roadmap: Breeyo

## Overview

Breeyo goes from zero to a deployable Beta for 20 pilot clinics across 10 phases. The build follows the natural dependency chain of a veterinary practice day: foundation and auth first, then a design system and component library to establish mobile-first UX patterns before any feature UI is built, then patient registration and the walk-in queue (the primary daily workflow), then clinical records, then inventory, then billing (which ties consultation and inventory together), then WhatsApp communication (which sits on top of all modules), then scheduled appointments (layered onto the walk-in queue), then the web dashboard (admin surface for everything built so far), and finally offline hardening and integration polish. Every phase delivers a coherent, testable capability.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation & Authentication** - Monorepo, database with RLS multi-tenancy, auth system with roles, API skeleton
- [ ] **Phase 2: UI/UX Design & Design System** - Design tokens, component library, screen flow wireframes, mobile-first UX patterns, walk-in queue UX
- [ ] **Phase 3: Patient Registration & Walk-in Queue** - Pet/owner registration, walk-in queue as the primary workflow with real-time updates
- [ ] **Phase 4: EMR & Clinical Records** - SOAP notes, vitals, prescriptions, voice-to-text, medical history, audit trail
- [ ] **Phase 5: Inventory Management** - Stock tracking, barcode scanning, batch/lot/expiry management, par-level alerts, offline scanning
- [ ] **Phase 6: Invoicing & Payments** - Invoice builder with stock validation, GST calculation, Razorpay integration, payment recording
- [ ] **Phase 7: WhatsApp Communication** - Simulator with abstraction layer, appointment reminders, invoice delivery, booking flow, message log
- [ ] **Phase 8: Scheduling & Calendar** - Future appointments merging into walk-in queue, calendar views, multi-device sync, push notifications
- [ ] **Phase 9: Web Dashboard & Owner Portal** - Browser-based admin interface for analytics, inventory management, user/role management; pet owner portal via tokenised magic links for EMR access and invoice payment
- [ ] **Phase 10: Offline Hardening & Integration Polish** - Full offline sync for core mobile flows, cross-module integration testing, performance optimization

## Phase Details

### Phase 1: Foundation & Authentication
**Goal**: A solo vet can create an account, log in on their phone, and have their clinic's data isolated from every other clinic in the system
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, PLT-04, PLT-05
**Success Criteria** (what must be TRUE):
  1. User can sign up with email/password and log in via mobile OTP, with sessions persisting across app restarts
  2. User can log out from any screen in the app
  3. Admin can create users and assign roles (Admin, Clinician, Front Desk, Inventory Manager) with permissions enforced across all API endpoints
  4. Data created by Clinic A is completely invisible to Clinic B (multi-tenant isolation verified)
  5. All data is stored in the India region (AWS Mumbai)
**Plans:** 3 plans

Plans:
- [ ] 01-01-PLAN.md -- Monorepo scaffold, Prisma schema with RLS, Fastify app skeleton, Docker, test infrastructure
- [ ] 01-02-PLAN.md -- Auth system: signup, email verification, login, OTP, token refresh, logout
- [ ] 01-03-PLAN.md -- RBAC, permissions, staff management, tenant isolation tests, CI/CD

### Phase 2: UI/UX Design & Design System
**Goal**: Every screen in the app draws from a single design system with consistent tokens and reusable components, so that all subsequent feature phases build UI from pre-validated patterns instead of ad-hoc designs
**Depends on**: Phase 1
**Requirements**: UX-01, UX-02, UX-03, UX-04, UX-05
**Success Criteria** (what must be TRUE):
  1. A design token file defines the complete color palette, typography scale (at least 5 levels), spacing scale, elevation/shadow system, and border radii -- and every token is consumable by React Native and web components
  2. A component library exists with at least: Button, TextInput, Card, ListItem, Modal, BottomSheet, NavigationBar, StatusBadge -- each rendered in a Storybook-style catalog with all variants visible
  3. Screen flow wireframes exist for every major module (auth, queue, EMR, inventory, billing, scheduling, WhatsApp, dashboard) showing navigation paths and key states (empty, loading, populated, error)
  4. All interactive elements meet mobile-first targets: minimum 44x44pt tap targets, one-handed reachability for primary actions, and iconography that communicates meaning without text labels
  5. Walk-in queue UX is designed end-to-end: the 2-tap check-in flow, real-time status board layout, consultation transition animation, and queue position display are all wireframed and component-mapped
**Plans:** 3 plans
**UI hint**: yes

Plans:
- [ ] 02-01-PLAN.md -- packages/ui scaffold, design tokens (colors, typography, spacing, elevation, border radii, animation), Breeyo theme extending MD3, i18n, CSS token generator
- [ ] 02-02-PLAN.md -- Atom components (Button, TextInput, StatusBadge, Typography, Avatar, Chip, IconButton, Divider, ProgressIndicator) and molecule components (SearchBar, ListItem, FormField, EmptyState, Toast, AccordionItem, SkeletonLoader) with accessibility tests
- [ ] 02-03-PLAN.md -- Organism components (Card, Modal, BottomSheet, NavigationBar, BottomTabBar, QueueCard, WizardStepper), wireframe screens for all modules with 4 states, Storybook integration, human verification

### Phase 3: Patient Registration & Walk-in Queue
**Goal**: A front desk user can register walk-in patients and manage the queue as the primary daily workflow, with real-time updates visible on all connected devices
**Depends on**: Phase 2
**Requirements**: PAT-01, PAT-02, PAT-03, PAT-04, PAT-05, QUE-01, QUE-02, QUE-03, QUE-04, QUE-05, QUE-06
**Success Criteria** (what must be TRUE):
  1. User can register a pet owner by mobile number and link multiple pets to that owner
  2. User can check in a walk-in patient in 2 taps or fewer, with returning patients auto-filling from existing records
  3. Walk-in queue displays in real time on all connected devices, showing position and estimated wait for each entry
  4. User can move patients through queue statuses (waiting, in-consult, done, no-show) and call next patient into consultation
  5. User can search patients by owner name, mobile number, or pet name and view a pet's complete visit history
**Plans:** 6 plans
**UI hint**: yes

Plans:
- [ ] 03-01-PLAN.md -- Shared types, zod schemas, constants (species/breeds, queue status state machine, socket events), Prisma schema (Owner/Pet/QueueEntry with RLS), Wave 0 test scaffolds
- [ ] 03-02-PLAN.md -- Patient API: owner registration with per-clinic mobile uniqueness, pet registration, trigram-powered search, pet profile with visit history, mobile lookup for auto-fill
- [ ] 03-03-PLAN.md -- Queue API: check-in with position/emergency, status transitions (state machine), call-next (emergency FIFO), queue board, Socket.IO real-time broadcasting, midnight archive
- [ ] 03-04-PLAN.md -- Mobile patient screens: 2-step registration wizard, patient list with live search, pet profile with visit history, owner detail, species/breed picker
- [ ] 03-05-PLAN.md -- Mobile queue screens: queue status board (3 sections), 2-tap check-in bottom sheet, queue cards with swipe/tap gestures, Socket.IO hooks, offline banner
- [ ] 03-06-PLAN.md -- Cross-module navigation wiring, auto-check-in from registration, human verification of all 7 end-to-end flows

### Phase 4: EMR & Clinical Records
**Goal**: A vet can conduct a full consultation -- recording SOAP notes, vitals, and prescriptions -- with voice-to-text assistance and a complete audit trail
**Depends on**: Phase 3
**Requirements**: EMR-01, EMR-02, EMR-03, EMR-04, EMR-05, EMR-06, EMR-07
**Success Criteria** (what must be TRUE):
  1. User can create SOAP notes (Subjective, Objective, Assessment, Plan) and record vitals (weight, temperature, heart rate, respiratory rate) during a consultation
  2. User can write prescriptions with drug name, dosage, frequency, and duration
  3. User can use voice-to-text to transcribe clinical notes into a text field on their phone
  4. User can view a complete medical history timeline for any pet, including attached lab/imaging files
  5. All EMR changes are audit-trailed with who changed what and when
**Plans:** 7 plans
**UI hint**: yes

Plans:
- [ ] 04-01-PLAN.md -- Shared types, validators, constants (vitals ranges, body systems, drug data, vaccination intervals), Prisma schema (Consultation, Vitals, Drug, Prescription, VaccinationRecord, DewormingRecord, ConsultationAttachment, ConsultationDraft, ConsultationLock, audit triggers)
- [ ] 04-02-PLAN.md -- EMR API: consultation lifecycle (create/saveDraft/finalize/addendum), consultation locking (5-min TTL + heartbeat), dosage validation, drug search/seed, file attachment presigned URLs
- [ ] 04-03-PLAN.md -- Vaccination API: vaccination/deworming CRUD with auto-calculated next due dates, preventive care status, certificate data generation
- [ ] 04-04-PLAN.md -- Mobile consultation screen: accordion layout (7 sections), patient banner, vitals with species-aware ranges, SOAP sections with quick-pick chips, body system checklist, auto-save drafts, consultation lock UI
- [ ] 04-05-PLAN.md -- Mobile prescriptions: drug search (client-side cached), medication form, dosage warnings, owner-friendly instructions, Repeat Rx, prescription list management
- [ ] 04-06-PLAN.md -- Mobile voice-to-text (expo-speech-recognition), file attachments (S3 presigned URLs), medical history timeline, preventive care cards, weight trend chart, PDF generation (4 templates), share options
- [ ] 04-07-PLAN.md -- Navigation wiring (queue to consultation to detail), resume banner, finalized consultation detail with addendum, vaccination/deworming forms, human verification of 9 end-to-end flows

### Phase 5: Inventory Management
**Goal**: A vet or inventory manager can track stock with barcode scanning, manage batches and expiry dates, and get automatic alerts when items run low -- even when offline
**Depends on**: Phase 4
**Requirements**: INV-01, INV-02, INV-03, INV-04, INV-05, INV-06, INV-07, INV-08
**Success Criteria** (what must be TRUE):
  1. User can add inventory items and update stock quantities manually (add/remove)
  2. User can scan barcodes with their phone camera to identify and update stock items, including while offline
  3. User can record batch/lot numbers and expiry dates for each stock receipt, and the system enforces FIFO dispensing
  4. User can set par-level thresholds per item and receives alerts when stock falls below the threshold
  5. System generates want-lists of all items below par level for easy reordering
**Plans:** 7 plans
**UI hint**: yes

Plans:
- [ ] 05-01-PLAN.md -- Shared types, zod validators, constants (categories, units, reasons, barcode formats), Prisma schema (InventoryItem, StockBatch, StockMovement, InventoryBarcode with RLS + pg_trgm), test scaffolds
- [ ] 05-02-PLAN.md -- Item CRUD API: repository with trigram search, item service, stock receipt service (new batch per receipt), barcode lookup with catalog sync, inventory permissions middleware, Fastify routes
- [ ] 05-03-PLAN.md -- FIFO dispense + adjustments API: FIFO dispense service (raw SQL FOR UPDATE), stock adjustment with required reasons, stock-take service, par-level alerts, want-list with WhatsApp text, return-to-stock
- [ ] 05-04-PLAN.md -- Mobile inventory list screen (summary header, AttentionCard with tabs, search/filter/sort), item profile screen (tabbed: Batches/History/Details), item create/edit form, stock movement timeline with CSV export button
- [ ] 05-05-PLAN.md -- Mobile barcode scanner (VisionCamera V5 + bottom sheet), offline barcode cache (expo-sqlite), pending operations queue with FIFO replay, scanner/offline Zustand stores, useOfflineSync hook
- [ ] 05-06-PLAN.md -- Mobile stock receipt screen, dispense screen (FIFO batch display, quantity stepper, override, expired blocker), stock adjustment bottom sheet with reason picker, haptic + toast feedback
- [ ] 05-07-PLAN.md -- Mobile stock-take screen (scan+count, 24h session persistence), want-list with WhatsApp share, CSV export (papaparse + UTF-8 BOM), InventoryNavigator wiring, cross-phase EMR dispense hook, human verification of 10 flows

### Phase 6: Invoicing & Payments
**Goal**: A vet can generate an invoice from consultation services and dispensed items, accept real payments via UPI/card, and have payment status update automatically
**Depends on**: Phase 5
**Requirements**: BIL-01, BIL-02, BIL-03, BIL-04, BIL-05, BIL-06
**Success Criteria** (what must be TRUE):
  1. User can generate an invoice that pulls consultation services and dispensed inventory items, with real-time stock validation before finalizing
  2. User can accept payment via Razorpay (UPI and card), and payment confirmation automatically updates invoice status via webhook
  3. User can mark invoices as paid or unpaid manually and can print or export invoices as PDF
**Plans**: TBD
**UI hint**: yes

Plans:
- [ ] 06-01: TBD
- [ ] 06-02: TBD
- [ ] 06-03: TBD

### Phase 7: WhatsApp Communication
**Goal**: The clinic can communicate with pet owners via WhatsApp for reminders, invoice delivery, and appointment booking -- all through a simulator that can be swapped for the real API later
**Depends on**: Phase 6
**Requirements**: WHA-01, WHA-02, WHA-03, WHA-04, WHA-05
**Success Criteria** (what must be TRUE):
  1. System sends automated appointment reminders and delivers invoices to pet owners via WhatsApp (simulated)
  2. Pet owners can book appointments via a WhatsApp conversation flow (simulated)
  3. WhatsApp integration uses a clean abstraction layer where the simulator can be swapped for the real Meta Business API via configuration
  4. All WhatsApp message flows are logged and viewable in the dashboard
**Plans**: TBD
**UI hint**: yes

Plans:
- [ ] 07-01: TBD
- [ ] 07-02: TBD

### Phase 8: Scheduling & Calendar
**Goal**: A vet can schedule future appointments that merge into the walk-in queue at their time slot, with calendar views syncing across mobile and web in real time
**Depends on**: Phase 7
**Requirements**: SCH-01, SCH-02, SCH-03, SCH-04, SCH-05
**Success Criteria** (what must be TRUE):
  1. User can schedule a future appointment for a patient, and that appointment appears in the walk-in queue at its scheduled time
  2. User can view a calendar in day and week views, with real-time sync across mobile and web
  3. User receives push notifications for upcoming appointments and queue changes
**Plans**: TBD
**UI hint**: yes

Plans:
- [ ] 08-01: TBD
- [ ] 08-02: TBD

### Phase 9: Web Dashboard & Owner Portal
**Goal**: An admin user can manage the clinic from a browser AND pet owners can access their pet's records and pay outstanding invoices via a tokenised web portal -- no app install required
**Depends on**: Phase 8
**Requirements**: PLT-01, PLT-02, OWN-01, OWN-02, OWN-03, OWN-04, OWN-05, OWN-06
**Success Criteria** (what must be TRUE):
  1. Mobile app runs on Android 8+ and iOS 14+ via React Native/Expo with all clinical workflows functional
  2. Web dashboard is accessible via modern browsers (Chrome, Safari, Firefox) and provides admin-oriented views for queue, inventory, scheduling, billing, and user management
  3. Mobile and web share the same data and reflect changes in real time
  4. Pet owner can open a magic link from WhatsApp and view their pet's EMR history (diagnosis + prescriptions only), past invoices, and pay any outstanding balance via UPI -- without logging in or installing an app
  5. Owner portal enforces strict data isolation -- owner sees only their own pets and invoices, token mismatch returns 403 with no data exposed
**Plans**: TBD
**UI hint**: yes

Plans:
- [ ] 09-01: TBD
- [ ] 09-02: TBD

### Phase 10: Offline Hardening & Integration Polish
**Goal**: Core mobile workflows (check-in, barcode scanning, note-taking) work reliably offline with automatic sync on reconnect, and the full system is integration-tested end to end
**Depends on**: Phase 9
**Requirements**: PLT-03
**Success Criteria** (what must be TRUE):
  1. User can check in patients, scan barcodes, and take clinical notes while fully offline, with all data syncing automatically when connectivity returns
  2. Offline-to-online sync handles conflicts gracefully (no data loss, clear resolution)
  3. End-to-end workflow (walk-in check-in through invoice payment) completes without errors across mobile and web
**Plans**: TBD

Plans:
- [ ] 10-01: TBD
- [ ] 10-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Authentication | 0/3 | Planned | - |
| 2. UI/UX Design & Design System | 0/3 | Planned | - |
| 3. Patient Registration & Walk-in Queue | 0/6 | Planned | - |
| 4. EMR & Clinical Records | 0/7 | Planned | - |
| 5. Inventory Management | 0/7 | Planned | - |
| 6. Invoicing & Payments | 0/3 | Not started | - |
| 7. WhatsApp Communication | 0/2 | Not started | - |
| 8. Scheduling & Calendar | 0/2 | Not started | - |
| 9. Web Dashboard | 0/2 | Not started | - |
| 10. Offline Hardening & Integration Polish | 0/2 | Not started | - |
