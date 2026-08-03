# Breeyo

## What This Is

A mobile-first, cloud-based veterinary practice management platform for Indian vet clinics. Breeyo combines appointment booking, electronic medical records (EMR), inventory management, and invoicing into a single system — with WhatsApp as the primary pet owner communication channel and AI-assisted data capture for vets. The immediate target is solo veterinarians (1-2 staff, 15-25 patients/day) in metro and Tier 1/2 cities.

## Core Value

Solo vets can manage their entire practice — walk-ins, medical records, inventory, and billing — from their phone without spending time on admin work.

## Requirements

### Validated

- [x] Multi-user access with role-based permissions (Admin, Clinician, Front Desk, Inventory Manager) — Phase 01
- [x] Mobile app for clinical workflows (vets and staff) — Phase 01-03
- [x] Walk-in queue as the default patient flow, with scheduled appointments layered on top — Phase 03
- [x] Unified cloud pet profiles linked by owner mobile number, accessible across clinics — Phase 03

### Active

- [ ] WhatsApp-based appointment booking, reminders, and invoice delivery (simulated initially, real API later)
- [ ] Voice-to-text transcription for clinical notes (basic speech-to-text, not structured SOAP mapping yet)
- [ ] Full EMR data model: SOAP notes, vitals, lab/imaging, prescriptions, billing
- [ ] Mobile barcode scanning for inventory with offline support
- [ ] Smart par-level alerts and auto-generated want-lists for reordering
- [ ] Batch/lot tracking with expiry management and FIFO dispensing
- [ ] Invoice builder with real-time stock validation and GST auto-calculation
- [ ] Real payment gateway integration (Razorpay/similar) for UPI and card payments
- [ ] WhatsApp invoice delivery with embedded pay links (simulated initially)
- [ ] Automated appointment reminders with interactive keep/move/cancel responses
- [ ] Multi-device calendar sync (mobile + web) with push notifications
- [ ] Web dashboard for admin, analytics, and inventory management

### Out of Scope

- Image-to-text transcription for handwritten notes — deferred to V1.5
- AI diagnosis suggestions — deferred to V1.5, needs regulatory clarity
- Telemedicine module — deferred to V2.0
- Vendor auto-ordering API — deferred to V2.0
- Pet insurance data layer — deferred to V2.0, Phase 3 strategic play
- Multi-location dashboard — deferred to V1.5
- OAuth/social login — email/password + OTP sufficient for Beta
- Real-time chat between vet and pet owner — WhatsApp handles this natively
- Pet owner ratings/feedback for vets — open question, not in Beta
- Grooming appointments — open question, not in Beta
- Back-data migration tooling — important but separate from core platform build

## Context

**Market:** India has 40,000+ targetable vet clinics, mostly operating on paper records, WhatsApp for communication, and manual invoicing. Pet ownership is growing 10-15% annually (32M+ pets). The market is $2.8B TAM with no dominant digital solution.

**User reality:** Solo vets (Dr. Priya persona) are the primary Beta target. They see 15-25 patients/day, mostly walk-ins. They're comfortable with smartphones and WhatsApp but don't use desktop software much. They spend 30%+ of time on admin. They want to reduce paperwork, not learn a complex system.

**Walk-in culture:** Indian vet clinics are walk-in dominant. The appointment system must treat walk-ins as the default mode, not an exception. Scheduled appointments are an optimization on top of the walk-in queue.

**WhatsApp dependency:** WhatsApp Business API requires Meta Business verification (not yet started). Beta will use a WhatsApp simulator/mock to build and test all flows. Real API integration swapped in when access is granted. This is the single biggest external dependency.

**Voice input strategy:** Full voice-to-structured-SOAP-notes is the long-term vision but technically risky for Beta. Starting with basic speech-to-text transcription into a text field. Vets review and manually place content into structured fields. Structured auto-mapping comes post-Beta.

**Payment integration:** Real payment gateway (Razorpay or similar) from day one. Indian pet owners expect UPI payments. Invoice-to-payment cycle target: 7 days average for Year 1.

**Competitive landscape:** Existing solutions (Pet360, Simplivet, VetPort, VetBuddy, Vetlify, Vetinstant, vetPMS) are either US-centric, desktop-first, or lack WhatsApp integration. Breeyo's edge is mobile-first UX, WhatsApp-native communication, and India-specific workflows (GST, UPI, walk-in culture).

**Business model:** B2B SaaS subscription, ₹999-₹3,000/month per clinic. Price sensitivity is real — Indian vet clinics operate on thin margins.

**Beta targets:** 20 pilot clinics, mostly solo vets. Full EMR data model, automated reminders, batch/expiry tracking, WhatsApp pay links (simulated), multi-user access.

## Constraints

- **WhatsApp API**: Not yet approved — all WhatsApp features built against simulator/mock until Meta Business verification completes
- **Price sensitivity**: Monthly subscription must stay within ₹999-₹3,000 range — architecture must be cost-efficient to operate
- **Data residency**: All data must be stored in India-region data centers (AWS Mumbai / Azure India)
- **Mobile-first**: Must work well on mid-range Android smartphones (Android 8+) — this is the primary device for solo vets
- **Offline support**: Core scanning and data entry must work offline with auto-sync on reconnect
- **GST compliance**: Invoicing must generate GST-compliant invoices with input/output tax tracking
- **Localization**: English and Hindi at launch
- **Digital literacy**: UI must be intuitive enough for semi-urban practitioners with limited software experience
- **Walk-in coexistence**: Appointment system must never conflict with or impede walk-in patient flow

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Walk-in queue as default mode | Indian vet clinics are 80%+ walk-in; forcing appointments would break existing workflow | — Pending |
| WhatsApp simulator for Beta | Meta Business verification not started; can't block development on external dependency | — Pending |
| Basic speech-to-text first | Structured voice-to-SOAP mapping is technically risky; basic transcription delivers value with less risk | — Pending |
| Mobile app + web dashboard | Vets need mobile for clinical work; admin/analytics needs a larger screen | — Pending |
| Real payment gateway from day one | Pet owners expect UPI; simulating payments doesn't test the real user experience | — Pending |
| Solo vet focus for Beta | Largest market segment; simpler multi-user requirements; faster iteration cycles | — Pending |
| Tech stack: research-informed | No pre-existing codebase; let domain research recommend optimal stack for this use case | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-08-03 after Phase 03 merge to main*
