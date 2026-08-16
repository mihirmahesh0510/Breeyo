# Breeyo — Product Strategy Canvas

**Version:** 1.0
**Date:** 2026-08-03
**Author:** Product Team

---

## 1. Strategy Context

### Company Mission

Breeyo exists to modernize veterinary practice management for Indian clinics — starting with the solo practitioner who currently runs their entire practice on paper registers, WhatsApp groups, and mental arithmetic. The platform replaces fragmented manual workflows with a single mobile-first tool that handles walk-ins, medical records, inventory, billing, and pet owner communication.

### Market Context

India's veterinary care market is at an inflection point:

- **40,000+ targetable vet clinics** across metro, Tier 1, and Tier 2 cities, the vast majority still operating on paper records
- **32M+ registered pets** with pet ownership growing at **10-15% annually**, driven by urbanization, nuclear families, and rising disposable incomes
- **$2.8B Total Addressable Market** in veterinary services, with no dominant digital practice management solution
- **Walk-in culture:** Unlike Western markets where appointments dominate, **80%+ of Indian vet visits are walk-ins** — patients show up unscheduled, wait their turn, and leave. Any solution that imposes an appointment-first model will fail
- **WhatsApp dependency:** WhatsApp is the de facto communication channel for Indian small businesses. Pet owners expect vaccination reminders, payment links, and prescription photos via WhatsApp — not email, not SMS, not a separate app
- **Price sensitivity:** Solo vets in Tier 2 cities net Rs 50,000-1,50,000/month. Software spend must stay within **Rs 999-3,000/month** to achieve adoption

### Competitive Landscape

| Competitor | Weakness Relative to Breeyo |
|---|---|
| **Pet360** | Desktop-first, no walk-in queue, limited India localization |
| **Simplivet** | US-centric workflows, no WhatsApp integration, English-only |
| **VetPort** | Enterprise pricing, complex onboarding, no mobile-first UX |
| **VetBuddy** | Limited feature depth, no real-time queue management |
| **Vetlify** | No offline capability, no GST/UPI integration |
| **Vetinstant** | Telemedicine focus, not practice management |
| **vetPMS** | Legacy desktop application, no mobile app |

**Key insight:** Every existing competitor is either (a) built for Western markets with appointment-centric workflows, (b) desktop-first requiring a clinic computer, or (c) lacking WhatsApp-native communication. No product combines mobile-first UX, walk-in queue management, WhatsApp integration, and India-specific compliance (GST, UPI, DPDP Act) in a single platform.

### Company OKRs (Beta Phase)

| Objective | Key Results |
|---|---|
| **Prove product-market fit with Indian solo vets** | 20 pilot clinics onboarded; 60%+ daily active usage after 30 days |
| **Validate the walk-in-first workflow** | Average check-in time under 10 seconds for returning patients; 90%+ of daily patients managed through the queue |
| **Establish technical foundation for scale** | Multi-tenant architecture supporting 100+ concurrent clinics; real-time sync latency under 500ms; offline-capable core flows |

---

## 2. Target Customer

### Primary Persona: Dr. Rajan — The Solo Vet

> *Detailed persona to be developed at `../personas/solo-vet.md`*

- **Profile:** Solo veterinarian, 30-45 years old, runs a 200-400 sq ft clinic in a metro or Tier 1/2 city with 0-2 support staff (typically a compounder or receptionist)
- **Daily reality:** Sees 15-25 patients/day, almost all walk-ins. Juggles clinical care, record-keeping, inventory ordering, and billing personally. Uses a paper register, WhatsApp for owner communication, and a calculator for invoicing
- **Technology comfort:** Proficient with WhatsApp and basic Android apps. Uses a mid-range Android phone (Rs 10,000-20,000). No clinic computer. Intermittent 4G connectivity
- **Pain points:** Loses 60-90 minutes/day on paperwork. Cannot look up past visit history quickly. Runs out of medicines without warning. Manually calculates GST on handwritten bills. Has no systematic follow-up or reminder process
- **Jobs to Be Done:**
  1. "Help me manage the stream of walk-in patients without losing track of who is waiting"
  2. "Let me record clinical notes quickly so I can find them when the patient returns"
  3. "Track my medicine stock so I never run out of commonly used drugs"
  4. "Generate GST-compliant bills without manual calculation"
  5. "Send vaccination reminders to pet owners without maintaining a separate WhatsApp list"

