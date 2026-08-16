# PRD-00: Breeyo Product Overview

**Type:** Master PRD
**Status:** Draft
**Author:** Auto-generated
**Date:** 2026-08-03

---

## 1. Product Vision

Breeyo is a mobile-first veterinary practice management platform for solo and small-team vets in India. It replaces paper registers, WhatsApp groups, and manual invoicing with a single system that handles walk-ins, medical records, inventory, billing, and pet owner communication -- all from a phone.

**Core Value:** Solo vets can manage their entire practice -- walk-ins, medical records, inventory, and billing -- from their phone without spending time on admin work.

**North Star Metric:** Patients managed per clinic per day.

---

## 2. Market Context

| Dimension | Detail |
|-----------|--------|
| **TAM** | $2.8B Indian veterinary services market |
| **Target clinics** | 40,000+ solo and small-team vet clinics in metro and Tier 1/2 cities |
| **Pet population** | 32M+ registered pets, growing 10-15% annually |
| **Dominant workflow** | 80%+ walk-in visits (not appointments) |
| **Communication channel** | WhatsApp is the de facto business communication tool |
| **Price sensitivity** | Rs 999-3,000/month per clinic |
| **Competitive gap** | No dominant digital solution; existing tools are US-centric, desktop-first, or lack WhatsApp integration |

For the full competitive landscape and strategic positioning, see the [Product Strategy Canvas](../strategy/product-strategy-canvas.md).

---

## 3. Target Users

| Persona | Role | Type | Detail |
|---------|------|------|--------|
| **Dr. Priya** | Solo vet / clinic owner | Primary | Manages all aspects of practice; 15-25 patients/day; needs mobile-first, minimal admin |
| **Receptionist Rekha** | Front desk staff | Secondary | Handles check-in, queue, invoicing; needs clear role boundaries |
| **Manager Mohan** | Inventory manager | Secondary | Tracks stock, batches, expiry; needs barcode scanning and alerts |
| **Owner Ananya** | Pet owner | Tertiary | Interacts via WhatsApp and owner portal; needs records access and payment |

Full persona documents: [`product/personas/`](../personas/)

---

## 4. Architecture Summary

- **Monorepo:** Turborepo + pnpm workspaces (TypeScript throughout)
- **Mobile:** Expo SDK 52 (React Native) -- primary interface for clinical workflows
- **Web:** Next.js -- admin dashboard and pet owner portal
- **API:** Fastify 5 + Prisma ORM + PostgreSQL 16 (RLS multi-tenancy)
- **Real-time:** Socket.IO + Redis pub/sub
- **Queue/Jobs:** BullMQ + Redis
- **Auth:** JWT with refresh token rotation, SMS OTP, RBAC with per-user overrides
- **Validation:** Zod schemas shared via `@breeyo/validators`
- **Hosting:** AWS Mumbai (ap-south-1) for data residency

---

## 5. Feature Roadmap

Breeyo is built across 10 phases, each delivering a coherent, testable capability. The sequence follows the natural dependency chain of a veterinary practice day.

### Phase 1: Foundation & Authentication
> A solo vet can create an account, log in on their phone, and have their clinic's data isolated from every other clinic.

| Aspect | Detail |
|--------|--------|
| **Status** | Complete |
| **Key deliverables** | SMS OTP login, JWT sessions, RBAC (4 roles), RLS multi-tenancy, audit logging, backup/recovery |
| **Requirements** | AUTH-01 through AUTH-06, PLT-04, PLT-05, PLT-06, NTF-01 |
| **Detailed PRD** | [PRD-01: Authentication & RBAC](PRD-01-authentication-rbac.md) |

### Phase 2: UI/UX Design & Design System
> Every screen draws from a single design system with consistent tokens and reusable components.

