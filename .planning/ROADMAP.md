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
- [ ] **Phase 9: Web Dashboard** - Browser-based admin interface for analytics, inventory management, user/role management
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
**Plans**: TBD

Plans:
- [ ] 01-01: TBD
- [ ] 01-02: TBD
- [ ] 01-03: TBD

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
**Plans**: TBD
**UI hint**: yes

Plans:
- [ ] 02-01: TBD
- [ ] 02-02: TBD
- [ ] 02-03: TBD

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
**Plans**: TBD
**UI hint**: yes

Plans:
- [ ] 03-01: TBD
- [ ] 03-02: TBD
- [ ] 03-03: TBD

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
**Plans**: TBD
**UI hint**: yes

Plans:
- [ ] 04-01: TBD
- [ ] 04-02: TBD
- [ ] 04-03: TBD

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
**Plans**: TBD
**UI hint**: yes

Plans:
- [ ] 05-01: TBD
- [ ] 05-02: TBD
- [ ] 05-03: TBD

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

### Phase 9: Web Dashboard
**Goal**: An admin user can manage the clinic from a browser -- viewing the queue, managing inventory, handling user roles, and monitoring WhatsApp messages on a larger screen
**Depends on**: Phase 8
**Requirements**: PLT-01, PLT-02
**Success Criteria** (what must be TRUE):
  1. Mobile app runs on Android 8+ and iOS 14+ via React Native/Expo with all clinical workflows functional
  2. Web dashboard is accessible via modern browsers (Chrome, Safari, Firefox) and provides admin-oriented views for queue, inventory, scheduling, billing, and user management
  3. Mobile and web share the same data and reflect changes in real time
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
| 1. Foundation & Authentication | 0/3 | Not started | - |
| 2. UI/UX Design & Design System | 0/3 | Not started | - |
| 3. Patient Registration & Walk-in Queue | 0/3 | Not started | - |
| 4. EMR & Clinical Records | 0/3 | Not started | - |
| 5. Inventory Management | 0/3 | Not started | - |
| 6. Invoicing & Payments | 0/3 | Not started | - |
| 7. WhatsApp Communication | 0/2 | Not started | - |
| 8. Scheduling & Calendar | 0/2 | Not started | - |
| 9. Web Dashboard | 0/2 | Not started | - |
| 10. Offline Hardening & Integration Polish | 0/2 | Not started | - |