### Secondary Persona: Meera — The Front Desk Staff

> *Detailed persona to be developed at `../personas/front-desk.md`*

- **Profile:** Receptionist or compounder at a 2-3 vet clinic, 20-35 years old, handles patient registration, queue management, and basic billing
- **Technology comfort:** Comfortable with WhatsApp and basic phone apps. May have limited English literacy — Hindi UI critical
- **Pain points:** Manually tracks who is waiting on paper. Asks every walk-in "Have you been here before?" because there is no lookup system. Calls out names in the waiting area with no priority system
- **Jobs to Be Done:**
  1. "Check in patients in seconds, not minutes"
  2. "Instantly know if a pet owner has visited before"
  3. "Tell the vet who is next without walking into the consult room"

### Secondary Persona: Priya — The Pet Owner

> *Detailed persona to be developed at `../personas/pet-owner.md`*

- **Profile:** Urban pet owner, 25-40 years old, owns 1-2 dogs or cats. Communicates with the clinic exclusively via WhatsApp
- **Jobs to Be Done:**
  1. "Get a reminder when my pet's vaccination is due instead of relying on my own memory"
  2. "Pay the clinic bill via UPI without carrying cash"
  3. "Access my pet's health records when visiting a new vet or during travel"

---

## 3. Problem Framing

### Core Problem Statement

**I am** a solo veterinarian in India
**Trying to** manage my entire practice — walk-in patients, medical records, medicine stock, and billing — without dedicated admin staff
**But** every tool I find is either built for Western clinics with appointment-based workflows, requires a desktop computer I do not have, or costs more than I can justify
**Because** no one has built practice management software that understands how Indian vet clinics actually work — walk-in queues, WhatsApp communication, GST invoicing, UPI payments, and Hindi-speaking staff
**Which makes me feel** overwhelmed by paperwork, anxious about missed follow-ups, and frustrated that I spend more time on administration than on treating animals.

### Supporting Problem Dimensions

| Dimension | Current State | Desired State |
|---|---|---|
| **Patient check-in** | Ask name, flip through paper register, write new entry (~2-3 minutes) | Enter mobile number, auto-detect returning patient, tap to check in (~10 seconds) |
| **Visit history** | Flip through months of paper registers trying to find a specific pet | Search by name or mobile, see complete chronological history instantly |
| **Queue management** | Shout names in the waiting area, mentally track who is next | Real-time digital queue board visible on all staff devices, automatic "call next" |
| **Clinical records** | Scribble on paper, sometimes illegible later | Structured SOAP notes with voice-to-text, searchable digital records |
| **Inventory** | Discover stock-outs when a patient needs a medicine | Automated low-stock alerts, batch/expiry tracking, barcode scanning |
| **Billing** | Hand-calculate GST on paper, no payment tracking | Auto-generated GST invoices, UPI/Razorpay payment links via WhatsApp |
| **Follow-ups** | Rely on pet owner's memory for vaccination due dates | Automated WhatsApp reminders with booking links |

### Why Now

1. **Smartphone penetration:** India crossed 800M smartphone users in 2025. Even solo vets in Tier 2 cities now carry Android phones capable of running the app
2. **UPI ubiquity:** UPI processed 14B+ transactions/month in 2025 — digital payments are no longer aspirational, they are expected
3. **WhatsApp Business API maturation:** The WhatsApp Business Platform now supports message templates, payment links, and automated responses — enabling clinic-to-owner workflows that were impossible 2 years ago
4. **Pet economy boom:** India's pet care market is growing 10-15% annually. More pets means more clinic visits, more pressure on manual systems, and more willingness to invest in efficiency tools
5. **Regulatory push:** India's Digital Personal Data Protection (DPDP) Act is creating compliance requirements that paper-based clinics cannot meet — digital record-keeping is becoming a regulatory necessity, not just a convenience

