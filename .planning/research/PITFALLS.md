# Pitfalls Research

**Domain:** Veterinary Practice Management SaaS (India-focused)
**Researched:** 2026-04-10
**Confidence:** MEDIUM (domain knowledge; web research unavailable)

## Critical Pitfalls

### Pitfall 1: Appointment-First Design That Blocks Walk-ins

**What goes wrong:**
System treats scheduled appointments as the default mode. Walk-in patients can't be checked in without creating an appointment first. Queue management is an afterthought, bolted on top of a calendar-centric system.

**Why it happens:**
Western practice management software (where most patterns come from) is appointment-first. Developers default to what's documented in open-source PMS templates.

**How to avoid:**
- Build walk-in queue as the PRIMARY data structure from day one
- Appointments are just pre-scheduled queue entries that merge into the walk-in queue
- Queue position, not appointment time, determines order of service
- Never block checkin on having a scheduled appointment

**Warning signs:**
- Database schema has `appointments` table but no `queue_entries` table
- UI shows calendar as the main landing screen instead of a queue
- Walk-in flow requires 3+ clicks to check in a patient

**Phase to address:**
Phase 1 — Queue/appointment architecture must be walk-in-first from the start

---

### Pitfall 2: Blocking on WhatsApp Business API

**What goes wrong:**
Development stalls waiting for Meta Business verification. Features that depend on WhatsApp (reminders, invoice delivery, booking) are delayed indefinitely. The entire WhatsApp flow is untestable during development.

**Why it happens:**
Meta Business verification can take 2-8 weeks (or longer). Teams underestimate the dependency and don't build an abstraction layer.

**How to avoid:**
- Build a WhatsApp simulator/mock from day one
- Design a clean interface: `WhatsAppProvider` with `sendMessage()`, `receiveMessage()`, `sendTemplate()`
- Simulator implements the interface with local logging/UI
- Real API implements the same interface
- Swap providers via configuration, not code changes

**Warning signs:**
- WhatsApp code directly references Meta API endpoints
- No way to test WhatsApp flows without real API credentials
- Development team waiting for "API access" to start WhatsApp features

**Phase to address:**
Phase 1 or 2 — WhatsApp abstraction layer should be established early

---

### Pitfall 3: Overly Rigid EMR Data Model

**What goes wrong:**
Clinical data schema is too rigid — only standard SOAP fields, no flexibility for different vet specialties or custom workflows. OR too flexible — everything is unstructured JSONB with no queryability.

**Why it happens:**
Medical data is complex and varies by specialty. Developers either over-normalize (rigid schema) or under-normalize (dump everything in JSON).

**How to avoid:**
- Core clinical fields (vitals, diagnosis, treatment) are strongly typed columns
- Supplementary data uses JSONB for flexibility (custom form fields, specialty-specific data)
- Always maintain queryable relationships: patient → consultation → soap_note → prescription → items
- Design the schema to support common queries: "all consultations for patient X," "all prescriptions containing drug Y"

**Warning signs:**
- Single `records` table with `type` and `data` JSONB columns for everything
- OR inability to add a new field type without a database migration
- Reporting queries require parsing JSONB content

**Phase to address:**
Phase 2-3 — When building EMR module; schema design is critical and hard to change later

---

### Pitfall 4: Ignoring Offline Reality for Indian Mobile Users

**What goes wrong:**
App assumes constant connectivity. Barcode scanning fails without network. Patient checkin hangs when 4G drops. Vets in Tier 2 cities can't use the app reliably.

**Why it happens:**
Developers build and test on good Wi-Fi. Mobile connectivity in Indian cities is inconsistent, especially inside clinic buildings.

**How to avoid:**
- Critical flows (checkin, barcode scan, note-taking) must work offline
- Use local SQLite (WatermelonDB or expo-sqlite) for offline data
- Implement sync queue: record operations locally, replay when online
- Show clear online/offline status indicator
- Test with Network Link Conditioner or Android throttling tools

**Warning signs:**
- No local storage strategy in the architecture
- All API calls are blocking (no optimistic updates)
- App shows spinner/error when network is briefly unavailable
- No offline-capable scanning implementation

