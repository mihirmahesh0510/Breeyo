# Breeyo — Product Work Done

*Last updated: 2026-08-12*

## Product vision

Breeyo is a mobile-first veterinary practice management platform for solo and small-team vets in India, replacing paper registers, WhatsApp groups, and manual invoicing with one system for walk-ins, medical records, inventory, billing, and pet owner communication — all from a phone.

**Core value:** Solo vets can manage their entire practice from their phone without spending time on admin work.
**North Star metric:** Patients managed per clinic per day.
**Target market:** 40,000+ solo/small-team vet clinics in India, $2.8B TAM, 32M+ registered pets. See [`Product/strategy/product-strategy-canvas.md`](../Product/strategy/product-strategy-canvas.md) for the full competitive landscape.

## Product definition artifacts (complete for all 10 phases)

All discovery and definition work for the full roadmap is done, ahead of build — every phase has a PRD, even ones that haven't started building yet.

| Artifact | Location | Covers |
|---|---|---|
| Product overview | [`Product/prds/PRD-00-product-overview.md`](../Product/prds/PRD-00-product-overview.md) | Vision, market, architecture summary |
| Personas | [`Product/personas/`](../Product/personas/) | Dr. Priya (solo vet), Receptionist Rekha (front desk), Manager Mohan (inventory), Owner Ananya (pet owner) |
| Product strategy canvas | [`Product/strategy/product-strategy-canvas.md`](../Product/strategy/product-strategy-canvas.md) | Competitive positioning, pricing |
| App flow | [`Product/App-Flow.md`](../Product/App-Flow.md) | Cross-module navigation and user journeys |
| Per-phase PRDs | [`Product/prds/PRD-01`](../Product/prds/PRD-01-authentication-rbac.md) through [`PRD-10`](../Product/prds/PRD-10-offline-hardening.md) | Auth, patient/queue, EMR, inventory, invoicing, WhatsApp, scheduling, web dashboard + owner portal, offline hardening |

## Features shipped (Phases 1–4)

### Phase 1 — Foundation & Authentication
- Email/password signup + mobile OTP login, sessions persist across app restarts
- Role-based access (Admin, Clinician, Front Desk, Inventory Manager) enforced on every API endpoint
- Multi-tenant data isolation (Clinic A cannot see Clinic B's data), verified
- Data residency in AWS Mumbai; automated daily backups with point-in-time recovery
- Notification foundation: push token registration, preferences model, dispatch API for later phases to hook into

### Phase 2 — UI/UX Design System
- Full design token system (color, typography, spacing, elevation, border radii) shared across mobile and web
- Component library: Button, TextInput, Card, ListItem, Modal, BottomSheet, NavigationBar, StatusBadge, and more (26 components total)
- Screen-flow wireframes for every module (auth, queue, EMR, inventory, billing, scheduling, WhatsApp, dashboard) across 4 states each (empty, loading, populated, error)
- Mobile-first interaction standards: 44x44pt tap targets, one-handed reachability
- End-to-end walk-in queue UX: 2-tap check-in flow, real-time status board, consultation transition
- Notification UI: badge, filterable list, toast pattern

### Phase 3 — Patient Registration & Walk-in Queue
- Pet owner registration by mobile number, multiple pets per owner
- 2-tap walk-in check-in with auto-fill for returning patients
- Real-time queue board across all connected devices (position + estimated wait)
- Full queue lifecycle: waiting → in-consult → done/no-show, emergency call-next
- Patient search by owner name, mobile, or pet name; complete visit history per pet
- CSV bulk import for owners/pets with per-row validation
- Guided first-use onboarding flow for new clinics

### Phase 4 — EMR & Clinical Records *(built, pending merge to `main`)*
- SOAP note capture (Subjective, Objective, Assessment, Plan) with vitals (weight, temp, heart rate, respiratory rate)
- Prescription writing with drug name, dosage, frequency, duration, and dosage-safety warnings
- Voice-to-text transcription for clinical notes
- Complete medical history timeline per pet, including attached lab/imaging files
- Full audit trail on every EMR change (who, what, when)
- Seed data: 200–300 common vet drugs, breed lists per species, 20 default service-catalog presets with GST/SAC codes
- PDF generation (4 templates) for prescriptions/records, with share options
- Vaccination and deworming tracking with auto-calculated next-due dates and preventive-care status

## What's next (planned but not yet built)

- **Phase 5 — Inventory Management:** stock tracking, barcode scanning, batch/lot/expiry management, low-stock alerts — offline-capable
- **Phase 6 — Invoicing & Payments:** GST-compliant invoice builder, Razorpay (UPI/card) payments, daily business summary
- **Phase 7 — WhatsApp Communication:** reminders, invoice delivery, and booking via a simulator swappable for the real WhatsApp Business API
- **Phase 8 — Scheduling & Calendar:** future appointments merging into the walk-in queue, synced across devices
- **Phase 9 — Web Dashboard & Owner Portal:** browser admin console; tokenised magic-link portal for pet owners to view records and pay invoices
- **Phase 10 — Offline Hardening & Integration Polish:** offline-first sync for core mobile flows, performance verification, full integration testing

## Known product gaps

- WhatsApp Business API Meta verification not yet started (Phase 7 is currently scoped against a simulator)
- Full guided onboarding (ONB-01) partially scaffolded, not complete