---

## 4. Opportunities

### Opportunity 1: Walk-in Queue Digitization (Market Gap: Critical)

**Insight:** 80%+ of Indian vet visits are walk-ins. No existing product treats walk-in queue management as the primary workflow — they all bolt it onto an appointment system.

**Opportunity:** Build the queue board as the home screen of the app. Make check-in a 2-tap process (enter mobile, tap pet). Provide real-time multi-device sync so the vet, front desk, and waiting area display all see the same queue state.

**Size:** Directly impacts 100% of daily clinic operations. A clinic seeing 20 patients/day performs 20 check-ins, 20 status transitions, and 20 completions — the queue is touched more than any other feature.

### Opportunity 2: WhatsApp-Native Pet Owner Communication (Market Gap: Unserved)

**Insight:** Indian pet owners do not download clinic apps. They communicate via WhatsApp. Vaccination reminders sent via SMS or email have 10-15% open rates; WhatsApp messages achieve 90%+.

**Opportunity:** Build all pet owner communication through WhatsApp — appointment confirmations, vaccination reminders, payment links, prescription summaries. The pet owner never needs to install anything.

**Size:** Estimated 5-8 WhatsApp messages per patient per year (reminders, invoices, follow-ups). At 20 patients/day per clinic, this is 100-160 messages/day per clinic — a high-engagement channel.

### Opportunity 3: Mobile-First EMR for Phone-Only Clinics (Market Gap: Poorly Served)

**Insight:** Solo vets do not have clinic computers. They need to enter SOAP notes, record vitals, and write prescriptions on a 6-inch phone screen while the patient is on the examination table.

**Opportunity:** Build a clinical record system optimized for mobile input — large tap targets, voice-to-text for subjective notes, pre-populated medication lists, one-handed operation. Eliminate the need for a desktop entirely for clinical workflows.

**Size:** Each consult generates one clinical record. At 20 patients/day, that is 20 EMR entries/day per clinic — the second most frequent action after queue management.

### Opportunity 4: Integrated GST-Compliant Invoicing (Market Gap: Fragmented)

**Insight:** Indian vet clinics must charge 18% GST on services and 5-18% on medicines. Most calculate this manually or use generic billing apps that do not understand veterinary line items.

**Opportunity:** Auto-generate GST invoices from completed consultations — services, dispensed medicines, and procedures all flow into a single bill. Support UPI payment collection via Razorpay-generated payment links sent through WhatsApp.

**Size:** Every patient visit generates an invoice. Invoicing is both a daily workflow (20+/day) and a compliance requirement.

### Opportunity 5: Intelligent Inventory Management with Expiry Tracking (Market Gap: Manual)

**Insight:** Veterinary medicines have batch numbers and expiry dates. Solo vets frequently discover expired stock or stock-outs at the moment they need a medicine — during a consultation.

**Opportunity:** Barcode-scannable inventory with automated low-stock alerts, expiry warnings (30/60/90 days), and batch-level tracking. Link dispensing directly to consultation records so inventory decrements automatically.

**Size:** A typical small vet clinic manages 200-500 SKUs. Stock-outs directly impact revenue and patient care.

---

## 5. Solution Hypotheses

### H1: Walk-in Queue & Patient Registration

**If we** build a walk-in queue as the app's home screen with 2-tap check-in (mobile number lookup + pet selection), real-time multi-device sync, and emergency prioritization
**For** solo vets and their front desk staff managing 15-25 walk-in patients per day
**Then** average check-in time will drop from 2-3 minutes to under 10 seconds, queue mismanagement (skipped patients, lost track of waiting order) will be eliminated, and the queue board will become the primary reason to keep the app open all day.