| Aspect | Detail |
|--------|--------|
| **Status** | Complete |
| **Key deliverables** | Design tokens, 26-component library (atomic design), screen wireframes for all modules, notification UI components |
| **Requirements** | UX-01 through UX-05, NTF-02 |
| **Detailed PRD** | N/A (design spec, not a product feature) |

### Phase 3: Patient Registration & Walk-in Queue
> A front desk user can register walk-in patients and manage the queue as the primary daily workflow.

| Aspect | Detail |
|--------|--------|
| **Status** | Complete |
| **Key deliverables** | Pet/owner registration, 2-tap check-in, real-time queue board, patient search (trigram), CSV bulk import, guided onboarding |
| **Requirements** | PAT-01 through PAT-06, QUE-01 through QUE-06, ONB-01 |
| **Detailed PRD** | [PRD-03: Patient Registration & Walk-in Queue](PRD-03-patient-registration-queue.md) |

### Phase 4: EMR & Clinical Records
> A vet can conduct a full consultation -- SOAP notes, vitals, prescriptions -- with voice-to-text and a complete audit trail.

| Aspect | Detail |
|--------|--------|
| **Status** | Planned |
| **Key deliverables** | SOAP notes (accordion layout), species-aware vitals, prescriptions with dosage warnings, voice-to-text, vaccination/deworming tracking, printable PDFs, medical history timeline, drug/breed seed data |
| **Requirements** | EMR-01 through EMR-07, ONB-02 |
| **Detailed PRD** | [PRD-04: EMR & Clinical Records](PRD-04-emr-clinical-records.md) |

### Phase 5: Inventory Management
> A vet or inventory manager can track stock with barcode scanning, manage batches and expiry, and get automatic reorder alerts.

| Aspect | Detail |
|--------|--------|
| **Status** | Planned |
| **Key deliverables** | Item catalog, stock receipts with batch/lot tracking, barcode scanning (offline-capable), FIFO dispensing, par-level alerts, want-list generation, stock-take, HSN/SAC codes for GST |
| **Requirements** | INV-01 through INV-09 |
| **Detailed PRD** | [PRD-05: Inventory Management](PRD-05-inventory-management.md) |

### Phase 6: Invoicing & Payments
> A vet can generate GST-compliant invoices from consultation services and dispensed items, and accept payments via UPI/card.

| Aspect | Detail |
|--------|--------|
| **Status** | Planned |
| **Key deliverables** | Invoice builder (auto-populated from consultation + inventory), Quick Sale/POS, Razorpay Payment Links (UPI + card), split payments, refunds and credit notes, GST breakdown (CGST/SGST/IGST), PDF export, daily billing summary |
| **Requirements** | BIL-01 through BIL-07, RPT-01 |
| **Detailed PRD** | [PRD-06: Invoicing & Payments](PRD-06-invoicing-payments.md) |

### Phase 7: WhatsApp Communication
> The clinic can communicate with pet owners via WhatsApp for reminders, invoice delivery, and appointment booking.

| Aspect | Detail |
|--------|--------|
| **Status** | Planned |
| **Key deliverables** | WhatsApp simulator with provider abstraction (config-swappable for real API), automated reminders (vaccination/deworming/follow-up), invoice delivery, booking conversation flow, mobile message inbox, consent management |
| **Requirements** | WHA-01 through WHA-05 |
| **Detailed PRD** | [PRD-07: WhatsApp Communication](PRD-07-whatsapp-communication.md) |

### Phase 8: Scheduling & Calendar
> A vet can schedule future appointments that merge into the walk-in queue, with calendar views syncing across devices.

| Aspect | Detail |
|--------|--------|
| **Status** | Planned |
| **Key deliverables** | Availability engine (templates + overrides), appointment lifecycle (provisional -> confirmed -> expected -> waiting), mobile day agenda, web week grid, reminder producer (WhatsApp + push), multi-device real-time sync |
| **Requirements** | SCH-01 through SCH-05 |
| **Detailed PRD** | [PRD-08: Scheduling & Calendar](PRD-08-scheduling-calendar.md) |