**Phase to address:**
Phase 1 — Offline architecture must be designed from the start; retrofitting is extremely expensive

---

### Pitfall 5: GST Calculation Complexity Underestimated

**What goes wrong:**
Invoicing looks simple but GST rules are complex. Wrong tax rates applied. CGST/SGST vs IGST not handled. HSN codes missing. Invoices fail compliance checks. Tax filing becomes a nightmare.

**Why it happens:**
GST has multiple rate slabs (5%, 12%, 18%, 28%), inter-state vs intra-state rules, exemptions for certain veterinary services, and mandatory HSN/SAC codes.

**How to avoid:**
- Research correct HSN codes for vet services and drugs
- Implement CGST+SGST for intra-state, IGST for inter-state transactions
- Make tax rate configurable per line item category
- Store all GST components separately in invoice records
- Consider using a GST calculation library or service
- Validate against sample invoices from real vet clinics

**Warning signs:**
- Single "tax" field instead of CGST/SGST/IGST breakdown
- No HSN/SAC codes in invoice line items
- Tax rate is hardcoded instead of configurable

**Phase to address:**
Invoicing phase — Must get GST right from the start; fixing tax calculations retroactively affects all historical invoices

---

### Pitfall 6: Batch/Expiry Tracking as an Afterthought

**What goes wrong:**
Inventory is built as simple quantity tracking. Batch/lot numbers and expiry dates are added later, requiring database migration and UI rework. FIFO dispensing logic doesn't work because the system doesn't know which batch was received first.

**Why it happens:**
Basic inventory (add/remove items) is straightforward. Batch tracking adds significant data model complexity. Teams ship "simple inventory first" and discover the upgrade is a major refactor.

**How to avoid:**
- Design inventory schema with batch/lot tracking from day one
- Every stock movement references a batch
- Expiry dates are mandatory for applicable items
- FIFO logic is built into the dispensing service, not added later
- Even if UI initially shows simplified view, the data model must be complete

**Warning signs:**
- `inventory_items` table has just `name`, `quantity`, `price`
- No `batches` or `stock_movements` table
- Stock is decremented without recording which batch was used

**Phase to address:**
Inventory phase — Data model must include batches from the start

---

### Pitfall 7: Multi-Tenancy Security Gaps

**What goes wrong:**
One clinic can see another clinic's patient records. API endpoints don't consistently enforce tenant isolation. A developer forgets `WHERE clinic_id = ?` on one query and leaks data across clinics.

**Why it happens:**
Multi-tenancy requires discipline on every database query. Application-level filtering is error-prone. One missed filter = data breach.

**How to avoid:**
- Use PostgreSQL Row-Level Security (RLS) as the primary enforcement
- Set `clinic_id` context in middleware at the start of every request
- RLS policies automatically filter queries — developer can't forget
- Add integration tests that verify cross-tenant isolation
- Audit all raw SQL queries for missing tenant filters

**Warning signs:**
- Tenant filtering only at application level (no RLS)
- No integration tests for cross-tenant data isolation
- API endpoints that accept `clinic_id` as a parameter instead of deriving from auth token

**Phase to address:**
Phase 1 — Multi-tenancy must be correct from the database layer up

---

### Pitfall 8: Voice-to-Text Scope Creep

**What goes wrong:**
Basic transcription works in demo but team tries to add structured SOAP mapping, medical terminology recognition, or real-time transcription improvements. Scope balloons. Beta launches without functional voice input because "it's not good enough yet."

**Why it happens:**
Voice-to-text is an exciting feature. Easy to scope-creep from "basic transcription" to "AI-powered medical dictation." The gap between demo quality and production quality is massive.

**How to avoid:**
- Beta scope: raw transcription into a text field. Period.
- Vet reviews and manually places text into SOAP fields
- Use browser/mobile native Speech-to-Text API (free, good enough)
- No custom ML models, no medical dictionary, no structured parsing
- Mark structured voice-to-SOAP as explicit v1.5 feature

