# Requirements: Breeyo

**Defined:** 2026-04-10
**Core Value:** Solo vets can manage their entire practice — walk-ins, medical records, inventory, and billing — from their phone without spending time on admin work.

## v1 Requirements

Requirements for Beta launch (20 pilot clinics, solo vets).

### Authentication & Access

- [ ] **AUTH-01**: User can sign up with email and password
- [ ] **AUTH-02**: User can log in via mobile OTP
- [ ] **AUTH-03**: User session persists across app restarts (token refresh)
- [ ] **AUTH-04**: Admin can assign roles: Admin, Clinician, Front Desk, Inventory Manager
- [ ] **AUTH-05**: Role-based permissions restrict access to authorized features only
- [ ] **AUTH-06**: User can log out from any screen

### Patient Management

- [ ] **PAT-01**: User can register a pet owner with mobile number as primary identifier
- [ ] **PAT-02**: User can register a pet linked to an owner (name, species, breed, age, weight)
- [ ] **PAT-03**: User can link multiple pets to one owner
- [ ] **PAT-04**: User can search patients by owner name, mobile number, or pet name
- [ ] **PAT-05**: User can view pet profile with complete visit history

### Walk-in Queue

- [ ] **QUE-01**: User can check in a walk-in patient in 2 taps or fewer
- [ ] **QUE-02**: Queue displays in real time across all connected devices (mobile + web)
- [ ] **QUE-03**: User can see queue position and estimated wait for each entry
- [ ] **QUE-04**: User can update queue entry status (waiting, in-consult, done, no-show)
- [ ] **QUE-05**: User can call next patient from queue into consultation
- [ ] **QUE-06**: Returning patient auto-fills from existing records on checkin

### EMR / Clinical Records

- [ ] **EMR-01**: User can create SOAP notes (Subjective, Objective, Assessment, Plan) for a consultation
- [ ] **EMR-02**: User can record vitals (weight, temperature, heart rate, respiratory rate)
- [ ] **EMR-03**: User can write prescriptions with drug name, dosage, frequency, and duration
- [ ] **EMR-04**: User can view complete medical history timeline for any pet
- [ ] **EMR-05**: User can use voice-to-text to transcribe clinical notes into a text field
- [ ] **EMR-06**: User can attach lab/imaging result files to a consultation record
- [ ] **EMR-07**: All EMR changes are audit-trailed (who changed what, when)

### Inventory Management

- [ ] **INV-01**: User can add inventory items with name, category, unit, and price
- [ ] **INV-02**: User can update stock quantities manually (add/remove)
- [ ] **INV-03**: User can scan barcodes with phone camera to identify and update stock items
- [ ] **INV-04**: User can record batch/lot numbers and expiry dates for each stock receipt
- [ ] **INV-05**: System enforces FIFO dispensing (oldest batch dispensed first)
- [ ] **INV-06**: User can set par-level thresholds per item; system alerts when stock falls below
- [ ] **INV-07**: System generates want-lists of items below par level for reordering
- [ ] **INV-08**: Barcode scanning works offline and syncs when connectivity returns

### Invoicing & Payments

- [ ] **BIL-01**: User can generate an invoice from consultation services and dispensed items
- [ ] **BIL-02**: Invoice validates stock availability in real time before finalizing
- [ ] **BIL-03**: User can mark invoices as paid or unpaid
- [ ] **BIL-04**: User can print or export invoice as PDF
- [ ] **BIL-05**: User can accept payment via Razorpay (UPI and card)
- [ ] **BIL-06**: Payment confirmation updates invoice status automatically (via webhook)

### WhatsApp Communication (Simulator)

- [ ] **WHA-01**: System sends automated appointment reminders via WhatsApp (simulated)
- [ ] **WHA-02**: System delivers invoices to pet owners via WhatsApp (simulated)
- [ ] **WHA-03**: Pet owners can book appointments via WhatsApp conversation (simulated)
- [ ] **WHA-04**: WhatsApp integration uses abstraction layer (simulator swappable for real API)
- [ ] **WHA-05**: All WhatsApp message flows are logged and viewable in dashboard

### Scheduling & Calendar

- [ ] **SCH-01**: User can schedule future appointments for a patient
- [ ] **SCH-02**: Scheduled appointments appear in the walk-in queue at their time slot
- [ ] **SCH-03**: User can view calendar in day and week views
- [ ] **SCH-04**: Calendar syncs in real time across mobile and web (multi-device)
- [ ] **SCH-05**: User receives push notifications for upcoming appointments and queue changes

### Platform & Infrastructure

