# Feature Research

**Domain:** Veterinary Practice Management SaaS (India-focused)
**Researched:** 2026-04-10
**Confidence:** MEDIUM (domain knowledge; web research unavailable)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Patient registration (pet + owner) | Every vet needs to record who walked in | LOW | Owner mobile number as primary key; link multiple pets per owner |
| Walk-in queue management | 80%+ of Indian vet visits are walk-ins; this IS the workflow | MEDIUM | Real-time queue display; status tracking (waiting, in-consult, done) |
| Basic medical records (SOAP notes) | Legal requirement and standard of care; vets cannot operate without records | MEDIUM | Subjective, Objective, Assessment, Plan fields; history view per pet |
| Prescription writing | Every consultation ends with a prescription | LOW | Drug name, dosage, frequency, duration; print/share capability |
| Basic invoicing | Vets need to bill patients | MEDIUM | Line items from consultation + drugs; GST calculation; print/PDF |
| Owner contact management | Need to reach pet owners for follow-ups | LOW | Mobile number, name, address; WhatsApp-reachable flag |
| Appointment history per pet | Vet needs to see what happened last time | LOW | Timeline view of all visits, treatments, prescriptions |
| Search patients | Finding a pet/owner record quickly is essential during walk-in rush | LOW | Search by owner name, mobile number, pet name |
| User authentication | Multi-user access requires secure login | LOW | Email/password + OTP for Indian users; role-based access |
| Basic inventory tracking | Know what drugs/supplies are in stock | MEDIUM | Item list, quantities, basic add/remove |
| Payment recording | Track what's been paid vs outstanding | LOW | Mark invoices as paid/unpaid; payment method (cash, UPI, card) |

### Differentiators (Competitive Advantage)

Features that set Breeyo apart from paper-based or existing digital alternatives.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| WhatsApp-native communication | Pet owners already live on WhatsApp; no app install needed for owners | HIGH | Appointment reminders, invoice delivery, booking — all via WhatsApp |
| Voice-to-text for clinical notes | Vets can dictate notes while examining animals; saves 30%+ admin time | MEDIUM | Basic speech-to-text for Beta; structured mapping in v1.5 |
| Mobile barcode scanning for inventory | Instant stock updates from phone camera; no separate hardware needed | MEDIUM | Expo camera API; offline scan queue with sync |
| Smart par-level alerts | Auto-detect when stock is low; generate reorder list | MEDIUM | Configurable par levels per item; notification when threshold hit |
| Batch/lot tracking with expiry | Prevent dispensing expired drugs; FIFO enforcement | HIGH | Lot numbers, expiry dates, auto-FIFO; critical for drug safety |
| Real payment gateway (UPI) | Instant digital payment in consultation; no cash handling | MEDIUM | Razorpay integration; UPI QR code generation; webhook confirmation |
| WhatsApp pay links | Send invoice via WhatsApp with embedded payment link; close loop digitally | MEDIUM | Depends on WhatsApp API + Razorpay payment links |
| Multi-device calendar sync | Vet and front desk see same real-time view | MEDIUM | Socket.IO for live updates; works across mobile and web |
| Offline-capable mobile | Works in areas with spotty connectivity; data syncs when back online | HIGH | Local storage for critical flows; conflict resolution on sync |
| Automated appointment reminders | Reduce no-shows; free up vet time from manual follow-up | LOW | Cron-based trigger; WhatsApp template messages |
| Cloud pet profiles | Owner changes vet? Records follow the pet. Multi-clinic visibility | MEDIUM | Requires consent model; unified ID by owner mobile + pet |
| GST-compliant invoicing | Auto-calculate GST; generate compliant invoice format | MEDIUM | CGST/SGST/IGST rules; HSN codes for vet services/drugs |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| AI diagnosis suggestions | "Smart" vet tool marketing | Regulatory minefield in India; liability unclear; vets don't trust AI for diagnosis in Beta | Focus on AI-assisted data capture (voice-to-text) instead of diagnosis |
| Real-time chat with pet owners | Seems modern and convenient | Vets overwhelmed with WhatsApp messages already; adding in-app chat creates another channel to monitor | Use WhatsApp as single communication channel; don't fragment |
| Complex appointment scheduling | Calendar-first booking like Western clinics | Indian vet clinics are walk-in dominant; forcing appointments on walk-in workflow frustrates users | Walk-in queue as default; optional scheduled slots layered on top |
| Comprehensive analytics dashboard | Data-driven decisions | Solo vets with 15-25 patients/day don't need complex analytics yet; builds complexity before value | Basic metrics (patients/day, revenue/day, inventory alerts) sufficient for Beta |
| Multi-language beyond Hindi/English | India has 22 official languages | Exponential translation/testing cost; Hindi + English covers vast majority of target users in metros/Tier 1 | Start with English + Hindi; add languages based on demand post-Beta |
| Image-to-text for handwritten notes | Digitize existing paper records | OCR accuracy for medical handwriting is poor; creates false confidence in data quality | Manual entry for existing records; voice-to-text for new records |
| Vendor auto-ordering | Auto-order when stock is low | Requires vendor API integrations that don't exist in Indian vet supply chain; adds fragile dependencies | Generate want-lists for manual ordering; vendors catch up later |