**Validation status:** Phase 3 complete. Core queue and patient registration APIs built and tested (64 test cases). Mobile screens implemented. Ready for pilot validation.

### H2: Mobile-First EMR with Voice Input

**If we** provide structured SOAP note templates with voice-to-text for the subjective section, pre-populated vitals entry (species-specific normal ranges), and one-tap prescription generation from a clinic's medication catalog
**For** solo vets entering clinical records on their phone during or immediately after consultations
**Then** clinical record completion rate will exceed 80% (vs. near-zero with paper-based systems), and vets will be able to retrieve complete visit history for any patient within 5 seconds.

**Validation status:** Phase 4 (next). Architecture planned, building on Phase 3 QueueEntry-to-consultation linking.

### H3: Inventory with Barcode Scanning and Expiry Alerts

**If we** enable barcode scanning for stock intake, automatic batch/expiry tracking, configurable low-stock thresholds, and auto-decrement on dispensing from consultation records
**For** solo vets who currently manage 200-500 medicine SKUs with manual counting and paper ledgers
**Then** stock-out frequency will decrease by 50%+, expired medicine waste will be reduced, and time spent on monthly inventory counts will drop significantly.

**Validation status:** Phase 5 (planned). Barcode scanning requires camera permissions and offline-capable lookup.

### H4: GST-Compliant Invoicing with Digital Payments

**If we** auto-generate GST invoices from completed consultations (services + dispensed medicines) and enable UPI payment collection via Razorpay payment links sent through WhatsApp
**For** solo vets who currently hand-calculate GST on paper bills and accept only cash
**Then** invoice generation time will drop from 5-10 minutes to under 30 seconds, payment collection rate will improve (digital payment links reduce "I'll pay next time"), and GST compliance will be automatic.

**Validation status:** Phase 6 (planned). Razorpay integration targeted from day one — real payment gateway, not simulated.

### H5: WhatsApp-Native Communication

**If we** integrate WhatsApp Business API for automated vaccination reminders, post-visit summaries, payment links, and appointment confirmations — all triggered automatically from clinical and billing workflows
**For** solo vets who currently send manual WhatsApp messages to individual pet owners
**Then** vaccination follow-up rates will increase by 30%+, payment collection will accelerate, and the clinic's professional image will improve through consistent, branded communication.

**Validation status:** Phase 7 (planned). WhatsApp Business API not yet approved — all development against a simulator until API access is granted. This is the highest external dependency risk.

---

## 6. Prioritization

### Framework: RICE + India-Specific Weighting

Breeyo prioritizes features using RICE scoring (Reach, Impact, Confidence, Effort) with additional weighting for three India-specific factors:

1. **Walk-in compatibility** — Does this feature work in a walk-in-first environment? Features requiring scheduled appointments score lower.
2. **Offline resilience** — Can this feature function on intermittent 4G? Features requiring constant connectivity score lower for early phases.
3. **WhatsApp leverage** — Does this feature use WhatsApp as the communication channel? Features using email or SMS instead score lower for the Indian market.

### Prioritized Feature Domains

| Priority | Feature Domain | RICE Score | Rationale |
|---|---|---|---|
| **P0 (Must-have for Beta)** | Walk-in Queue & Check-in | Very High | Touched 20+ times/day. This IS the product. Without it, there is no daily usage habit. |
| **P0 (Must-have for Beta)** | Patient Registration & Search | Very High | Prerequisite for queue. Mobile-number-as-key is the India-specific insight. |
| **P0 (Must-have for Beta)** | EMR & Clinical Records | High | The core value proposition after queue. Without records, the app is a queue manager, not a practice management tool. |
| **P1 (Required for Beta)** | Inventory Management | High | Direct revenue impact (stock-outs = lost sales). High urgency for solo vets. |
| **P1 (Required for Beta)** | Invoicing & Payments | High | Revenue collection. GST compliance is regulatory, not optional. Razorpay from day one. |
| **P2 (Beta enhancement)** | WhatsApp Communication | Medium-High | Highest pet owner engagement channel. Blocked on API approval — simulator for beta. |
| **P2 (Beta enhancement)** | Scheduling & Calendar | Medium | Only 20% of visits are appointments. Build after walk-in queue is proven. Must never conflict with walk-in flow. |
| **P3 (Post-Beta)** | Web Dashboard & Owner Portal | Medium | Admin and reporting workflows. Not needed for daily clinical operations. |
| **P3 (Post-Beta)** | Offline Hardening | Medium | Core offline capabilities built incrementally. Full hardening as a dedicated phase after feature completeness. |