- [ ] **PLT-01**: Mobile app runs on Android 8+ and iOS 14+ via React Native/Expo
- [ ] **PLT-02**: Web dashboard accessible via modern browsers (Chrome, Safari, Firefox)
- [ ] **PLT-03**: Core mobile flows (checkin, barcode scan, note-taking) work offline with auto-sync
- [ ] **PLT-04**: Multi-tenant architecture with data isolation (Clinic A cannot see Clinic B data)
- [ ] **PLT-05**: All data stored in India-region data center (AWS Mumbai)

## v2 Requirements

Deferred to post-Beta. Tracked but not in current roadmap.

### Billing Enhancements

- **BIL-07**: Full GST-compliant invoicing with CGST/SGST/IGST breakdown and HSN/SAC codes
- **BIL-08**: Payment link generation shareable via WhatsApp/SMS
- **BIL-09**: WhatsApp invoice delivery with embedded pay links (real API)

### Localization

- **LOC-01**: Hindi language support for all UI screens
- **LOC-02**: English + Hindi toggle accessible from settings

### Advanced Features

- **ADV-01**: Cloud pet profiles accessible across clinics (with owner consent)
- **ADV-02**: Advanced analytics dashboard (patients/day, revenue trends, inventory turnover)
- **ADV-03**: Multi-location dashboard for clinic chains
- **ADV-04**: Real WhatsApp Business API integration (replace simulator)
- **ADV-05**: Interactive WhatsApp responses (keep/move/cancel appointment)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| AI diagnosis suggestions | Regulatory minefield in India; liability unclear; deferred to v1.5 |
| Telemedicine module | Separate product initiative; deferred to v2.0 |
| Vendor auto-ordering API | Indian vet supply chain APIs don't exist; deferred to v2.0 |
| Pet insurance data layer | Strategic play, not core value; deferred to v2.0 |
| Image-to-text for handwritten notes | OCR accuracy for medical handwriting is poor; deferred to v1.5 |
| Multi-language beyond Hindi/English | Translation cost prohibitive; English + Hindi covers target users |
| Real-time chat with pet owners | WhatsApp handles this natively; in-app chat fragments communication |
| OAuth/social login | Email/password + OTP sufficient for Beta |
| Pet owner ratings/feedback | Open question; not in Beta scope |
| Grooming appointments | Open question; not in Beta scope |
| Back-data migration tooling | Important but separate from core platform build |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | — | Pending |
| AUTH-02 | — | Pending |
| AUTH-03 | — | Pending |
| AUTH-04 | — | Pending |
| AUTH-05 | — | Pending |
| AUTH-06 | — | Pending |
| PAT-01 | — | Pending |
| PAT-02 | — | Pending |
| PAT-03 | — | Pending |
| PAT-04 | — | Pending |
| PAT-05 | — | Pending |
| QUE-01 | — | Pending |
| QUE-02 | — | Pending |
| QUE-03 | — | Pending |
| QUE-04 | — | Pending |
| QUE-05 | — | Pending |
| QUE-06 | — | Pending |
| EMR-01 | — | Pending |
| EMR-02 | — | Pending |
| EMR-03 | — | Pending |
| EMR-04 | — | Pending |
| EMR-05 | — | Pending |
| EMR-06 | — | Pending |
| EMR-07 | — | Pending |
| INV-01 | — | Pending |
| INV-02 | — | Pending |
| INV-03 | — | Pending |
| INV-04 | — | Pending |
| INV-05 | — | Pending |
| INV-06 | — | Pending |
| INV-07 | — | Pending |
| INV-08 | — | Pending |
| BIL-01 | — | Pending |
| BIL-02 | — | Pending |
| BIL-03 | — | Pending |
| BIL-04 | — | Pending |
| BIL-05 | — | Pending |
| BIL-06 | — | Pending |
| WHA-01 | — | Pending |
| WHA-02 | — | Pending |
| WHA-03 | — | Pending |
| WHA-04 | — | Pending |
| WHA-05 | — | Pending |
| SCH-01 | — | Pending |
| SCH-02 | — | Pending |
| SCH-03 | — | Pending |
| SCH-04 | — | Pending |
| SCH-05 | — | Pending |
| PLT-01 | — | Pending |
| PLT-02 | — | Pending |
| PLT-03 | — | Pending |
| PLT-04 | — | Pending |
| PLT-05 | — | Pending |

**Coverage:**
- v1 requirements: 48 total
- Mapped to phases: 0
- Unmapped: 48 (will be mapped during roadmap creation)

---
*Requirements defined: 2026-04-10*
*Last updated: 2026-04-10 after initial definition*