## Feature Dependencies

```
[User Auth]
    └──requires──> [Database/API Foundation]

[Walk-in Queue]
    └──requires──> [Patient Registration]
                       └──requires──> [User Auth]

[SOAP Notes / EMR]
    └──requires──> [Patient Registration]
    └──enhances──> [Walk-in Queue] (auto-create record from queue entry)

[Prescriptions]
    └──requires──> [SOAP Notes]
    └──enhances──> [Inventory] (auto-deduct from stock)

[Invoicing]
    └──requires──> [Patient Registration]
    └──requires──> [Prescriptions] (line items from consultation)
    └──enhances──> [Inventory] (stock validation on invoice)

[Payment Gateway]
    └──requires──> [Invoicing]

[WhatsApp Integration]
    └──requires──> [Patient Registration] (owner contact info)
    └──enhances──> [Invoicing] (delivery via WhatsApp)
    └──enhances──> [Appointments] (reminders)

[Inventory Management]
    └──requires──> [Database/API Foundation]

[Barcode Scanning]
    └──requires──> [Inventory Management]

[Batch/Expiry Tracking]
    └──requires──> [Inventory Management]

[Voice-to-Text]
    └──enhances──> [SOAP Notes]

[Appointment Scheduling]
    └──requires──> [Walk-in Queue] (must coexist)
    └──enhances──> [Calendar Sync]

[Calendar Sync]
    └──requires──> [Appointment Scheduling]
    └──requires──> [Real-time Infrastructure (WebSockets)]
```

### Dependency Notes

- **Invoicing requires Prescriptions:** Invoice line items are derived from consultation services + dispensed drugs
- **Walk-in Queue requires Patient Registration:** Can't queue a patient without basic identity
- **WhatsApp enhances everything:** Communication layer sits on top; can be added incrementally via simulator then real API
- **Batch/Expiry requires Inventory:** Must have base inventory before adding lot tracking
- **Payment Gateway requires Invoicing:** Payment is triggered from invoice; can't process payment without knowing amount

## MVP Definition

### Launch With (v1 Beta)

Minimum viable product for 20 pilot solo vet clinics.

- [ ] User auth with email/password + OTP — secure multi-user access
- [ ] Patient registration (pet + owner by mobile number) — foundation for everything
- [ ] Walk-in queue with real-time updates — the primary daily workflow
- [ ] SOAP notes with basic vitals — legal requirement, core clinical workflow
- [ ] Prescription writing — every consultation ends with this
- [ ] Basic inventory (add/remove items, stock levels) — vets need to know what's in stock
- [ ] Barcode scanning for inventory — mobile-first stock management
- [ ] Batch/lot tracking with expiry alerts — drug safety compliance
- [ ] Par-level alerts and want-list generation — prevent stockouts
- [ ] Invoice builder with GST calculation — billing is essential
- [ ] Real payment gateway (Razorpay UPI) — pet owners expect digital payment
- [ ] WhatsApp simulator for messaging flows — build flows now, real API later
- [ ] Voice-to-text for clinical notes — key differentiator for vet adoption
- [ ] Basic appointment scheduling alongside walk-in queue — optional layer
- [ ] Multi-device sync (mobile + web) — vet on mobile, front desk on web
- [ ] Role-based access (Admin, Clinician, Front Desk, Inventory) — multi-user clinics