### Phase 9a: Web Admin Dashboard
> An admin can manage the clinic from a browser -- queue oversight, inventory management, billing, and user management.

| Aspect | Detail |
|--------|--------|
| **Status** | Planned |
| **Key deliverables** | Operations cockpit (today-first), queue panel, scheduling panel, inventory workbench (deepest module), billing workbench, user management, role-shaped browser access, cross-device real-time sync |
| **Requirements** | PLT-01, PLT-02 |
| **Detailed PRD** | [PRD-09a: Web Admin Dashboard](PRD-09a-web-dashboard.md) |

### Phase 9b: Pet Owner Portal
> A pet owner can view their pet's records, see upcoming care dates, and pay invoices -- via a WhatsApp magic link, no app install.

| Aspect | Detail |
|--------|--------|
| **Status** | Planned |
| **Key deliverables** | Magic link access (7-day token, no login), overview-first home, read-only medical history, upcoming care dates, invoice list with UPI payment (Razorpay), strict data isolation (owner sees only their own pets) |
| **Requirements** | OWN-01 through OWN-07 |
| **Detailed PRD** | [PRD-09b: Pet Owner Portal](PRD-09b-owner-portal.md) |

### Phase 10: Offline Hardening & Integration Polish
> Core clinic workflows remain trustworthy through connectivity loss and recovery, with proven end-to-end integration.

| Aspect | Detail |
|--------|--------|
| **Status** | Planned |
| **Key deliverables** | Offline sync engine (SQLite ledger), conflict resolution (review-before-overwrite), sync visibility (calm badge + failure center), reconnect priority (queue first), integration proof on real hardware, multi-hour offline survival |
| **Requirements** | PLT-03, PLT-07 |
| **Detailed PRD** | [PRD-10: Offline Hardening & Integration Polish](PRD-10-offline-hardening.md) |

---

## 6. Dependency Chain

```
Phase 1: Foundation & Auth
    └── Phase 2: Design System
        └── Phase 3: Patient Registration & Queue
            └── Phase 4: EMR & Clinical Records
                └── Phase 5: Inventory Management
                    └── Phase 6: Invoicing & Payments
                        └── Phase 7: WhatsApp Communication
                            └── Phase 8: Scheduling & Calendar
                                └── Phase 9: Web Dashboard & Owner Portal
                                    └── Phase 10: Offline Hardening & Integration
```

Each phase depends on the one before it. Phases 1-3 are complete. Phase 4 is next.

---

## 7. Requirements Coverage

All 58 v1 requirements are mapped to phases:

| Category | IDs | Phase | PRD |
|----------|-----|-------|-----|
| Authentication | AUTH-01 to AUTH-06 | 1 | [PRD-01](PRD-01-authentication-rbac.md) |
| UX/Design | UX-01 to UX-05 | 2 | N/A |
| Patient | PAT-01 to PAT-06 | 3 | [PRD-03](PRD-03-patient-registration-queue.md) |
| Queue | QUE-01 to QUE-06 | 3 | [PRD-03](PRD-03-patient-registration-queue.md) |
| EMR | EMR-01 to EMR-07 | 4 | [PRD-04](PRD-04-emr-clinical-records.md) |
| Inventory | INV-01 to INV-09 | 5 | [PRD-05](PRD-05-inventory-management.md) |
| Billing | BIL-01 to BIL-07 | 6 | [PRD-06](PRD-06-invoicing-payments.md) |
| Reporting | RPT-01 | 6 | [PRD-06](PRD-06-invoicing-payments.md) |
| WhatsApp | WHA-01 to WHA-05 | 7 | [PRD-07](PRD-07-whatsapp-communication.md) |
| Scheduling | SCH-01 to SCH-05 | 8 | [PRD-08](PRD-08-scheduling-calendar.md) |
| Platform | PLT-01 to PLT-02 | 9 | [PRD-09a](PRD-09a-web-dashboard.md) |
| Owner Portal | OWN-01 to OWN-07 | 9 | [PRD-09b](PRD-09b-owner-portal.md) |
| Platform | PLT-03, PLT-07 | 10 | [PRD-10](PRD-10-offline-hardening.md) |
| Platform | PLT-04 to PLT-06 | 1 | [PRD-01](PRD-01-authentication-rbac.md) |
| Notifications | NTF-01 | 1 | [PRD-01](PRD-01-authentication-rbac.md) |
| Notifications | NTF-02 | 2 | N/A |
| Onboarding | ONB-01 | 3 | [PRD-03](PRD-03-patient-registration-queue.md) |
| Onboarding | ONB-02 | 4 | [PRD-04](PRD-04-emr-clinical-records.md) |

