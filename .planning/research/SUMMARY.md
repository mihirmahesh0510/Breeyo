# Project Research Summary

**Project:** Breeyo
**Domain:** Veterinary Practice Management SaaS (India-focused)
**Researched:** 2026-04-10
**Confidence:** MEDIUM

## Executive Summary

Breeyo is a mobile-first veterinary practice management platform targeting solo vets in Indian metro and Tier 1/2 cities. The recommended approach is a TypeScript monorepo (Turborepo) with React Native/Expo for mobile, Next.js for the web dashboard, and a Fastify API backed by PostgreSQL and Redis. This stack enables code sharing across platforms while maintaining mobile-first performance on mid-range Android devices.

The architecture follows a modular monolith pattern with bounded contexts for each domain (queue, EMR, inventory, billing). Multi-tenancy uses PostgreSQL row-level security for tenant isolation. The walk-in queue — not a calendar — must be the primary workflow, with scheduled appointments merging into the queue as a secondary feature. WhatsApp integration should be built against a simulator/mock with a clean abstraction layer, enabling swap to the real API when Meta Business verification completes.

The biggest risks are: designing an appointment-first system that fights walk-in culture, blocking development on WhatsApp API access, underestimating GST calculation complexity, and neglecting offline support for Indian mobile networks. All are preventable with upfront architecture decisions in the foundation phase.

## Key Findings

### Recommended Stack

TypeScript monorepo with three apps sharing types and validators. React Native (Expo) for mobile gives a single codebase for iOS/Android with camera access for barcode scanning and OTA updates via EAS. Next.js for the web dashboard provides SSR for fast load on Indian networks. Fastify on Node.js for the API enables full-stack TypeScript with excellent async I/O performance.

**Core technologies:**
- React Native (Expo SDK 52+): Mobile app — single codebase, Expo managed workflow for OTA updates and camera access
- Next.js 15+: Web dashboard — SSR, App Router, shared React patterns with mobile
- Fastify + Node.js 22 LTS: API server — TypeScript-native, fast, schema validation built-in
- PostgreSQL 16: Primary database — ACID for medical records, JSONB for flexible clinical data, RLS for multi-tenancy
- Redis 7+: Real-time queue updates, session cache, pub/sub for multi-device sync
- Prisma 6+: Type-safe ORM with migration management

### Expected Features

**Must have (table stakes):**
- Patient registration (pet + owner by mobile number)
- Walk-in queue with real-time updates
- SOAP notes and medical records
- Prescription writing
- Basic inventory tracking
- Invoicing with GST
- User auth with roles
- Patient search

**Should have (competitive):**
- WhatsApp-native communication (simulated initially)
- Voice-to-text for clinical notes
- Mobile barcode scanning for inventory
- Batch/lot tracking with expiry management
- Real payment gateway (UPI via Razorpay)
- Par-level alerts and want-list generation
- Multi-device calendar sync

**Defer (v2+):**
- AI diagnosis suggestions
- Telemedicine module
- Vendor auto-ordering
- Image-to-text for handwritten notes
- Advanced analytics

### Architecture Approach

Modular monolith with clear bounded contexts per domain (auth, queue, patient, EMR, inventory, billing, scheduling, WhatsApp). Single deployable API server with event-driven cross-module communication. Offline-first mobile architecture using local SQLite with sync queue for critical flows. Multi-tenancy via PostgreSQL RLS with `clinic_id` on every table.

**Major components:**
1. Mobile App (Expo/RN) — Clinical workflows, barcode scanning, voice input, offline-capable
2. Web Dashboard (Next.js) — Admin, analytics, inventory management, scheduling
3. API Server (Fastify) — Business logic, auth, real-time events, module orchestration
4. Queue Service — Walk-in queue management, real-time position updates via Socket.IO
5. EMR Service — SOAP notes, vitals, prescriptions, medical history, audit trail
6. Inventory Service — Stock tracking, batch/lot management, barcode lookup, expiry monitoring
7. Billing Service — Invoice generation, GST calculation, Razorpay payment integration

### Critical Pitfalls

1. **Appointment-first design** — Build walk-in queue as the primary data structure; appointments merge into queue as pre-scheduled entries
2. **Blocking on WhatsApp API** — Build simulator with clean abstraction layer; swap provider via config when Meta approves
3. **Ignoring offline reality** — Design offline-first architecture from foundation phase; local SQLite + sync queue for critical flows
4. **GST calculation underestimated** — Research HSN codes, implement CGST/SGST/IGST breakdown, make rates configurable
5. **Batch tracking as afterthought** — Include batch/lot in inventory data model from day one; don't start with simple quantity-only tracking

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Project Foundation & Infrastructure
**Rationale:** Everything else depends on project setup, database schema, auth, and multi-tenancy
**Delivers:** Monorepo setup, database with RLS, auth system, API skeleton, dev environment
**Addresses:** AUTH features, multi-tenancy foundation
**Avoids:** Multi-tenant security gaps, wrong architecture decisions