### What We Explicitly Deprioritize

- **Telemedicine / video consults** — Indian pet owners strongly prefer in-person vet visits. Not a v1 priority.
- **Multi-clinic chain management** — Target is solo vets and small teams. Enterprise features deferred.
- **Lab integration / diagnostic imaging** — Solo clinics rarely have in-house labs. Future consideration.
- **AI-assisted diagnosis** — Regulatory complexity and liability concerns. Not in scope for beta.

---

## 7. Roadmap / Sequencing

### Phase-Based Sequencing

The roadmap is structured as 10 sequential phases. Each phase builds on the foundations established by prior phases. The first 3 phases are complete; Phase 4 is actively in development.

```
DONE ──────────────────────────────────────────────────────────────────

Phase 01: Foundation & Authentication                        [COMPLETE]
  Monorepo setup, PostgreSQL + RLS multi-tenancy, JWT auth with
  refresh rotation, SMS OTP, RBAC with permission overrides,
  audit logging, CI/CD pipelines

Phase 02: UI/UX Design & Design System                      [COMPLETE]
  Design tokens (colors, typography, spacing), 26-component
  library (atoms/molecules/organisms), wireframes for all
  modules, i18n (English + Hindi), accessibility foundations

Phase 03: Patient Registration & Walk-in Queue               [COMPLETE]
  Pet owner/pet registration, 2-tap check-in, real-time queue
  board (Socket.IO), queue state machine, patient search
  (pg_trgm), pet profiles, wait time estimation, 64 tests

NOW ───────────────────────────────────────────────────────────────────

Phase 04: EMR & Clinical Records                          [IN PROGRESS]
  SOAP notes, vitals entry (species-specific), prescription
  generation, voice-to-text for subjective notes, consultation
  linking to queue entries, clinical history timeline

NEXT ──────────────────────────────────────────────────────────────────

Phase 05: Inventory Management
  Stock intake with barcode scanning, batch/expiry tracking,
  low-stock alerts (configurable thresholds), medicine catalog,
  auto-decrement on dispensing, offline-capable scanning

Phase 06: Invoicing & Payments
  GST-compliant invoice generation (18% services, 5-18% medicines),
  Razorpay payment gateway integration, UPI payment links,
  payment recording and reconciliation, invoice PDF generation

LATER ─────────────────────────────────────────────────────────────────

Phase 07: WhatsApp Communication
  WhatsApp Business API integration (simulator initially),
  automated vaccination reminders, post-visit summaries,
  payment link delivery, booking confirmations, message templates

Phase 08: Scheduling & Calendar
  Appointment booking (future dates), calendar views (day/week),
  appointment-to-queue-entry conversion, recurring appointments,
  schedule conflict detection with walk-in queue

Phase 09: Web Dashboard & Owner Portal
  Next.js admin dashboard (analytics, reports, user management),
  pet owner portal (view records, upcoming appointments, payment
  history), clinic performance metrics

Phase 10: Offline Hardening & Integration Polish
  Full offline sync (conflict resolution), background sync queue,
  performance optimization for mid-range Android, integration
  testing across all modules, beta launch readiness
```

### Sequencing Rationale