---

## 8. Key Constraints

| Constraint | Impact |
|------------|--------|
| **WhatsApp API not approved** | All WhatsApp features built against simulator; swap via config when Meta approves |
| **Price sensitivity (Rs 999-3,000/month)** | Architecture must be cost-efficient to operate |
| **Data residency** | All data stored in AWS Mumbai (ap-south-1) |
| **Mobile-first on mid-range Android** | Must work on Android 8+, mid-range devices (Galaxy A14 / Redmi Note 12 class) |
| **Offline support** | Core scanning and data entry must work offline with auto-sync |
| **GST compliance** | Invoices must include CGST/SGST/IGST with HSN/SAC codes |
| **Walk-in coexistence** | Scheduling must never conflict with or impede walk-in patient flow |

---

## 9. Beta Targets

- **20 pilot clinics**, mostly solo vets in metro and Tier 1/2 cities
- **60%+ daily active usage** among pilot clinics
- Full EMR data model, automated reminders, batch/expiry tracking, WhatsApp pay links (simulated), multi-user access
- All 10 phases delivered and integration-tested

---

## 10. Document Map

```
product/
├── strategy/
│   └── product-strategy-canvas.md      # Strategic positioning, OKRs, competitive landscape
│
├── personas/
│   ├── solo-vet-dr-priya.md            # Primary persona: solo vet / clinic owner
│   ├── front-desk-staff.md             # Secondary persona: receptionist
│   ├── inventory-manager.md            # Secondary persona: inventory manager
│   └── pet-owner.md                    # Tertiary persona: pet owner (portal user)
│
├── prds/
│   ├── PRD-00-product-overview.md      # This document (master index)
│   ├── PRD-01-authentication-rbac.md   # Phase 1: Auth, sessions, RBAC, multi-tenancy
│   ├── PRD-03-patient-registration-queue.md  # Phase 3: Registration, queue, CSV import
│   ├── PRD-04-emr-clinical-records.md  # Phase 4: SOAP notes, prescriptions, voice, PDFs
│   ├── PRD-05-inventory-management.md  # Phase 5: Stock, barcodes, batches, FIFO, alerts
│   ├── PRD-06-invoicing-payments.md    # Phase 6: Invoices, Razorpay, GST, daily summary
│   ├── PRD-07-whatsapp-communication.md # Phase 7: Simulator, reminders, booking, inbox
│   ├── PRD-08-scheduling-calendar.md   # Phase 8: Appointments, calendar, notifications
│   ├── PRD-09a-web-dashboard.md        # Phase 9a: Browser admin dashboard
│   ├── PRD-09b-owner-portal.md         # Phase 9b: Pet owner portal (magic links)
│   └── PRD-10-offline-hardening.md     # Phase 10: Offline sync, conflict resolution
│
└── App-Flow.md                         # Application flow documentation
```

---

*This is the master PRD for Breeyo. Each phase PRD contains the full specification: user stories, acceptance criteria, success metrics, risks, and open questions. Start with this document for the product overview, then drill into individual PRDs for implementation detail.*