### Add After Validation (v1.x)

Features to add once core is working with pilot clinics.

- [ ] Real WhatsApp Business API integration — when Meta verification completes
- [ ] Automated appointment reminders via WhatsApp — reduce no-shows
- [ ] WhatsApp invoice delivery with pay links — close billing loop
- [ ] Lab/imaging result attachment to EMR — complete medical record
- [ ] Cloud pet profiles across clinics — requires consent model
- [ ] Advanced analytics dashboard — once there's enough data to analyze
- [ ] Multi-location support — when expanding beyond solo vets

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] AI diagnosis suggestions — regulatory clarity needed
- [ ] Telemedicine module — separate product initiative
- [ ] Vendor auto-ordering API — Indian supply chain not ready
- [ ] Pet insurance data layer — strategic play, not core value
- [ ] Image-to-text for handwritten notes — OCR accuracy insufficient
- [ ] Multi-language beyond Hindi/English — demand-driven

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Walk-in queue management | HIGH | MEDIUM | P1 |
| Patient registration | HIGH | LOW | P1 |
| SOAP notes / EMR | HIGH | MEDIUM | P1 |
| Prescription writing | HIGH | LOW | P1 |
| Basic invoicing + GST | HIGH | MEDIUM | P1 |
| User auth + roles | HIGH | MEDIUM | P1 |
| Payment gateway (UPI) | HIGH | MEDIUM | P1 |
| Basic inventory tracking | HIGH | MEDIUM | P1 |
| Barcode scanning | MEDIUM | MEDIUM | P1 |
| Batch/expiry tracking | MEDIUM | HIGH | P1 |
| Voice-to-text | MEDIUM | MEDIUM | P1 |
| WhatsApp simulator | MEDIUM | MEDIUM | P1 |
| Appointment scheduling | MEDIUM | MEDIUM | P2 |
| Multi-device sync | MEDIUM | MEDIUM | P2 |
| Par-level alerts | MEDIUM | LOW | P1 |
| Automated reminders | MEDIUM | LOW | P2 |
| Cloud pet profiles | LOW | HIGH | P3 |
| Analytics dashboard | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for Beta launch
- P2: Should have, add during Beta
- P3: Nice to have, post-Beta

## Competitor Feature Analysis

| Feature | Pet360 | Simplivet | VetPort | Breeyo Approach |
|---------|--------|-----------|---------|-----------------|
| Walk-in queue | No (appt-first) | No | No | Default mode; walk-in first design |
| WhatsApp integration | Basic (manual) | None | None | Native channel for all communication |
| Mobile app | Limited | Web only | Web only | Mobile-first with Expo |
| Voice input | None | None | None | Speech-to-text for clinical notes |
| UPI payments | None | None | None | Razorpay with UPI QR codes |
| Barcode scanning | Desktop scanner | None | None | Phone camera scanning |
| GST invoicing | Partial | Basic | None | Auto GST calculation with HSN codes |
| Offline support | None | None | None | Core flows work offline |
| India localization | Minimal | None | None | Hindi + English; Indian workflows |

## Sources

- Domain knowledge: veterinary practice management software patterns
- India veterinary market analysis (PRD context)
- Competitor research: Pet360, Simplivet, VetPort, VetBuddy, Vetlify, Vetinstant, vetPMS
- Indian payment ecosystem patterns (UPI, Razorpay)
- WhatsApp Business API usage patterns in India
- Confidence: MEDIUM — competitor analysis based on PRD context, not live product testing

---
*Feature research for: Veterinary Practice Management SaaS (India)*
*Researched: 2026-04-10*