**Warning signs:**
- Sprint tasks mention "NLP" or "medical terminology" for Beta
- Voice feature has more than 3 user stories
- Team is researching speech-to-text APIs beyond the platform native one

**Phase to address:**
EMR phase — Keep voice feature strictly scoped

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip offline sync, require network | Faster development | Unusable for Tier 2 vets; retrofit is expensive | Never for core flows (scan, checkin) |
| Single-tenant deployment per clinic | Simpler isolation | Ops nightmare at 50+ clinics; can't share infrastructure | Never — design multi-tenant from start |
| No audit trail on EMR changes | Simpler data model | Legal compliance issue; can't track who changed what | Never — medical records require audit trail |
| Hardcoded GST rates | Faster invoicing MVP | Government changes rates; must redeploy to update | Acceptable for first demo only; make configurable within Beta |
| No rate limiting on API | Simpler server setup | Vulnerable to abuse; WhatsApp webhook floods | Acceptable for local dev; must add before pilot deployment |
| Skip mobile E2E tests | Faster iteration | Regressions in critical flows (scan, checkin) go unnoticed | Acceptable for first 2-3 phases; add E2E before Beta pilot |

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Razorpay | Using test mode credentials in production | Use environment-based config; separate test and live keys; verify webhook signatures |
| Razorpay Webhooks | Not verifying webhook signature | Always verify `razorpay_signature` header; reject unverified webhooks |
| WhatsApp Business API | Sending non-template messages outside 24h window | Only template messages outside customer-initiated window; track conversation windows |
| WhatsApp Templates | Not pre-approving message templates | Templates must be approved by Meta before use; design and submit templates early |
| AWS S3 India | Using default (us-east-1) region | Explicitly set `ap-south-1` (Mumbai); data residency requirement |
| Speech-to-Text | Relying on continuous internet for mobile STT | Use on-device speech recognition where possible (Android/iOS native); fall back to cloud |
| Expo Push Notifications | Not handling notification permissions properly | Request permissions early; handle denied state gracefully; don't break flow if denied |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| N+1 queries on patient list | Patient list loads slowly | Use eager loading / joins; Prisma `include` for related data | 500+ patients per clinic |
| Unindexed search queries | Search by owner mobile takes seconds | Index on `owners.mobile_number`, `pets.name`; consider full-text search | 1,000+ patients per clinic |
| Loading full queue history | Queue page slow to render | Paginate; only load today's queue by default; archive old entries | After 6 months of operation |
| Large file uploads blocking API | Slow response during image upload | Use direct-to-S3 presigned URL upload; don't proxy through API server | 10+ concurrent uploads |
| Socket.IO without Redis adapter | Real-time breaks with multiple API instances | Use Redis adapter from the start; design for horizontal scaling | 2+ API instances |
| No database connection pooling | Connection errors under load | Use PgBouncer or Prisma connection pooling | 50+ concurrent users |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| No encryption for medical records at rest | Compliance violation; data breach exposes sensitive health data | Enable PostgreSQL encryption at rest; use AWS KMS for key management |
| Tenant ID from request body instead of auth token | Attacker can access other clinics' data by changing tenant ID | Always derive clinic_id from authenticated user's JWT; never accept from client |
| Medical record deletion without soft-delete | Legal requirement to retain medical records; hard delete loses evidence | Implement soft-delete with `deleted_at` timestamp; archive, never delete |
| Payment amount from client-side | Attacker can modify payment amount to pay less | Always calculate amount server-side from invoice; verify on Razorpay webhook |
| No rate limiting on OTP endpoint | Brute-force OTP attacks | Rate limit to 5 attempts per phone number per 10 minutes; exponential backoff |
| Storing WhatsApp conversation data without consent | GDPR/India data protection compliance | Explicit consent during registration; data retention policy; purge on request |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Calendar-first landing screen | Vet opens app, sees empty calendar; has to navigate to walk-in queue | Walk-in queue IS the home screen; calendar accessible but not default |
| Complex registration forms | 15 fields to register a pet; vet abandons for paper | Minimal required fields (owner mobile, pet name, species); everything else optional |
| No patient search from queue | Returning patient must be re-registered | Quick search by mobile number; auto-fill from existing records |
| Prescription input requires exact drug names | Typos, inconsistent drug names across consultations | Autocomplete from drug database; recently used drugs; favorites |
| Inventory alerts as popup modals | Vet interrupted mid-consultation by stock alert | Non-intrusive notification badge; alert summary on inventory screen |
| Forcing sequential workflow | Must complete SOAP notes before writing prescription | Allow flexible order; vets have their own workflow preferences |
| English-only error messages | Hindi-speaking staff confused by errors | Localize error messages; use icons where possible |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Walk-in queue:** Often missing real-time updates for other devices — verify Socket.IO broadcasts work across multiple connected clients
- [ ] **Invoice generation:** Often missing GST breakdown (CGST/SGST/IGST) — verify all three tax types render correctly
- [ ] **Barcode scanning:** Often works on iPhone but fails on budget Android phones — verify on mid-range Android 8+ device
- [ ] **Voice-to-text:** Often works in quiet dev environment but fails in noisy clinic — verify with background noise
- [ ] **Patient search:** Often exact match only — verify partial match, mobile number variants (+91 prefix), fuzzy name match
- [ ] **Offline sync:** Often works for simple creates but fails on conflicts — verify sync after concurrent edits from two devices
- [ ] **Payment webhook:** Often works in test mode but production webhook URL not configured — verify end-to-end with live Razorpay test
- [ ] **Multi-user access:** Often admin role works but other roles (Front Desk, Inventory) don't have correct permissions — verify all 4 roles
- [ ] **Prescription print/PDF:** Often renders in browser but PDF generation fails or looks wrong on mobile — verify PDF output on Android
- [ ] **Expiry alerts:** Often works for single-item checks but doesn't handle bulk batch expiry approaching — verify with 50+ items near expiry

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Appointment-first design | HIGH | Redesign queue data model; migrate existing appointments to queue entries; rework UI navigation |
| WhatsApp hard-coded to Meta API | MEDIUM | Extract interface; build simulator; refactor existing code to use interface |
| Rigid EMR schema | HIGH | Database migration for new structure; data migration script; update all queries and UI |
| No offline support | HIGH | Add local storage layer; implement sync engine; test conflict resolution; redesign API calls to be optimistic |
| Wrong GST calculation | MEDIUM | Fix calculation logic; regenerate affected invoices; notify affected clinics |
| No batch tracking in inventory | HIGH | Redesign inventory schema; migrate existing stock data; add batch fields to all inventory UI |
| Multi-tenant data leak | CRITICAL | Immediate: add RLS policies; audit all queries; notify affected clinics; potentially legal/compliance reporting |
| Voice feature scope creep | LOW | Cut scope back to basic transcription; move advanced features to backlog |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Appointment-first design | Foundation/Queue phase | Walk-in checkin is < 2 taps; queue is home screen |
| Blocking on WhatsApp | Foundation phase | WhatsApp simulator works; abstraction layer tested |
| Rigid EMR data model | EMR phase | Schema supports core fields + JSONB extension; sample queries work |
| No offline support | Foundation phase | Barcode scan works with airplane mode on |
| GST complexity | Invoicing phase | Invoice matches sample from real vet clinic; all 3 GST types tested |
| Batch tracking afterthought | Inventory phase | Every stock movement has batch reference; FIFO dispensing works |
| Multi-tenant security | Foundation phase | Integration test: Clinic A cannot see Clinic B data |
| Voice scope creep | EMR phase | Voice feature has exactly 1 user story: "transcribe to text field" |

## Sources

- Domain knowledge: veterinary practice management patterns
- India SaaS deployment and compliance experience
- GST invoicing requirements for services
- Multi-tenancy security best practices
- Mobile offline-first architecture patterns
- Confidence: MEDIUM — pitfalls are well-known in PMS domain; India-specific gotchas based on market knowledge

---
*Pitfalls research for: Veterinary Practice Management SaaS (India)*
*Researched: 2026-04-10*