1. **Phases 1-3 first** because they establish the daily usage loop. A vet cannot use the app without auth (P1), a UI (P2), and the queue (P3). The queue is the "hook" — the feature that makes them open the app every morning.
2. **Phase 4 (EMR) before Phase 5 (Inventory)** because clinical records are created during every consultation, while inventory is managed periodically. EMR extends the queue's value from "queue manager" to "practice management."
3. **Phase 5 (Inventory) before Phase 6 (Billing)** because dispensed medicines must be trackable before they can be invoiced. Inventory data feeds into invoice line items.
4. **Phase 6 (Billing) before Phase 7 (WhatsApp)** because payment links sent via WhatsApp require the billing system to generate them. WhatsApp is the delivery channel for invoices, not the source.
5. **Phase 7 (WhatsApp) is mid-priority** despite being a key differentiator because it has an external dependency (API approval) and a simulator fallback exists for beta. It is not blocking for pilot clinic onboarding.
6. **Phase 8 (Scheduling) is late** because only 20% of visits are appointments. The walk-in queue must be rock-solid before introducing appointments that could complicate it.
7. **Phases 9-10 last** because the web dashboard is for admin/reporting (not daily clinical use) and offline hardening is an optimization pass over features that must exist first.

---

## 8. Success Metrics

### Primary Metrics (Product-Market Fit Indicators)

| Metric | Target | Measurement Method |
|---|---|---|
| **Daily Active Clinics (DAC)** | 12 of 20 pilot clinics (60%) active daily after 30 days | Server-side: at least 1 API call from clinic per day |
| **Patients Managed per Clinic per Day** | 15+ patients/day through the queue (matching current paper-based volume) | Count of QueueEntries created per clinic per day |
| **Returning Patient Check-in Time** | Under 10 seconds (2-tap: mobile lookup + pet tap) | Client-side timing: FAB open to check-in confirmation |
| **Clinical Record Completion Rate** | 80%+ of consultations have a clinical record (Phase 4+) | Ratio of DONE queue entries with an associated consultation record |

### Secondary Metrics (Engagement & Value Delivery)

| Metric | Target | Measurement Method |
|---|---|---|
| **Queue Board Screen Time** | 4+ hours/day (app open in background/foreground during clinic hours) | Client-side session tracking |
| **Patient Search Usage** | 5+ searches/day per clinic | API call count to `/patients/search` |
| **New vs. Returning Patient Ratio** | 70%+ returning (mobile lookup finds existing owner) | Ratio of owner lookup hits vs. new registrations |
| **Invoice Generation Rate** | 90%+ of completed consults generate an invoice (Phase 6+) | Ratio of DONE entries with associated invoices |
| **WhatsApp Message Delivery Rate** | 95%+ successful delivery (Phase 7+) | WhatsApp API delivery receipts |
| **Weekly Retention (W4)** | 70%+ of clinics active in week 4 that were active in week 1 | Cohort retention analysis |

### Guardrail Metrics (Do Not Regress)

| Metric | Threshold | Why It Matters |
|---|---|---|
| **API Response Time (p95)** | Under 500ms | Mid-range Android on 4G. Slow responses feel broken. |
| **Real-time Sync Latency** | Under 2 seconds (Socket.IO event to UI update) | Multi-device queue must feel instant. Stale queue = wrong patient called. |
| **App Crash Rate** | Under 1% of sessions | Android fragmentation risk. Crashes destroy trust with non-technical users. |
| **Offline Data Loss** | Zero patient records lost during connectivity gaps | Data loss is unforgivable in medical records. Queue entries, clinical notes, and patient data must survive offline periods. |
| **Monthly Churn (post-Beta)** | Under 5% | At Rs 999-3,000/month price point, churn above 5% makes unit economics unviable. |

### North Star Metric

**Patients managed per clinic per day** — this single metric captures product adoption (clinic is using it), feature depth (registration, queue, EMR, billing all contribute), and value delivery (each managed patient represents administrative time saved). If this number matches or exceeds paper-based throughput (15-25/day), Breeyo is delivering on its core promise.