### Phase 2: Patient Registration & Walk-in Queue
**Rationale:** Walk-in queue is the primary daily workflow; must be built first to validate core UX
**Delivers:** Patient/pet registration, walk-in queue with real-time updates, basic search
**Addresses:** Queue management, patient registration features
**Avoids:** Appointment-first design pitfall

### Phase 3: EMR - Clinical Records & Prescriptions
**Rationale:** Depends on patient registration; core clinical workflow after queue
**Delivers:** SOAP notes, vitals, prescriptions, medical history, basic voice-to-text
**Addresses:** EMR features, voice input, prescription writing
**Avoids:** Rigid EMR schema, voice scope creep

### Phase 4: Inventory Management
**Rationale:** Depends on drug database (shared with prescriptions); batch tracking must be in from start
**Delivers:** Stock tracking, barcode scanning, batch/lot management, expiry alerts, par-level alerts
**Addresses:** Inventory features, barcode scanning, batch tracking
**Avoids:** Batch tracking afterthought, no offline support for scanning

### Phase 5: Invoicing & Payments
**Rationale:** Depends on EMR (consultation items) and inventory (drug items) for invoice line items
**Delivers:** Invoice builder, GST calculation, Razorpay integration, payment recording
**Addresses:** Billing features, payment gateway, GST compliance
**Avoids:** GST complexity underestimation

### Phase 6: WhatsApp Integration
**Rationale:** Communication layer sits on top of all modules; needs simulator first
**Delivers:** WhatsApp simulator, message templates, appointment reminders, invoice delivery
**Addresses:** WhatsApp features, automated reminders
**Avoids:** Blocking on WhatsApp API

### Phase 7: Appointment Scheduling & Calendar
**Rationale:** Appointments overlay on walk-in queue; needs queue and real-time infrastructure first
**Delivers:** Scheduled appointments, calendar view, multi-device sync, push notifications
**Addresses:** Scheduling features, multi-device sync
**Avoids:** Appointment-first design

### Phase 8: Web Dashboard & Admin
**Rationale:** Admin features need all domain modules to exist first; reporting needs data
**Delivers:** Web dashboard, analytics, user management, role-based admin
**Addresses:** Web dashboard, role management, reporting features

### Phase 9: Offline Support & Polish
**Rationale:** Offline support should be designed from start but polished at end; integration testing across modules
**Delivers:** Full offline sync, conflict resolution, E2E testing, performance optimization
**Addresses:** Offline requirements, mobile optimization

### Phase Ordering Rationale

- Foundation → Queue → EMR → Inventory → Billing follows the natural dependency chain (can't bill without knowing what was done)
- Walk-in queue before appointments ensures walk-in-first architecture
- Inventory before billing because invoice line items reference stock items
- WhatsApp is a communication layer that can be added on top of existing modules
- Web dashboard last because mobile is the primary interface for solo vets; admin is secondary

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1:** Multi-tenancy with RLS — needs PostgreSQL-specific research for optimal policies
- **Phase 4:** Barcode scanning offline — needs Expo camera + offline storage research
- **Phase 5:** GST rules — needs India-specific tax research for veterinary services HSN codes
- **Phase 6:** WhatsApp simulator design — needs Meta Business API documentation for accurate simulation

Phases with standard patterns (skip research-phase):
- **Phase 2:** Patient registration — standard CRUD with search
- **Phase 3:** EMR/SOAP notes — well-documented clinical data model patterns
- **Phase 7:** Calendar/scheduling — established patterns for appointment + queue coexistence

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | React Native + Next.js + Fastify is well-established for cross-platform; latest versions not verified via web |
| Features | HIGH | Feature landscape well-understood from PRD and vet practice domain knowledge |
| Architecture | MEDIUM | Modular monolith is right for this scale; India-specific deployment patterns need validation |
| Pitfalls | HIGH | Walk-in vs appointment, WhatsApp blocking, and GST complexity are well-known domain pitfalls |

**Overall confidence:** MEDIUM

### Gaps to Address

- Latest package versions not verified via official sources — validate during Phase 1 setup
- Razorpay API for veterinary-specific HSN codes — research during billing phase
- WhatsApp Business API template approval process — research during WhatsApp phase
- Expo camera performance on budget Android devices — test during inventory phase
- Data residency compliance for AWS Mumbai — verify during infrastructure setup

## Sources

### Primary (HIGH confidence)
- Comprehensive PRD provided by user with market analysis, personas, and technical requirements
- Domain knowledge: veterinary practice management patterns

### Secondary (MEDIUM confidence)
- India SaaS deployment patterns (AWS Mumbai region)
- React Native/Expo ecosystem experience
- Multi-tenancy architecture patterns (PostgreSQL RLS)

### Tertiary (LOW confidence)
- Specific package version numbers — not verified via live web search
- Competitor feature analysis — based on PRD description, not direct product testing

---
*Research completed: 2026-04-10*
*Ready for roadmap: yes*