---

## 9. Next Steps

### Immediate Actions (Next 2-4 Weeks)

| Action | Owner | Status |
|---|---|---|
| **Complete Phase 4: EMR & Clinical Records** | Engineering | In progress. SOAP notes, vitals, prescriptions. Builds on Phase 3 QueueEntry linking. |
| **Begin pilot clinic recruitment** | Product / Business | Identify 20 solo vet clinics in Pune, Bangalore, and Hyderabad. Criteria: solo/2-person practice, 15+ patients/day, Android phone, WhatsApp-active. |
| **Develop detailed personas** | Product | Write full persona documents for Solo Vet, Front Desk Staff, and Pet Owner at `../personas/`. Validate with 5+ user interviews per persona. |
| **Apply for WhatsApp Business API access** | Engineering / Business | Submit application to Meta. Lead time is 2-6 weeks. Simulator development continues in parallel. |
| **Design inventory barcode scanning UX** | Design | Phase 5 UX design to begin before Phase 5 engineering starts. Camera permissions, offline lookup, and batch entry flows. |

### Experiments to Run (Beta Phase)

| Experiment | Hypothesis | Success Criteria |
|---|---|---|
| **2-tap check-in vs. name-based lookup** | Mobile-number-based lookup is faster than name search for returning patients | 90%+ of returning patient check-ins use mobile lookup (not manual search) |
| **Voice-to-text adoption for SOAP notes** | Vets will prefer speaking to typing on mobile | 30%+ of clinical notes use voice input for the subjective section |
| **WhatsApp payment links vs. cash** | Sending UPI payment links via WhatsApp increases collection rate | 20%+ of invoices paid via digital payment link (up from near-zero) |
| **Hindi UI adoption** | Clinics in Tier 2 cities with Hindi-speaking staff will prefer Hindi | Track language toggle usage and retention correlation |

### Discovery Needed (Pre-Beta)

| Area | Questions to Answer |
|---|---|
| **Pricing sensitivity** | Will solo vets pay Rs 999/month? Rs 1,999? Is per-clinic or per-user pricing better? Free trial length? |
| **Onboarding friction** | How much existing data (patient history, inventory catalog) do pilot clinics want migrated? Is manual entry acceptable for the first month? |
| **Multi-vet queue dynamics** | In a 2-3 vet clinic, how does "Call Next" work? Does each vet have their own queue, or is it shared? What happens when one vet is faster than another? |
| **Offline tolerance thresholds** | How long are typical connectivity gaps? 30 seconds? 5 minutes? 30 minutes? What is the maximum acceptable offline duration before the vet gives up and goes back to paper? |
| **Regulatory requirements** | What are the specific record retention requirements under Indian veterinary practice regulations? Are digital records legally accepted for veterinary regulatory inspections? |

### Key Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **WhatsApp API access denied or delayed** | Medium | High | WhatsApp simulator for beta. All WhatsApp features designed to be swappable with SMS/push notification fallback. |
| **GST calculation edge cases** | Medium | Medium | Consult with a CA before Phase 6 launch. Build configurable tax rules, not hardcoded rates. |
| **Offline sync conflicts** | Medium | High | Phase 10 dedicated to conflict resolution. Queue operations designed to be append-only (idempotent check-ins, monotonic positions) to minimize conflicts. |
| **Price resistance from solo vets** | Medium | High | Freemium tier under consideration: free for 1 user + 10 patients/day, paid for unlimited. Revenue from payment processing fees as alternative. |
| **Android fragmentation on mid-range devices** | Low | Medium | Expo + React Native abstract most device differences. Test on Android 8+ with 2GB RAM minimum. Performance profiling on Redmi Note series (most common mid-range device in India). |

---

*This is a living document. It will be updated as market feedback from pilot clinics informs strategy adjustments. Next review scheduled after 20 pilot clinics complete their first 30 days.*
