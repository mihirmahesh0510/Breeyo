# Phase 6: Invoicing & Payments - Research

**Researched:** 2026-08-12
**Domain:** Indian GST invoicing, Razorpay payment integration, Fastify/Prisma billing services, Expo billing UI
**Confidence:** MEDIUM-HIGH (payment integration HIGH, GST compliance HIGH, existing-codebase findings HIGH, Expo version pinning MEDIUM)

---

## ⚠️ BLOCKING CONTRADICTIONS — READ FIRST

Five contradictions between planning documents and the actual codebase must be resolved **before** plans are generated. Contradiction #1 was flagged by the orchestrator; #2–#5 were discovered during this research and are equally plan-breaking.

### Contradiction 1: GST scope — flat rate vs. full CGST/SGST/IGST + HSN/SAC

| Source | Says | Evidence |
|--------|------|----------|
| `06-CONTEXT.md` D-08 | "Single configurable GST rate… Full GST with CGST/SGST/IGST and HSN/SAC codes deferred to v2 (BIL-07)" | line 24 |
| `06-CONTEXT.md` D-17 | "Basic GST line… No CGST/SGST split, no HSN/SAC codes… deferred to v2 (BIL-07)" | line 37 |
| `06-CONTEXT.md` Deferred | "Full GST compliance with CGST/SGST/IGST breakdown and HSN/SAC codes -- v2 (BIL-07)" | line 138 |
| `06-UI-SPEC.md` "GST Display (D-08, D-17)" | "No CGST/SGST split — Deferred to v2. No HSN/SAC codes — Deferred to v2." | lines 947–957 |
| `REQUIREMENTS.md` | BIL-07 listed under "## v2 Requirements — Deferred to post-Beta. Tracked but not in current roadmap." | line 108 |
| `REQUIREMENTS.md` traceability | Phase 6 = BIL-01…BIL-06 only. **BIL-07 and RPT-01 absent from the table.** | lines 186–191 |
| `ROADMAP.md` Phase 6 | Requirements list includes **BIL-07 and RPT-01**; success criterion #4 mandates full CGST/SGST/IGST + HSN/SAC per line item | lines 175, 181 |
| `ROADMAP.md` plan 06-04 | "GST compliance upgrade (BIL-07): per-line-item CGST/SGST/IGST with HSN/SAC codes, clinic state code…" | line 191 |
| `STATE.md` | "Phase 6 planning COMPLETE -- 06-04 covers BIL-07 (full GST) + RPT-01 (daily summary)" | line 96 |

**What the evidence actually shows:** the ROADMAP is the *later* document. BIL-07 and RPT-01 were pulled into Phase 6 during a coverage-gap analysis (STATE.md line 96 lists this alongside identical gap-fills for ONB-02→04-08, PAT-06→03-07, OWN-07→09-07, PLT-07→10-07). `06-CONTEXT.md` (gathered 2026-05-04) and `06-UI-SPEC.md` predate that decision and were never updated.

**Reinforcing evidence in the codebase — the GST groundwork is already built:**

| Artifact | Status | Source |
|----------|--------|--------|
| `ServiceCatalog.sacCode`, `.hsnCode`, `.gstRateOverride Decimal(5,2)` | **Already in `apps/api/prisma/schema.prisma`** (lines 537–556), already in `packages/types/src/billing.ts`, already in `packages/validators/src/billing.ts` | Shipped by Phase 4 plan 04-08 |
| `InventoryItem.hsnSacCode`, `.gstRate` | Planned in `05-08-PLAN.md`, explicitly justified as: *"Phase 6 plan 06-04 (BIL-07 GST compliance) assumes InventoryItem carries hsnSacCode and gstRate so the GstService can look up per-line-item HSN/SAC codes"* | `05-08-PLAN.md` line 67 |
| `05-08-PLAN.md` key_links | `"Phase 6 plan 06-04 reads hsnSacCode and gstRate from InventoryItem for invoice line items"` | line 60 |

Both upstream catalogs already carry per-line-item HSN/SAC and per-item GST rate. **D-08's "single flat rate applied to all services and products" would discard data the previous two phases were explicitly built to supply.**

**RPT-01 is undefined.** It appears in `ROADMAP.md` line 175 and `STATE.md` line 96 only. It is not in REQUIREMENTS.md v1 or v2, and no `RPT-*` prefix exists anywhere in `.planning/`. The ROADMAP success criterion #5 defines its content ("patients seen today, revenue collected today, total outstanding balance"), which is a strict superset of D-24's summary cards (Today's Revenue, Unpaid Total, Overdue Count, Recent Payments) — the only genuinely new metric is **patients-seen-today**, which is a `COUNT(DISTINCT petId)` over today's finalized consultations. **RPT-01 is ~2 hours of work, not a phase-scoping question.** Recommend adding it to REQUIREMENTS.md v1 and shipping it regardless of the GST decision.

**Both implementation paths are researched below** (see `## GST Implementation: Both Paths`). Neither path is blocked by the other — Path A (flat) is a strict subset of Path B (full), so Path B can be implemented directly without wasted work.

> **Researcher's recommendation (not a decision — user must confirm):** Ship **Path B (full GST)** in Phase 6. Rationale: (a) both upstream data sources already carry HSN/SAC + per-item rates; (b) Path A is not merely "less compliant" — it is **factually wrong for Indian veterinary clinics** (see Finding G1 below: veterinary healthcare services are GST-*exempt*, so applying 18% flat to a consultation line invents tax liability that does not exist); (c) retrofitting per-line-item tax onto finalized, immutable invoices later requires a data migration of historical financial records, which is far more expensive than doing it right the first time; (d) ROADMAP success criterion #4 is the phase's own definition of done.

### Contradiction 2: PDF engine — server-side `@react-pdf/renderer` vs. client-side `expo-print`

| Source | Says |
|--------|------|
| `ROADMAP.md` line 189 (plan 06-02) | "PDF generation (@react-pdf/renderer)" — **server-side, in the API** |
| `06-UI-SPEC.md` line 28 | "PDF engine: expo-print 55.0.13 (HTML-to-PDF, same as Phase 4)" — **client-side, on device** |
| `06-UI-SPEC.md` line 984 | Registry Safety lists `expo-print` and `expo-sharing` as the PDF stack |
| **Codebase (authoritative precedent)** | `apps/mobile/src/features/pdf/hooks/useGeneratePdf.ts` uses `expo-print` + `expo-file-system` + `expo-sharing`; 4 HTML templates in `apps/mobile/src/features/pdf/templates/` |

These are mutually exclusive architectures. See `## PDF Generation: Engine Decision` for the tradeoff analysis. **Recommendation: expo-print (client-side), matching the Phase 4 precedent** — with one caveat documented there about payment-receipt PDFs generated by webhook (D-13), which have no client present.

Also note `06-UI-SPEC.md` states "expo-print 55.0.13". No such version exists in the SDK-52-compatible range (see `## Environment Availability`). This is a stale/invented version string.

### Contradiction 3: Clinician billing permission

| Source | Says |
|--------|------|
| `06-CONTEXT.md` D-05 | "only Front Desk and Admin roles can create and manage invoices. **Clinicians cannot create invoices directly.**" |
| `apps/api/prisma/seed.ts` line 52 | `Clinician: [ …, 'VIEW_INVOICES', 'CREATE_INVOICES', … ]` — **already granted** |

D-05 is a locked decision. Phase 6 must either remove `CREATE_INVOICES` from the Clinician default role, or D-05 must be amended. **This matters more than it looks:** the "End Consultation creates a draft invoice" flow (D-03) is triggered *by a Clinician*, so the server-side draft-creation path must not be gated on `CREATE_INVOICES` even though the interactive builder is. Plan this as two distinct authorization surfaces:

- `POST /api/v1/billing/invoices` (interactive create) → `CREATE_INVOICES`, Front Desk + Admin only
- Internal `InvoiceService.createDraftFromConsultation()` called by `EmrService.finalizeConsultation()` → no permission check (server-initiated, not user-initiated)

### Contradiction 4: Money representation — integer paise vs. `Decimal(10,2)`

| Source | Representation |
|--------|----------------|
| `ServiceCatalog.price` (shipped) | `Int` — "price in paise" (`schema.prisma` line 543; `service-catalog-seed.ts` line 16: "Prices in paise (₹500 = 50000 paise)") |
| `packages/types/src/billing.ts` | `price: number; // paise` |
| `05-01-PLAN.md` `InventoryItem.sellingPrice` | `Decimal @db.Decimal(10, 2)` — **rupees with 2 decimals** |

An invoice that sums a service priced in paise (`Int`) and a product priced in rupees (`Decimal`) will be wrong by a factor of 100 unless every call site converts. **Recommendation: integer paise everywhere.** See `## Don't Hand-Roll` → money. Phase 6 planning must either (a) normalize `InventoryItem.sellingPrice` to `Int` paise before Phase 5 ships, or (b) add an explicit, tested `toPaise()` boundary adapter in the invoice line-item builder with a unit test that catches the 100× error. Option (a) is strongly preferred and is cheap right now because Phase 5 is not yet implemented.

### Contradiction 5: `packages/shared/` does not exist

All Phase 5 plans (`05-01` through `05-08`) reference paths like `packages/shared/src/types/inventory.types.ts`, `packages/shared/src/validators/inventory.validators.ts`, `packages/shared/src/constants/hsn-codes.ts`.

**Verified:** `packages/shared/` is an empty orphan directory containing only a stale `node_modules/`. It has no `package.json` and is not a pnpm workspace member. The real convention, per `CLAUDE.md` and the shipped code, is `packages/types/src/*.ts` + `packages/validators/src/*.ts`.

Phase 6 plans must use `packages/types/` and `packages/validators/`. Phase 6 must also not assume Phase 5's constants live at the paths Phase 5's plans claim.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Invoice Creation Flow**
- **D-01:** Auto-populate + manual add — draft invoice auto-populates dispensed items from Phase 5 inventory (D-50). Front desk manually adds service line items from a preset service catalog. One-tap to add common services
- **D-02:** Preset + custom service catalog — ship with common presets: General Consultation, Surgery, Vaccination, Lab Test, X-Ray, Dental Cleaning. Admin can add custom services with name + price. Quick-tap to add to invoice
- **D-03:** Both creation paths — End Consultation (Phase 4, D-04) creates draft invoice with dispensed items. Invoices can also be created independently from Billing tab for counter sales or missed charges
- **D-04:** Separate "Quick Sale" screen — dedicated POS-like screen in Billing tab for counter sales (pet food, supplements, accessories without consultation). Scan barcode, add to cart, generate invoice. Linked to Phase 5 counter sale (D-52)
- **D-05:** Front Desk + Admin billing permissions — only Front Desk and Admin roles can create and manage invoices. Clinicians cannot create invoices directly. Solo vets use Admin role which has full billing access
- **D-06:** Front Desk pulls from completed visits — Front Desk sees completed consultations and creates invoices by pulling in dispensed items and adding services. No auto-queue or vet-initiated handoff
- **D-07:** Line-item + invoice-level discounts — percentage or flat discount on individual items OR on the total invoice. Common in Indian vet clinics for regulars and multi-pet owners
- **D-08:** Single configurable GST rate — one GST rate (e.g., 18%) applied to all services and products. Configured in clinic settings. Full GST with CGST/SGST/IGST and HSN/SAC codes deferred to v2 (BIL-07) *(⚠️ see Contradiction 1)*

**Payment Integration**
- **D-09:** Razorpay Payment Links API — server creates payment link via Razorpay API. QR code displayed on clinic device for in-person payment. Shareable link for remote collection (owner left without paying). Webhook confirms payment status
- **D-10:** Cash + digital + split payment — support cash, UPI, and card payments. Split payment allowed (e.g., ₹1000 cash + ₹500 UPI). Cash payments marked manually. Digital payments via Razorpay
- **D-11:** Auto-retry + manual fallback on failure — failed Razorpay payment shows error with reason. Front desk can retry (regenerate link/QR) or mark as unpaid. Pending payments timeout after 15 minutes and revert to unpaid
- **D-12:** Full + partial refunds — both full and partial refunds supported. Digital refunds via Razorpay Refund API. Cash refunds tracked as manual adjustment. Split payment refunds: digital portion via Razorpay, cash portion marked as "refunded manually"
- **D-13:** Auto-generated payment receipts — after payment confirmation (webhook), system generates payment receipt with transaction ID, amount, method, timestamp. Available as PDF. Separate document from the invoice

**Invoice Presentation & PDF**
- **D-14:** Full professional invoice — clinic header (logo, name, address, phone, GSTIN), owner info (name, phone), pet info (name, species), line items (services + products with qty, rate, amount), subtotal, GST line, discount, grand total, payment status, invoice number, date
- **D-15:** Auto-sequential numbering per clinic — format: INV-YYYYMM-XXXX (e.g., INV-202605-0001). Sequential within each clinic, resets monthly. Unique, auditable, GST-friendly
- **D-16:** Print + WhatsApp share + download — three share options: Print (thermal/regular), WhatsApp (sends PDF to owner via Phase 7 abstraction layer), Download (save to device). Same pattern as Phase 4 PDFs (D-45 to D-48)
- **D-17:** Basic GST line — show "GST @ X%: ₹Y" on invoice. No CGST/SGST split, no HSN/SAC codes. Clinic configures GST rate + GSTIN in settings. Full GST compliance deferred to v2 (BIL-07) *(⚠️ see Contradiction 1)*
- **D-18:** Full in-app invoice view — invoice displayed as native screen with all details, action buttons (Pay, Print, Share, Refund), payment history, and status. PDF generated on demand when Print/Share is tapped
- **D-19:** Credit note numbering — auto-sequential: CN-YYYYMM-XXXX. Same pattern as invoice numbering

**Invoice Lifecycle & Status**
- **D-20:** States: Draft → Finalized → Paid/Partially Paid/Unpaid/Overdue — Draft: editable, not yet sent. Finalized: locked, printable, awaiting payment. Paid: full payment received. Partially Paid: split payment with portion pending. Overdue: unpaid past due date
- **D-21:** Finalized invoices locked — cannot be edited after finalization. If wrong, void the invoice and create a new one. For partial corrections, issue a credit note. Maintains audit trail integrity
- **D-22:** Simple credit notes — negative invoice referencing the original. Contains items/amount being credited. Reduces outstanding balance. Shows in billing history linked to original invoice
- **D-23:** Due date + overdue flag — each invoice has a due date (default configurable in settings). System auto-flags overdue invoices. Overdue list visible in Billing dashboard. No automated reminders for Beta
- **D-24:** Summary cards + filterable invoice list — top of Billing tab: Today's Revenue, Unpaid Total, Overdue Count, Recent Payments. Below: filterable invoice list by status, date range, patient. Same pattern as Inventory summary (Phase 5, D-32)
- **D-25:** Invoice tab on pet profile — add "Invoices" tab to pet profile (Phase 3). Shows all invoices for that pet, newest first. Tap to view full invoice
- **D-26:** Void prompts stock restoration — when voiding an invoice, system asks "Return dispensed items to stock?" If yes, creates reverse stock movements (Phase 5 return flow, D-51). If no, stock stays deducted
- **D-27:** One invoice per pet — each consultation generates its own invoice linked to that pet. Multi-pet owners get separate invoices. Owner can pay multiple invoices at once via combined payment link

**Navigation & Settings**
- **D-28:** Replace 'More' tab with Billing — bottom tabs become: Queue, Patients, Inventory, Billing. 'More' menu items (settings, profile, reports) move to a drawer/hamburger menu or settings gear icon. Billing is a core daily workflow
- **D-29:** Essential billing settings — admin configures in clinic settings: GSTIN number, default GST rate (%), default due date (days from invoice), clinic bank account details (for display on invoice), invoice footer text (terms/notes), Razorpay API keys. All optional except Razorpay keys for digital payments

### Claude's Discretion

- Invoice builder UI layout (single-page vs sections)
- Quick Sale screen UX and barcode integration details
- Payment QR code display size and styling
- Refund confirmation flow UI
- Credit note creation wizard vs inline form
- Invoice list card design and information density
- Due date calculation for same-day vs remote invoices
- Receipt PDF layout and branding
- Billing summary card styling and metric calculations
- Invoice search and filter UX

### Deferred Ideas (OUT OF SCOPE)

- Full GST compliance with CGST/SGST/IGST breakdown and HSN/SAC codes -- v2 (BIL-07) *(⚠️ contested — see Contradiction 1)*
- Payment link generation shareable via WhatsApp/SMS -- v2 (BIL-08)
- WhatsApp invoice delivery with embedded pay links (real API) -- v2 (BIL-09)
- Automated overdue payment reminders via WhatsApp -- Phase 7 or post-Beta
- Revenue analytics charts and trends -- post-Beta analytics dashboard
- Multi-pet combined invoice option -- deferred, one-per-pet is cleaner for Beta
- Recurring invoices for chronic treatment plans -- post-Beta if needed
- Razorpay Checkout SDK (in-app) -- Payment Links API sufficient for Beta
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BIL-01 | User can generate an invoice from consultation services and dispensed items | `## Architecture Patterns` → Pattern 1 (invoice assembly from two upstream sources); `ServiceCatalog` model already shipped; `Prescription.dispensed` + `Prescription.inventoryItemId` are the Phase 4 join keys (verified in `schema.prisma` lines 464–465) |
| BIL-02 | Invoice validates stock availability in real time before finalizing | `## Architecture Patterns` → Pattern 3 (finalize-in-transaction with `SELECT … FOR UPDATE` on batches); `## Common Pitfalls` → Pitfall 4 (TOCTOU on stock) |
| BIL-03 | User can mark invoices as paid or unpaid | `## Architecture Patterns` → Pattern 2 (invoice state machine, 7 states); `## Don't Hand-Roll` → state transitions |
| BIL-04 | User can print or export invoice as PDF | `## PDF Generation: Engine Decision`; existing `apps/mobile/src/features/pdf/` precedent |
| BIL-05 | User can accept payment via Razorpay (UPI and card) | `## Razorpay Integration` → Payment Links API (verified against official docs, exact params + constraints) |
| BIL-06 | Payment confirmation updates invoice status automatically (via webhook) | `## Razorpay Integration` → Webhooks (raw body, HMAC-SHA256, 5s/2xx budget, idempotency via `x-razorpay-event-id`) |
| BIL-07 | Full GST-compliant invoicing with CGST/SGST/IGST breakdown and HSN/SAC codes | `## GST Implementation: Both Paths` → Path B; ⚠️ **scope contested — see Contradiction 1** |
| RPT-01 | *(undefined in REQUIREMENTS.md)* — inferred from ROADMAP criterion #5: daily summary card with patients seen today, revenue collected today, total outstanding balance | `## Architecture Patterns` → Pattern 6 (dashboard aggregate query); ⚠️ **requirement does not exist in REQUIREMENTS.md — see Contradiction 1** |
</phase_requirements>

---

## Summary

Phase 6 is the first phase in this project where **correctness is legally and financially load-bearing**. Three research findings dominate planning:

**1. The GST model in D-08/D-17 is factually wrong for Indian veterinary clinics, independent of the scope contradiction.** Veterinary healthcare services are **exempt** from GST under Entry 46 of Notification 12/2017-Central Tax (Rate) (SAC 99835 / 998351). Pet food, accessories, and most medicines are **taxable**. A single flat 18% applied uniformly to "all services and products" (D-08) would cause a clinic to charge tax on exempt consultations — a real compliance exposure, not a cosmetic simplification. Separately, GST 2.0 (effective 22 Sept 2025) collapsed the slab structure to 5% / 18% / 40%, moving most medicines from 12% → 5%. Any hard-coded slab list from before that date is stale. And most solo vets fall below the ₹20 lakh services registration threshold, so **GST must be fully switchable off per clinic** — an unregistered clinic that prints "GST @ 18%" on an invoice is committing an offence under Section 122 (tax collected without registration).

**2. Razorpay integration has four non-obvious hard constraints** that shape the API design: webhooks must return 2xx within **5 seconds** or Razorpay retries with exponential backoff for 24h then disables the webhook; signature verification requires the **raw, unparsed** request body (Fastify's default JSON parser destroys it); the same event will be delivered more than once (dedupe on `x-razorpay-event-id`); and `expire_by` must be **strictly ≥ 15 minutes** in the future — D-11's "15 minute expiry" sits exactly on the rejection boundary and will intermittently 400. Additionally, the "QR code on clinic device" UX (D-09) should be implemented by rendering a QR of the Payment Link `short_url` client-side, **not** via Razorpay's QR Codes API, which is an activation-gated on-demand feature.

**3. The existing codebase has two money-critical defects that Phase 6 will amplify.** `createTenantClient()` (`apps/api/src/lib/prisma-rls.ts`) instantiates a **brand-new `PrismaClient` on every request** with no disconnect — a connection-pool exhaustion bug that becomes an outage once billing traffic and webhook traffic are added. Worse, it issues `SET LOCAL app.clinic_id` outside an explicit transaction, so the setting is not guaranteed to apply to the connection that runs the subsequent query — meaning **RLS may not actually be enforced today**. And RLS is enabled on only 3 of 24 tables (`clinic_members`, `auth_audit_law`, `notifications`); `pets`, `consultations`, `service_catalog` and everything else from Phases 3–4 have no RLS policies and no migration files at all. Phase 6 must not add 8 billing tables on top of this foundation without a Wave 0 remediation.

**Primary recommendation:** Structure Phase 6 as **5 plans, not 4** — insert a Wave 0 infrastructure plan (RLS/tenant-client remediation + missing Phase 3–5 migrations + money-unit normalization + missing Expo deps) before the shared-contracts plan. Implement GST as per-line-item from the start (Path B), with `taxTreatment: 'exempt' | 'taxable' | 'nil_rated'` per line, since both upstream catalogs already carry HSN/SAC and per-item rates. Keep PDF generation client-side via `expo-print` per the Phase 4 precedent, with a documented exception for webhook-generated receipts.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Invoice draft assembly (pull services + dispensed items) | API / Backend | Database | Cross-module read of `Consultation` → `Prescription[]` (dispensed) + `ServiceCatalog`; must be transactional and tenant-scoped |
| Sequential invoice/credit-note numbering | Database | API | Gap-free per-clinic monthly counters require DB-level serialization (advisory lock or `FOR UPDATE` on a counter row). Cannot be done correctly in application code |
| GST computation & tax breakdown | API / Backend | — | Server is the single source of truth for money. Client computes a **display-only preview**; server recomputes and persists on finalize |
| Real-time stock validation (BIL-02) | Database | API | Requires row locks on batch rows inside the same transaction as invoice finalization. Application-level "check then write" is a TOCTOU bug |
| Payment link creation | API / Backend | — | Razorpay `key_secret` must never reach the device. Non-negotiable |
| Payment confirmation (webhook) | API / Backend | Mobile (Socket.IO push) | Razorpay → API webhook is authoritative; API pushes `invoice:updated` over the existing Socket.IO channel so the open PaymentScreen updates without polling |
| Payment QR rendering | Browser / Client (mobile) | — | Render QR from the returned `short_url` with `react-native-qrcode-svg`. No server round-trip, no image storage, works offline once the link is fetched |
| Invoice / receipt / credit-note PDF | Browser / Client (mobile) | API (webhook-receipt exception) | Matches shipped Phase 4 pattern (`expo-print`). Exception: D-13 webhook-generated receipts have no client — see PDF section |
| Invoice persistence + tenant isolation | Database | API | PostgreSQL RLS; billing tables MUST have `FORCE ROW LEVEL SECURITY` |
| Overdue flagging (D-23) | API / Backend (cron) | — | `node-cron` job at `Asia/Kolkata`, mirroring `scheduleMidnightArchive` in `apps/api/src/jobs/` |
| Razorpay credentials storage | API / secret store | Database (encrypted) | Per-clinic `key_secret` + `webhook_secret` must be encrypted at rest; never returned to any client, even to Admin |
| Payment-link expiry timeout (D-11) | API / Backend | Mobile (countdown UI only) | Client countdown is cosmetic; server must independently expire and revert status (client may be backgrounded/killed) |
| Billing dashboard aggregates (D-24, RPT-01) | Database | API | Single indexed aggregate query; do not compute in JS over a full invoice fetch |

---

## Standard Stack

### Core (new to Phase 6)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `razorpay` | `2.9.8` | Official Razorpay Node SDK — Payment Links, Refunds, webhook signature validation | Official first-party SDK (`github.com/razorpay/razorpay-node`), 438k weekly downloads, published since 2016, ships bundled TypeScript declarations at `dist/razorpay.d.ts` and `dist/types/*.d.ts`. Only runtime dep is `axios ^1.18.1`. [VERIFIED: npm registry + official Razorpay docs] |
| `react-native-qrcode-svg` | `^6.3.21` | Render payment-link QR on device | Named in `06-UI-SPEC.md` line 30 and line 984. slopcheck `[OK]`. **[ASSUMED]** — discovered from UI-SPEC, not from official Expo/React Native docs. Peer deps verified: `react-native >=0.63.4`, `react-native-svg >=14.0.0` |
| `react-native-svg` | resolve via `npx expo install` | Peer dependency of the QR renderer | Expo-managed native module — the SDK-52-pinned version is `15.8.0`. Must be installed with `npx expo install react-native-svg`, never a bare `pnpm add`, or the native build breaks. [CITED: Expo managed-workflow install guidance] |

### Supporting (already present, or missing-but-required)

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| `expo-print` | resolve via `npx expo install` | HTML → PDF on device | **MISSING from `apps/mobile/package.json` and absent from `pnpm-lock.yaml`, yet imported by shipped Phase 4 code** (`apps/mobile/src/features/pdf/hooks/useGeneratePdf.ts:2`). Must be added in Wave 0 |
| `expo-sharing` | resolve via `npx expo install` | Native share sheet for PDFs | **Same — imported at `useGeneratePdf.ts:4`, not declared, not in lockfile** |
| `expo-file-system` | `18.0.12` | Move generated PDF to a named cache path | Present in `pnpm-lock.yaml` transitively but **not declared** in `apps/mobile/package.json`. Declare it explicitly |
| `react-native-paper` | `5.15.3` | MD3 components | Declared only in `packages/ui/package.json`. `STATE.md` line 72 records that Phase 4 fell back to plain RN components because "react-native-paper not in mobile dependencies". Phase 6's 40+ UI components in the UI-SPEC assume Paper. Resolve in Wave 0 or Phase 6 repeats the Phase 4 fallback |
| `node-cron` | `^4.6.0` (installed) | Overdue-flag job (D-23), payment-link expiry sweep (D-11) | Already used by `apps/api/src/jobs/midnight-archive.ts` with `{ timezone: 'Asia/Kolkata' }` |
| `bullmq` | `^5.30.0` (installed) | Async webhook post-processing to stay inside Razorpay's 5s budget | Already installed and wired to Redis |
| `socket.io` | `^4.8.3` (installed) | Push `invoice:updated` to the open PaymentScreen after webhook confirmation | Already registered via `apps/api/src/realtime/socket.ts` |
| `zod` | `^3.24.0` (installed) | Shared invoice/payment validation via `@breeyo/validators` | Project convention (CLAUDE.md) |

### Deliberately NOT added

| Not adding | Why |
|------------|-----|
| `@react-pdf/renderer` (4.6.0) | Contradicts the shipped Phase 4 client-side PDF architecture. Would add a React reconciler + font subsetting to the API server for output that the device already produces. See `## PDF Generation: Engine Decision` |
| `decimal.js` / `dinero.js` | Unnecessary. All money is integer paise (matching the shipped `ServiceCatalog.price: Int`). Integer arithmetic in JS is exact up to 2^53 paise ≈ ₹90 trillion. Adding a decimal library invites mixed representations |
| `fastify-raw-body` (6.0.1) | Fastify's built-in `addContentTypeParser` scoped to the webhook route achieves the same with zero new dependencies. See `## Code Examples` → Webhook raw body. `fastify-raw-body` is a valid alternative but is a community plugin. **[ASSUMED]** |
| Razorpay QR Codes API | Activation-gated: *"This is an on-demand feature — please raise a request with the Support team to get this feature activated on your account."* Cannot be a Beta dependency across 20 pilot clinics. [CITED: razorpay.com/docs/payments/qr-codes/apis/] |
| Any npm "Indian GST calculator" library | See `## Don't Hand-Roll` — this is the one place where hand-rolling is correct |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Payment Links API | Razorpay Checkout SDK (`react-native-razorpay`) | In-app native checkout is a better owner experience, but D-09 locks Payment Links and the Deferred list explicitly rules Checkout out. Payment Links also uniquely solve the "owner already left" case |
| Payment Links QR (client-rendered) | Razorpay QR Codes API (`upi_qr`, `qr_code.credited` webhook) | True UPI-intent QR that a UPI app scans directly, vs. a URL QR that opens the hosted payment page first (one extra tap). Blocked by activation gate |
| Payment Links with `upi_link: true` | — | Produces a UPI-intent link. **Requires live mode** (`upi_link` is "India only, live mode required") — cannot be exercised in the test-key development flow, so it cannot be the primary path for Beta |
| Per-clinic Razorpay merchant accounts (D-29) | Razorpay Route linked accounts under one platform account | Route centralizes credentials and webhooks (one secret, one endpoint) and enables platform fee capture, but requires the platform to be the merchant of record and adds settlement complexity. D-29 locks per-clinic keys. See `## Common Pitfalls` → Pitfall 2 for the webhook-routing consequence |
| Counter table + `FOR UPDATE` for numbering | PostgreSQL `SEQUENCE` per clinic-month | Sequences are gap-*ful* on rollback (a failed finalize burns a number). GST Rule 46(b) requires a consecutive serial number; auditors dislike gaps. Counter-row locking is gap-free at the cost of serializing finalizes per clinic — acceptable at solo-vet volume |

**Installation:**

```bash
# API (apps/api)
pnpm --filter @breeyo/api add razorpay

# Mobile (apps/mobile) — MUST use expo install for native modules
cd apps/mobile
npx expo install expo-print expo-sharing expo-file-system react-native-svg
pnpm --filter @breeyo/mobile add react-native-qrcode-svg react-native-paper
```

> `npx expo install` resolves the SDK-52-compatible version for each native module from Expo's version map. A bare `pnpm add expo-print` installs `57.x` (SDK 57) against an SDK 52 app and breaks the native build. This is the single most likely install-time failure in this phase.

---

## Package Legitimacy Audit

slopcheck was installed and run on 2026-08-12 against all candidate packages.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `razorpay` | npm | since 2016-09-27 | 438,478/wk | github.com/razorpay/razorpay-node (official) | `[OK]` | **Approved** — `[VERIFIED: npm registry + Razorpay official docs]` |
| `react-native-qrcode-svg` | npm | mature (6.x) | — | yes | `[OK]` | **Approved with caveat** — `[ASSUMED]`; discovered from `06-UI-SPEC.md`, not from an authoritative first-party doc. Registry existence + slopcheck OK is not sufficient for `[VERIFIED]` under the provenance rule |
| `react-native-svg` | npm | mature (15.x) | — | github.com/software-mansion/react-native-svg | `[OK]` | **Approved** — install via `npx expo install` |
| `expo-print` | npm | Expo first-party | — | github.com/expo/expo | `[OK]` | **Approved** — install via `npx expo install` |
| `expo-sharing` | npm | Expo first-party | — | github.com/expo/expo | `[OK]` | **Approved** — install via `npx expo install` |
| `@react-pdf/renderer` | npm | mature (4.x) | — | yes | `[OK]` | **REMOVED from recommendations** — not a legitimacy issue; rejected on architecture grounds (see Contradiction 2) |
| `decimal.js` | npm | mature | — | yes | `[OK]` | **Not needed** — integer paise |
| `fastify-raw-body` | npm | mature (6.x) | — | yes | `[OK]` | **Optional** — built-in `addContentTypeParser` preferred |

**Packages removed due to slopcheck `[SLOP]` verdict:** none
**Packages flagged as suspicious `[SUS]`:** none
**Postinstall script check:** `razorpay@2.9.8` declares no `postinstall` script. Verified via `npm view razorpay scripts.postinstall` (empty).

> ⚠️ **Note for the planner — a side effect occurred during this audit.** `slopcheck install …` runs a real `npm install` as part of its check. This created a root `package-lock.json`, added dependencies to the root `package.json`, and installed into the root `node_modules/` of this pnpm workspace. All three were reverted (`git checkout -- package.json`, `rm package-lock.json`, `rm -rf node_modules`) and the workspace was restored with `pnpm install` (verified clean). If any future agent runs `slopcheck install` in this repo, it must repeat this cleanup. Prefer `slopcheck scan` where a non-installing check is sufficient.

---

## GST Implementation: Both Paths

### Finding G1 (HIGH confidence, changes both paths): veterinary services are GST-EXEMPT

Entry 46 of **Notification No. 12/2017-Central Tax (Rate)** dated 28-06-2017 exempts "services by way of veterinary clinic in relation to health care of animals or birds." Veterinary services classify under **SAC 99835** (heading 9983), with **SAC 998351** specifically for pet veterinary services — rate **0% / exempt**. [CITED: taxguru.in, bizfoc.com, busy.in]

The exemption covers *healthcare* only. Explicitly outside it and therefore **taxable**:
- Sale of pet food, supplements, accessories (the entire Quick Sale flow, D-04)
- Sale of medicines and consumables as goods (dispensed items, D-01)
- Grooming, boarding, non-medical services
- Lab testing supplied as a standalone commercial service (disputed area — an Advance Ruling exists treating standalone lab commissions/tests as taxable)

**Implication for D-08:** "One GST rate (e.g., 18%) applied to all services and products" would charge 18% on an exempt General Consultation. That is not a simplification; it is an incorrect tax charge. **Both Path A and Path B must therefore support a per-line `taxTreatment` flag.** This is the single most important research finding in this document.

**Implication for the service catalog seed:** the six preset services in D-02 (General Consultation, Surgery, Vaccination, Lab Test, X-Ray, Dental Cleaning) are *all* plausibly exempt veterinary healthcare, except possibly standalone Lab Test. The shipped `ServiceCatalog` rows should be seeded with `sacCode: '998351'` and `gstRateOverride: 0` / `taxTreatment: 'exempt'`.

### Finding G2 (HIGH confidence): GST 2.0 changed the slabs on 22 Sept 2025

The 56th GST Council meeting introduced GST 2.0 effective **22 September 2025**: slabs collapsed to **5% / 18% / 40%** (40% for luxury and sin goods). Most medicines, diagnostic devices and healthcare products moved **12% → 5%**; 33 life-saving drugs went to nil. Most pet products previously at 12% moved to 5%. [CITED: cygnet.one, busy.in, cleartax.in]

**Implication:** `05-08-PLAN.md` specifies a GST rate picker validating against "0, 5, 12, 18, or 28". **12% and 28% no longer exist as general slabs.** The shared `GST_RATE_SLABS` constant should be `[0, 5, 18, 40]`. Phase 6 must either fix this in Phase 5's plan or accept a stale picker. Because rates change by notification, model the slab list as a **constant that is easy to change**, and store the *applied rate* on each finalized invoice line (never recompute historical invoices from the current constant).

### Finding G3 (HIGH confidence): most solo vets are not GST-registered

GST registration is mandatory for service providers above **₹20 lakh** annual aggregate turnover (₹10 lakh in special-category states). A solo vet doing ~₹15 lakh/year is not registered, has no GSTIN, and **must not collect GST**. Collecting tax without registration is an offence under Section 122 with penalty up to ₹25,000 or 100% of tax, whichever is higher.

**Implication:** GST must be a **first-class off switch per clinic**, not a rate that defaults to 18%. If `clinic.gstin` is null → `gstEnabled = false` → no tax lines, no "GST @ X%" row, no "Tax Invoice" heading. `06-UI-SPEC.md` line 335 shows the GST Rate field placeholder as "18", which nudges every clinic toward charging tax. Recommend defaulting to GST-off and gating the rate field behind a "This clinic is GST-registered" toggle bound to GSTIN presence.

### Finding G4 (HIGH confidence): the correct document type is invoice-cum-bill of supply

- A registered person supplying **only exempt** goods/services issues a **Bill of Supply** (not a "Tax Invoice").
- A registered person supplying **both taxable and exempt** to an **unregistered** recipient (which is every pet owner) may issue a single **"invoice-cum-bill of supply"** under **CGST Rule 46A** (inserted by Notification 45/2017-CT, proviso added by 26/2022-CT). [CITED: cbic taxinformation.gov.in Rule 46A, gstzen.in, cleartax.in]

A typical vet invoice — exempt consultation + taxable medicines — is **exactly** the Rule 46A case. The document heading logic:

| Clinic GST-registered? | Invoice contains | Correct heading |
|---|---|---|
| No | anything | `INVOICE` (plain, no tax lines, no GSTIN) |
| Yes | only exempt lines | `BILL OF SUPPLY` |
| Yes | only taxable lines | `TAX INVOICE` |
| Yes | mixed | `INVOICE-CUM-BILL OF SUPPLY` |

This is ~15 lines of logic in the PDF template and applies to **both paths**.

### Finding G5 (HIGH confidence): Rule 46 mandatory fields and the 16-character limit

Rule 46 of the CGST Rules specifies 16 mandatory fields: the document heading; supplier name, address, GSTIN; a **consecutive serial number unique for the financial year, maximum 16 characters** (Rule 46(b)); date of issue; recipient name/address/GSTIN; **place of supply**; HSN/SAC per line; description; quantity; taxable value; rate; tax amount **split by CGST/SGST or IGST**; and signature. [CITED: cleartax.in, taxgarden.in]

D-15's `INV-YYYYMM-XXXX` = **15 characters** ✓ within the limit, and unique within a financial year because the month is embedded. However: the Indian financial year runs **April–March**, and D-15 resets monthly, so uniqueness holds but the number does not restart on 1 April. That is compliant (Rule 46(b) requires uniqueness within the FY, not a 1-April restart) but worth noting for a future FY-aware format.

**HSN digit requirements by AATO:** ≤ ₹5 crore → 4-digit HSN mandatory on B2B, **optional on B2C**. Above ₹5 crore → 6-digit. Pilot clinics are far below ₹5 crore and all sales are B2C, so **HSN reporting is legally optional for them** — but it is required to produce a *filing-ready* invoice per the ROADMAP goal, and the data already exists in both catalogs. **e-invoicing (IRN) is not applicable**: mandatory only for B2B/export above ₹5 crore AATO (₹5 crore threshold from 1 April 2026, Notification 17/2025-CT). Do not build IRP integration.

**For B2C invoices above ₹50,000 to an unregistered buyer**, the recipient's name, address and state of delivery are mandatory. Vet invoices rarely exceed ₹50k, but surgery invoices can. Recommend capturing owner address on the invoice when `grandTotal > 5_000_000` paise.

### Finding G6 (HIGH confidence): rounding

Section 170 of the CGST Act + Rule 51: the tax amount on **each invoice** is rounded to the nearest rupee — < 50 paise rounded down, ≥ 50 paise rounded up. Rounding applies to CGST, SGST and IGST **individually**, at invoice level (not per line). [CITED: cleartax.in, captainbiz.com]

**Implementation:** compute per-line tax in exact integer paise; sum per tax head; round each head to the nearest rupee at invoice level; persist a `roundOff` delta so `subtotal + taxes + roundOff = grandTotal` exactly. Never round per line — per-line rounding accumulates error and will not reconcile with GSTR-1.

### Path A — Single flat configurable rate (per D-08 / D-17)

**Data model additions:**

```
Clinic:            gstin (exists), gstRate Decimal(5,2)?, gstEnabled Boolean @default(false)
Invoice:           subtotalPaise Int, discountPaise Int, taxableValuePaise Int,
                   gstRateApplied Decimal(5,2)?, gstAmountPaise Int,
                   roundOffPaise Int, grandTotalPaise Int
InvoiceLineItem:   … , taxTreatment String  -- 'exempt' | 'taxable'   ← REQUIRED even in Path A (Finding G1)
```

**Computation:**
1. Per line: `lineTotal = qty * unitPricePaise`, apply line discount → `lineTaxable`
2. Apply invoice-level discount pro-rata across lines (see Pitfall 6)
3. `taxableBase = Σ lineTaxable WHERE taxTreatment = 'taxable'`
4. `gstAmount = round_half_up(taxableBase * gstRate / 100)` at invoice level
5. `grandTotal = Σ lineTaxable + gstAmount + roundOff`

**Invoice presentation:** one row, `GST @ 18%: ₹216`.

**What Path A cannot do:** produce a GST filing-ready invoice. GSTR-1 requires the CGST/SGST vs IGST split and HSN-wise summary. Path A satisfies the *literal* text of D-17 but not the ROADMAP's Phase 6 goal ("GST filing-ready invoice").

**Effort estimate:** ~1 plan-day. **Migration cost to Path B later:** high — requires backfilling `cgstPaise`/`sgstPaise`/`igstPaise`/`hsnCode`/`placeOfSupply` onto *finalized, immutable* invoices (D-21), which by definition cannot be edited. Realistically this means historical invoices stay non-compliant forever.

### Path B — Full per-line-item CGST/SGST/IGST + HSN/SAC (per ROADMAP #4 / BIL-07)

**Data model additions (superset of Path A):**

```
Clinic:            gstin, gstEnabled, stateCode String?  -- 2-digit GST state code, e.g. '27' Maharashtra
                   (derivable from chars 1–2 of a valid GSTIN)
Invoice:           placeOfSupplyStateCode String?, isInterState Boolean,
                   documentType String,  -- 'invoice'|'tax_invoice'|'bill_of_supply'|'invoice_cum_bill_of_supply'
                   subtotalPaise, discountPaise, taxableValuePaise,
                   cgstPaise Int, sgstPaise Int, igstPaise Int,
                   roundOffPaise Int, grandTotalPaise Int
InvoiceLineItem:   hsnSacCode String?, taxTreatment String,
                   gstRatePercent Decimal(5,2),   -- rate APPLIED, frozen at finalize
                   taxableValuePaise Int, cgstPaise Int, sgstPaise Int, igstPaise Int
InvoiceHsnSummary: (optional) hsnSacCode, totalQty, taxableValuePaise, rate, cgst, sgst, igst
```

**Intra- vs inter-state determination:**
```
isInterState = clinic.stateCode !== placeOfSupplyStateCode
```
Place of supply for goods = location where delivery terminates (the clinic counter → clinic's state). For services = location of the recipient if registered, else location of supplier (the clinic). **For a walk-in vet clinic, place of supply is essentially always the clinic's own state → intra-state → CGST + SGST.** Inter-state (IGST) is a genuine edge case (an out-of-state registered owner). Implement the branch, default it to intra-state, and do not build UI for manual place-of-supply override in Beta.

**Per-line computation:**
```
lineTaxable = qty * unitPrice - lineDiscount - proRataInvoiceDiscount
if taxTreatment == 'exempt':      cgst = sgst = igst = 0
elif isInterState:                igst = lineTaxable * rate / 100;  cgst = sgst = 0
else:                             cgst = sgst = lineTaxable * (rate/2) / 100;  igst = 0
```
Keep exact paise per line; round each **tax head total** to the nearest rupee at invoice level (Finding G6).

**Rate sourcing per line:**
| Line type | Rate source | Fallback |
|-----------|-------------|----------|
| Service | `ServiceCatalog.gstRateOverride` (**exists today**) | `0` (exempt, per Finding G1) |
| Product | `InventoryItem.gstRate` (Phase 5 plan 05-08) | `clinic.defaultGstRate`, else `18` |
| HSN/SAC | `ServiceCatalog.sacCode` / `.hsnCode` (**exists today**) or `InventoryItem.hsnSacCode` | null → omit column |

**Effort estimate:** ~1.5 plan-days — only ~0.5 day more than Path A, because the per-line `taxTreatment` flag, the exempt handling, the invoice-level rounding, the `documentType` heading logic and the Rule 46 field set are **required in both paths**. The genuine Path-B-only work is: the `stateCode` field, the intra/inter branch (one `if`), splitting one `gstAmount` column into three, and adding an HSN column to the PDF table.

**This 0.5-day delta is the actual cost of the contradiction.** Path A is not meaningfully cheaper.

---

## Razorpay Integration

### Payment Links API — verified contract

`POST /v1/payment_links` [CITED: razorpay.com/docs/api/payments/payment-links/create-standard/]

| Param | Type | Constraint |
|-------|------|------------|
| `amount` | integer | **Required.** Smallest currency unit (**paise**). Minimum `100` for INR. Whole number only |
| `currency` | string | `"INR"` |
| `accept_partial` | boolean | Default `false`. **Set `true` for split-payment digital portions** (D-10) |
| `first_min_partial_amount` | integer | ≤ total, ≥ currency minimum |
| `upi_link` | boolean | Default `false`. **India only, live mode required** — unusable with test keys |
| `description` | string | Max 2048 chars |
| `reference_id` | string | **Max 40 chars, must be unique per link.** A UUID is 36 chars → use the invoice UUID, or `inv_<uuid>` (40 chars exactly — prefer the bare UUID) |
| `customer` | object | `{ name, contact (8–14 chars), email }` |
| `expire_by` | integer | Unix seconds. **Must be ≥ 15 minutes in the future.** Max 6 months. Default 6 months |
| `notify` | object | `{ sms: false, email: false }` — suppress for Beta; delivery is via WhatsApp in Phase 7 |
| `notes` | object | Max 15 key-value pairs, 256 chars each. **Use for `{ clinicId, invoiceId }` webhook routing** |
| `callback_url` / `callback_method` | string | `callback_method` supports `"get"` only |

Response: `id` (`plink_…`), `short_url`, `status` ∈ `created | partially_paid | paid | expired | cancelled`, `amount_paid`, `expire_by`, `expired_at`, `cancelled_at`, `payments[]` (null until captured).

**SDK methods verified by inspecting `razorpay@2.9.8` dist:**
`razorpay.paymentLink.create(params)`, `.fetch(id)`, `.cancel(id)`, `.edit(id, params)`, `.notifyBy(id, medium)`
`razorpay.payments.refund(paymentId, params)`, `.fetchRefund(paymentId, refundId)`
`razorpay.refunds.fetch(id)`, `.edit(id, params)`
`Razorpay.validateWebhookSignature(body, signature, secret)` — static, exported on the class

### ⚠️ D-11's "15 minute expiry" sits exactly on the rejection boundary

Razorpay requires `expire_by` to be **at least 15 minutes** in the future. Computing `expire_by = now + 15*60` and sending it means that by the time the request reaches Razorpay's server (network latency + any clock skew), the value is *less than* 15 minutes away → **HTTP 400, intermittently, in production only**.

**Fix:** set `expire_by = now + 16*60` (or `+17*60`). Display the D-11-specified 15:00 countdown in the UI and have the **server** expire the payment at the 15-minute mark independently. The extra Razorpay-side minute is a safety buffer that the user never sees.

### Webhooks — four hard constraints

[CITED: razorpay.com/docs/webhooks/best-practices/, /docs/webhooks/validate-test/, /docs/webhooks/payloads/payment-links/]

1. **Raw body required.** *"While generating a signature at your end, ensure that the webhook body is passed as an argument in the raw webhook request body."* Fastify's default `application/json` parser produces an object; `JSON.stringify()` of that object will **not** byte-match Razorpay's payload (key order, whitespace, unicode escaping). Signature verification will fail ~always. Scope a raw content-type parser to the webhook route only.
2. **5-second / 2xx budget.** *"All webhook responses must return a status code in the range 2XX within a window of 5 seconds."* Non-2xx or timeout → retried with exponential backoff for **24 hours**, then **the webhook is disabled** (which silently breaks BIL-06 for every clinic). Therefore: verify signature → persist a raw `WebhookEvent` row → return `200` → process asynchronously via BullMQ.
3. **Duplicate delivery is expected.** *"There could be scenarios where your endpoint might receive the same webhook event multiple times. This is an expected behaviour."* Dedupe on the **`x-razorpay-event-id`** header (unique per event) with a unique DB index. Non-idempotent handling here means double-marking an invoice paid, or double-refunding.
4. **Out-of-order delivery is possible.** `payment_link.paid` may arrive before `payment.captured`. Make the invoice state machine tolerant: transitioning to `PAID` when already `PAID` is a no-op, not an error.

**Payment Links webhook events:** `payment_link.paid`, `payment_link.partially_paid`, `payment_link.cancelled`, `payment_link.expired`. Payload contains a `payment_link` entity in all four (with `status`, `reference_id`, `amount_paid`) plus `order` and `payment` entities in the paid/partially_paid events.

**Signature verification caveat.** The SDK's `validateWebhookSignature` uses a plain `===` string comparison (verified in `dist/utils/razorpay-utils.js` line ~70):
```js
var expectedSignature = crypto.createHmac('sha256', secret).update(body).digest('hex');
return expectedSignature === signature;
```
This is not timing-safe. For a money endpoint, prefer `crypto.timingSafeEqual` on equal-length buffers (see `## Code Examples`). Practical exploitability over the network is low, but this is a two-line hardening on the highest-value endpoint in the product.

### ⚠️ Per-clinic keys (D-29) creates a webhook-routing problem

D-29 stores **per-clinic** Razorpay Key ID + Key Secret. Each clinic's Razorpay account therefore has **its own webhook secret**. But there is one API deployment and one webhook URL. To verify a signature you must know which secret to use — and you cannot trust the body before verification.

Three viable designs:

| Design | How | Verdict |
|--------|-----|---------|
| **Per-clinic webhook path** (recommended) | `POST /api/v1/webhooks/razorpay/:webhookToken` where `webhookToken` is an unguessable per-clinic random string stored alongside the secret. Clinic pastes this URL into their Razorpay dashboard. Path → clinic → secret → verify | Unambiguous, no trial verification, no body parsing before auth. Costs one extra field in billing settings and one setup instruction |
| Parse-then-verify | Parse the raw body (untrusted) → read `payload.payment_link.entity.notes.clinicId` → load that clinic's secret → verify against raw body | Works, but you are making a DB query driven by unauthenticated input (DoS/enumeration surface). Acceptable with rate limiting |
| Trial verification | Try every clinic's secret until one matches | O(n) HMAC per request. Unacceptable |

**Additional consequence:** each of the 20 pilot clinics must independently configure a webhook in their own Razorpay dashboard. Plan for an onboarding step and a "Webhook not configured" health indicator in Billing Settings, or BIL-06 will silently fail for clinics that skipped it. Razorpay does offer application-level webhooks for Partner/sub-merchant setups, but that requires a Razorpay Partner account and changes the merchant-of-record model — out of scope for Beta given D-29.

### Razorpay credential storage — security requirement

`06-UI-SPEC.md` line 347 shows a "Razorpay Key Secret" input in Billing Settings. This means a live payment credential is transmitted to and stored by the API.

Requirements:
- Encrypt `keySecret` and `webhookSecret` at rest (AES-256-GCM with a key from env/KMS — **not** a column default, **not** plaintext)
- **Never** return the secret in any API response, not even masked-but-recoverable. `GET /billing/settings` returns `{ keyId, hasSecret: true, testMode }`
- Gate write access on `MANAGE_CLINIC_SETTINGS` (Admin only)
- Log secret rotation to the audit log
- The mobile client must never receive `keySecret`. The QR flow only needs `short_url`

### Refunds (D-12)

`razorpay.payments.refund(paymentId, { amount, speed, notes, receipt })`. `amount` in paise; omit for a full refund. `speed: 'normal' | 'optimum'`. Refund webhooks: `refund.created`, `refund.processed`, `refund.failed` — a refund is **not instant**, so the UI-SPEC copy "2-5 business days" is correct and the invoice must carry a `refund_pending` sub-state until `refund.processed` arrives. Do not mark an invoice `REFUNDED` on API call success.

**Split-payment refund (D-12):** the digital portion refunds against its `razorpay_payment_id`; the cash portion is a manual `RefundRecord` with `method: 'cash'`. These are two rows, possibly settling at different times. Model refunds as a separate table, not a nullable column on the payment.

---

## PDF Generation: Engine Decision

| Dimension | `expo-print` (client) — **recommended** | `@react-pdf/renderer` (server) |
|-----------|------------------------------------------|-------------------------------|
| Matches shipped code | ✅ `apps/mobile/src/features/pdf/` — 4 templates + `useGeneratePdf` hook already exist | ❌ new subsystem |
| Matches UI-SPEC | ✅ lines 28, 984 | ❌ |
| Matches ROADMAP 06-02 | ❌ | ✅ |
| Print support (D-16) | ✅ `Print.printAsync()` → native print dialog, thermal + regular | ❌ requires download-then-print |
| Works offline | ✅ (given cached invoice data) | ❌ needs connectivity |
| Server CPU/memory | none | React reconciler + font subsetting per render |
| Webhook-generated receipt (D-13) | ❌ **no client present** | ✅ |
| Deterministic cross-device rendering | ⚠️ WebView engine differs iOS/Android | ✅ |

**Recommendation:** keep PDF generation client-side with `expo-print`, reusing the Phase 4 template pattern (`buildInvoiceHtml`, `buildReceiptHtml`, `buildCreditNoteHtml` in `apps/mobile/src/features/pdf/templates/`).

**Resolve D-13's webhook-receipt requirement without a server PDF engine:** D-13 says "after payment confirmation (webhook), system generates payment receipt… Available as PDF." Interpret "generates" as **generating the receipt record** (receipt number, txn id, amount, method, timestamp) server-side, with the PDF rendered on demand by the client when the user taps "View Receipt". This satisfies D-13's observable behaviour, keeps a single PDF engine, and avoids rendering PDFs nobody opens. **Flag this interpretation to the user** — if Phase 7 later needs to *push* a receipt PDF over WhatsApp without a client, a server-side renderer becomes genuinely necessary at that point.

**Base64 logo caveat (inherited from Phase 4):** `useGeneratePdf.ts` documents *"Logo images should use base64 data URIs for iOS compatibility."* The invoice clinic header (D-14) includes `clinic.logoUrl`. Remote `<img src>` in `expo-print` HTML does not reliably render on iOS. Fetch and inline the logo as a data URI.

---

## Architecture Patterns

### System Architecture Diagram

```
┌── MOBILE (Expo) ─────────────────────────────────────────────────────────┐
│                                                                          │
│  Consultation screen ──[End Consultation]──┐                             │
│  Billing tab ──[FAB: New Invoice]──────────┤                             │
│  Quick Sale ──[scan/search → cart]─────────┤                             │
│                                            v                             │
│                                    InvoiceBuilder                        │
│                                  (display-only totals preview)           │
│                                            │                             │
│  PaymentScreen ◄── Socket.IO 'invoice:updated' ◄────────────┐            │
│      │  renders QR from short_url (react-native-qrcode-svg) │            │
│      │                                                      │            │
│  PDF: expo-print → expo-file-system → expo-sharing          │            │
└──────┼──────────────────────────────────────────────────────┼────────────┘
       │ HTTPS  /api/v1/billing/*   (JWT + tenantContext)     │
       v                                                      │
┌── FASTIFY API ───────────────────────────────────────────────┼───────────┐
│                                                              │           │
│  billing.routes ─► billing.controller ─► InvoiceService ─────┤           │
│                                            │                 │           │
│                    ┌───────────────────────┼──────────────┐  │           │
│                    v                       v              v  │           │
│              GstService            NumberingService  StockValidator      │
│           (per-line tax,          (advisory lock,   (Phase 5 batches,    │
│            exempt/taxable,         gap-free)         FOR UPDATE)         │
│            CGST/SGST/IGST)                                    │           │
│                    │                       │              │  │           │
│                    └───────────┬───────────┴──────────────┘  │           │
│                                v                              │           │
│                        PaymentService ──► RazorpayClient ─────┼──► Razorpay
│                                │            (per-clinic keys) │      API   │
│                                │                              │           │
│  POST /webhooks/razorpay/:token  ◄────────────────────────────┼──── Razorpay
│         │  raw-body parser (route-scoped)                     │    webhook │
│         │  HMAC-SHA256 timingSafeEqual                        │           │
│         │  dedupe on x-razorpay-event-id                      │           │
│         │  persist WebhookEvent ─► return 200 (< 5s) ─────────┘           │
│         └──► BullMQ 'billing-webhook' queue                               │
│                    └──► apply payment ─► state machine ─► Socket.IO emit  │
│                                                                           │
│  node-cron (Asia/Kolkata): overdue sweep (D-23) │ link-expiry sweep (D-11)│
└──────────────────────────┬────────────────────────────────────────────────┘
                           v
┌── POSTGRESQL 16 (RLS, FORCE) ─────────────────────────────────────────────┐
│  invoices · invoice_line_items · payments · refunds · credit_notes        │
│  credit_note_line_items · invoice_number_counters · webhook_events        │
│  ── reads ──►  service_catalog (Ph4) · prescriptions (Ph4) ·              │
│                inventory_items / stock_batches (Ph5) · pets · pet_owners  │
└───────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
apps/api/src/modules/billing/
├── billing.routes.ts             # /api/v1/billing/* — authenticate + tenantContext + requirePermission
├── webhook.routes.ts             # /api/v1/webhooks/razorpay/:token — NO auth, NO rate limit, raw body
├── invoice.controller.ts
├── invoice.service.ts            # state machine, draft assembly, finalize transaction
├── invoice.repository.ts
├── payment.service.ts            # cash + Razorpay link creation, split payments
├── refund.service.ts
├── credit-note.service.ts
├── gst.service.ts                # PURE FUNCTIONS — no I/O, exhaustively unit-tested
├── numbering.service.ts          # advisory-lock gap-free per-clinic monthly counter
├── stock-validator.service.ts    # bridges to Phase 5 inventory
├── razorpay.client.ts            # per-clinic SDK instance factory + credential decryption
├── webhook.service.ts            # signature verify, dedupe, enqueue
├── quick-sale.service.ts
├── dashboard.service.ts          # D-24 summary cards + RPT-01 patients-seen-today
├── service-catalog-seed.ts       # ALREADY EXISTS
├── billing.schema.ts
└── __tests__/

apps/api/src/jobs/
├── overdue-invoices.ts           # D-23 — daily, Asia/Kolkata
└── expire-payment-links.ts       # D-11 — every minute

packages/types/src/billing.ts     # EXTEND (ServiceCatalog already here)
packages/validators/src/billing.ts # EXTEND (serviceCatalogSchema already here)
packages/types/src/constants/invoice-status.ts

apps/mobile/src/features/billing/
├── screens/  components/  hooks/  stores/
apps/mobile/src/features/pdf/templates/
├── invoice.ts  payment-receipt.ts  credit-note.ts   # follow existing 4-template pattern
```

### Pattern 1: Draft invoice assembly from two upstream sources (BIL-01)

**What:** On `End Consultation`, build a DRAFT invoice by joining two independent sources.
**When:** `EmrService.finalizeConsultation()` and the standalone "From Consultation" picker.

Source A — dispensed products, from Phase 4's shipped `Prescription` model:
```
Prescription WHERE consultationId = ? AND dispensed = true AND inventoryItemId IS NOT NULL
  → line item: type PRODUCT, unitPrice from InventoryItem.sellingPrice,
    hsnSacCode from InventoryItem.hsnSacCode, gstRate from InventoryItem.gstRate
```
Source B — services, added manually by Front Desk from `ServiceCatalog` (D-01, D-02).

**Critical:** `Prescription` has **no `quantity` field** (verified: `schema.prisma` lines 446–470 — it has `dosage`, `frequency`, `duration`, `durationDays`, but no dispensed quantity). Phase 5's dispense flow (D-22, FIFO) is what records the actual quantity taken from stock. **The invoice must source quantity from Phase 5's `StockMovement` rows, not from `Prescription`.** If Phase 5 does not link `StockMovement` → `Consultation`, this join is impossible and Phase 6 will silently produce qty-1 line items. **Verify this link exists before planning 06-02; if it does not, it is a Phase 5 change, not a Phase 6 workaround.**

Draft creation must be **idempotent** — pressing End Consultation twice, or a retry after a timeout, must not create two drafts. Enforce with a unique partial index: `UNIQUE (consultation_id) WHERE status = 'DRAFT'`.

### Pattern 2: Invoice state machine (D-20, D-21, BIL-03)

Seven states per the ROADMAP: `DRAFT`, `FINALIZED`, `PAID`, `PARTIALLY_PAID`, `UNPAID`, `OVERDUE`, `VOIDED`.

**Note a modelling wrinkle the planner must resolve:** `FINALIZED` and `UNPAID` are not mutually exclusive in D-20's own description ("Finalized: locked, printable, awaiting payment" ≡ "Unpaid: no payment received yet"), and `OVERDUE` is a function of `dueDate < today AND balance > 0` rather than an independent state. Two clean options:

- **(a) Single enum, 7 values** (matches ROADMAP literally): `FINALIZED` is transient — set on finalize, immediately resolved to `UNPAID`/`PARTIALLY_PAID`/`PAID` by the payment reducer. `OVERDUE` is written by the nightly cron.
- **(b) Two fields:** `lifecycle ∈ {DRAFT, ISSUED, VOIDED}` + derived `paymentStatus ∈ {UNPAID, PARTIALLY_PAID, PAID}` + computed `isOverdue`. Cleaner, fewer invalid states, but diverges from "7 statuses" in ROADMAP 06-01.

Recommend **(a)** for ROADMAP fidelity, with `paymentStatus` derived from `Σ payments` rather than stored independently — a stored total that can disagree with the payment rows is the classic billing bug.

Transitions (everything else throws):
```
DRAFT           → FINALIZED (stock validation passes, number assigned) | deleted
FINALIZED       → UNPAID (auto, immediately) | VOIDED
UNPAID          → PARTIALLY_PAID | PAID | OVERDUE | VOIDED
PARTIALLY_PAID  → PAID | OVERDUE | VOIDED
OVERDUE         → PARTIALLY_PAID | PAID | VOIDED
PAID            → (terminal; refunds/credit notes are separate records, they do NOT change status)
VOIDED          → (terminal)
```

`DRAFT → FINALIZED` is where invoice number assignment, GST freezing and stock deduction all happen — **one transaction, or none of it**.

### Pattern 3: Gap-free per-clinic monthly numbering (D-15, D-19)

**Do not use a PostgreSQL `SEQUENCE`.** Sequences do not roll back — a failed finalize burns a number, producing gaps that a GST auditor will question under Rule 46(b)'s "consecutive serial number".

```sql
CREATE TABLE invoice_number_counters (
  clinic_id   uuid    NOT NULL,
  doc_type    text    NOT NULL,        -- 'INV' | 'CN'
  period      char(6) NOT NULL,        -- 'YYYYMM'
  last_number integer NOT NULL DEFAULT 0,
  PRIMARY KEY (clinic_id, doc_type, period)
);
```

Inside the finalize transaction:
```sql
INSERT INTO invoice_number_counters (clinic_id, doc_type, period, last_number)
VALUES ($1, $2, $3, 1)
ON CONFLICT (clinic_id, doc_type, period)
DO UPDATE SET last_number = invoice_number_counters.last_number + 1
RETURNING last_number;
```
The `ON CONFLICT DO UPDATE` takes a row lock, serializing concurrent finalizes for the same clinic-month, and **rolls back with the transaction** — no gaps.

An advisory lock (`pg_advisory_xact_lock(hashtext(clinic_id || period))`) also works but is strictly weaker here: it serializes without providing the counter, so you still need the row. Prefer the upsert. Note that `hashtext` collisions across clinics would cause unnecessary cross-tenant serialization.

Format: `INV-` + period + `-` + `String(n).padStart(4,'0')` → `INV-202605-0001` (15 chars ✓ ≤ 16, Rule 46(b)).

**RLS interaction:** `invoice_number_counters` must have an RLS policy on `clinic_id`, and the upsert must run under the tenant client — otherwise a bug in one clinic's finalize can increment another's counter.

### Pattern 4: Finalize-with-stock-validation, single transaction (BIL-02)

```
BEGIN
  SELECT … FROM invoices WHERE id = ? AND status = 'DRAFT' FOR UPDATE
  For each PRODUCT line:
    SELECT … FROM stock_batches
      WHERE inventory_item_id = ? AND quantity_remaining > 0 AND expiry_date > now()
      ORDER BY expiry_date ASC            -- Phase 5 FIFO (D-22)
      FOR UPDATE                          -- ← the row lock is what makes BIL-02 real
    If Σ available < requested → ROLLBACK, return 409 with per-item shortfall
  Deduct from batches, insert stock_movements
  Assign invoice number (Pattern 3)
  Freeze GST: write gstRatePercent + tax paise onto each line
  UPDATE invoices SET status = 'FINALIZED', finalized_at = now(), … 
COMMIT
```

**The "real-time" in BIL-02 means the check and the write are in the same transaction with row locks held.** A read-only pre-check for UI feedback is fine and desirable (the `StockValidationBanner` in the UI-SPEC), but it is **not** BIL-02 — it is a UX nicety. The authoritative validation is inside the finalize transaction. Two front-desk devices finalizing invoices for the last box of a drug at the same moment is exactly the case that separates a correct implementation from a demo.

**Note:** the mobile draft may have been assembled minutes earlier. Expect and handle the 409 gracefully — the UI-SPEC already specifies the copy: `"[Item Name] has insufficient stock ([available] available, [requested] requested)"`.

### Pattern 5: Webhook fast-ack + async processing (BIL-06)

```
POST /api/v1/webhooks/razorpay/:webhookToken
  ├─ raw body parser (route-scoped)
  ├─ resolve clinic from :webhookToken → decrypt webhookSecret
  ├─ HMAC-SHA256(rawBody, secret) vs x-razorpay-signature, timingSafeEqual
  │    mismatch → 400, log security event, DO NOT reveal reason
  ├─ INSERT INTO webhook_events (event_id, clinic_id, event_type, raw_payload)
  │    ON CONFLICT (event_id) DO NOTHING        -- idempotency (x-razorpay-event-id)
  │    0 rows affected → duplicate → return 200 immediately
  ├─ enqueue BullMQ job { webhookEventId }
  └─ return 200                                  -- target < 500ms, hard budget 5s
```
Worker: load event → apply payment / mark expired / mark cancelled → recompute invoice status → `io.to(clinicRoom).emit('invoice:updated', …)` → mark event processed. On worker failure, BullMQ retries; the DB row is the durable record, so no Razorpay retry is needed.

**Fastify wiring requirements for this route:**
- Register **outside** the `authenticate` / `tenantContext` preHandler chain
- **Exempt from rate limiting.** The app registers a global `@fastify/rate-limit` at 200/min (`app.ts`). Razorpay retry storms will exceed this and get 429s → Razorpay treats 429 as failure → 24h backoff → webhook disabled
- Use the **base** Prisma client (`getBasePrisma()`), not `createTenantClient` — there is no JWT to derive the tenant from; the clinic comes from the webhook token

### Pattern 6: Dashboard aggregates (D-24 + RPT-01)

One query, not five, and not a full invoice fetch aggregated in JS:

```sql
SELECT
  COALESCE(SUM(p.amount_paise) FILTER (WHERE p.paid_at::date = CURRENT_DATE), 0) AS today_revenue,
  COALESCE(SUM(i.balance_paise) FILTER (WHERE i.status IN ('UNPAID','PARTIALLY_PAID','OVERDUE')), 0) AS outstanding,
  COUNT(DISTINCT i.id) FILTER (WHERE i.status = 'OVERDUE') AS overdue_count,
  COUNT(p.id) FILTER (WHERE p.paid_at::date = CURRENT_DATE) AS payments_today
FROM invoices i LEFT JOIN payments p ON p.invoice_id = i.id
WHERE i.clinic_id = current_setting('app.clinic_id')::uuid;
```
RPT-01's **patients-seen-today** is a separate, cheap query against Phase 4 data and belongs in the same dashboard endpoint:
```sql
SELECT COUNT(DISTINCT pet_id) FROM consultations
WHERE clinic_id = current_setting('app.clinic_id')::uuid
  AND status = 'finalized'
  AND (finalized_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date;
```

**Timezone:** "today" must be IST, not UTC. UTC midnight is 05:30 IST, so a UTC-based "today" silently drops every morning consultation from the day's count. The codebase already has `QueueRepository.getTodayIST()` — reuse it rather than reinventing.

Index requirements: `(clinic_id, status)`, `(clinic_id, created_at DESC)`, `(clinic_id, due_date) WHERE status IN (…)`, `payments (invoice_id, paid_at)`, `consultations (clinic_id, status, finalized_at)`.

### Anti-Patterns to Avoid

- **Computing money on the client and trusting it.** The invoice builder shows a live total; the server must recompute from line items on finalize and ignore any client-supplied total. Otherwise a modified client sets `grandTotal: 1`.
- **Storing `grandTotal` without storing the inputs.** Persist `subtotal`, per-line taxable value, each tax head, discount, `roundOff` and `grandTotal`. An invoice you cannot re-derive is an invoice you cannot defend in an audit.
- **Recomputing historical invoices from current settings.** GST rate, clinic GSTIN and item prices all change. Freeze every rate and price onto the invoice at finalize. `D-17`'s "Rate editable per invoice: No — change in settings applies to new invoices only" is correct and must be enforced by freezing, not by convention.
- **Floating point for money.** `0.1 + 0.2 !== 0.3`. Integer paise only.
- **Deriving payment status from a stored column that payments don't update transactionally.** Derive from `Σ payments − Σ refunds` inside the same transaction that inserts the payment.
- **Deleting or editing finalized invoices** (D-21). Void + reissue, or credit note. Enforce at the DB level with a trigger or a repository guard, not just in the service layer.
- **Treating a Razorpay API 200 as "money received."** Only the webhook (or an explicit `paymentLink.fetch` reconciliation) confirms payment.
- **A single `GST @ X%` line on an invoice that includes exempt consultations.** See Finding G1.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Webhook signature verification | Custom HMAC comparison | `Razorpay.validateWebhookSignature` (then harden with `timingSafeEqual`) | Body encoding and header naming are easy to get subtly wrong; the SDK matches Razorpay's exact serialization contract |
| Payment link lifecycle | Custom UPI deep links / your own hosted pay page | Razorpay Payment Links API | PCI scope, UPI app compatibility matrix, retry semantics, settlement reconciliation |
| Refund processing | Manual reversal bookkeeping only | `razorpay.payments.refund` + `refund.processed` webhook | Refund settlement is asynchronous and can fail; the gateway is the source of truth |
| Concurrent stock deduction | `SELECT` then `UPDATE` in application code | Single transaction with `SELECT … FOR UPDATE` | TOCTOU race sells stock you don't have. See Pitfall 4 |
| Gap-free sequence numbers | In-memory counter, `MAX(number)+1`, or a `SEQUENCE` | Counter table + `ON CONFLICT DO UPDATE … RETURNING` inside the txn | `MAX+1` races; sequences leave audit gaps |
| Money arithmetic | `number` rupees with decimals, or ad-hoc `toFixed(2)` | Integer paise end-to-end (matches shipped `ServiceCatalog.price: Int`) | IEEE-754 cannot represent 0.1 exactly; rupee floats drift by paise across thousands of invoices |
| QR image generation | Server-side PNG rendering + S3 upload | `react-native-qrcode-svg` on `short_url` | Zero storage, zero server CPU, instant, works from cached link data |
| IST date boundaries | `new Date().toISOString().slice(0,10)` | Existing `QueueRepository.getTodayIST()` | UTC midnight = 05:30 IST; a naive implementation drops the morning from "today" |
| Idempotency for retried webhooks | "Check if already processed" in application logic | `UNIQUE` index on `event_id` + `ON CONFLICT DO NOTHING` | Application-level checks race under concurrent duplicate delivery |
| PDF layout engine | Manual PDF byte construction | `expo-print` HTML → PDF (existing Phase 4 templates) | Already built, already working, supports native print |

**Where hand-rolling IS correct: the GST calculation itself.**

There is no npm package that correctly and currently models Indian GST for this use case. Every candidate is either an abandoned rate-lookup table (stale after GST 2.0's 22 Sept 2025 slab change), a GSTN/e-invoicing API wrapper (irrelevant below the ₹5 crore threshold), or a general sales-tax library with no concept of exempt supplies, place of supply, or CGST/SGST splitting.

Write `gst.service.ts` as **pure functions with no I/O**: `(lines, clinicGstConfig, placeOfSupply) → taxBreakdown`. This is ~120 lines, is exhaustively unit-testable without a database, and is auditable — all three of which matter more here than reusing someone else's abandoned package. Keep the slab list in `packages/types/src/constants/gst.ts` so a Council notification is a one-line change.

---

## Common Pitfalls

### Pitfall 1: Fastify's JSON parser destroys the webhook signature
**What goes wrong:** `payment_link.paid` webhooks always fail verification. BIL-06 never works. In staging with test keys this is often missed because developers manually mark invoices paid.
**Why:** Fastify parses `application/json` into an object before the handler. `JSON.stringify(request.body)` re-serializes with different key order/whitespace/unicode escaping than Razorpay's original bytes → different HMAC.
**How to avoid:** Route-scoped raw content-type parser (see Code Examples). Never register it globally — it would break every other JSON endpoint.
**Warning signs:** Signature mismatch on 100% of webhooks; verification "works" locally with a hand-crafted curl payload but fails against real Razorpay traffic.

### Pitfall 2: Global rate limit throttles Razorpay into disabling the webhook
**What goes wrong:** After a burst (or a Razorpay retry storm), the webhook route returns 429. Razorpay counts non-2xx as failure, backs off, and **disables the webhook after 24h of failures** — silently and permanently breaking BIL-06 for that clinic.
**Why:** `app.ts` registers `@fastify/rate-limit` globally at 200/min.
**How to avoid:** `config: { rateLimit: false }` on the webhook route. Protect it instead with the unguessable path token + signature verification, which is stronger than IP rate limiting anyway.
**Warning signs:** Payments confirm for a while, then stop for one clinic; Razorpay dashboard shows the webhook as disabled.

### Pitfall 3: `createTenantClient` leaks a PrismaClient per request, and its RLS may be a no-op
**What goes wrong:** Two distinct failures from one function (`apps/api/src/lib/prisma-rls.ts`).

*(a) Connection exhaustion.* `tenantContext` calls `createTenantClient(clinicId)` on **every request**, and `createTenantClient` does `new PrismaClient({ … })`. Each instance opens its own pool and is **never disconnected**. Under Phase 6's added traffic (billing UI polling + webhook bursts + dashboard aggregates) this exhausts PostgreSQL `max_connections` and takes the whole API down — including auth.

*(b) RLS possibly not enforced.* The extension runs `$executeRawUnsafe("SET LOCAL app.clinic_id = …")` and then `query(args)` as **two separate operations**. `SET LOCAL` is scoped to the current transaction; outside an explicit transaction it applies only to the implicit single-statement transaction and is discarded. There is no guarantee the subsequent query runs on the same pooled connection with the setting still live. If `current_setting('app.clinic_id', true)` returns NULL, the RLS policies (`clinic_id = current_setting(...)::uuid`) evaluate to NULL → **no rows match** (fails closed, so tests pass) or, on tables with no policy at all, **every row matches** (fails open). Only 3 of 24 tables have policies (`clinic_members`, `auth_audit_log`, `notifications`) — so `pets`, `consultations` and `service_catalog` have **no tenant isolation at the database layer today**.

*(c) SQL injection surface.* `clinicId` is interpolated into `$executeRawUnsafe` via template string. It currently comes from a signed JWT so it is not attacker-controlled, but this is one refactor away from being a vulnerability on the money path.

**How to avoid:** Wave 0 remediation before any billing table is added:
- One shared `PrismaClient` created at plugin scope; wrap per-request work in `prisma.$transaction(async tx => { await tx.$executeRaw\`SELECT set_config('app.clinic_id', ${clinicId}, true)\`; … })` so the setting and the queries are provably on the same connection in the same transaction
- Use `$executeRaw` (parameterized) not `$executeRawUnsafe`
- Add RLS policies + `FORCE ROW LEVEL SECURITY` for all Phase 3/4/5 tables and all 8 new billing tables
- Add a cross-tenant integration test that asserts Clinic A cannot read Clinic B's invoices (extend `apps/api/tests/tenant-isolation.test.ts`), and make it **fail** if run against the current implementation

**Warning signs:** `FATAL: sorry, too many clients already` under load; `tenant-isolation.test.ts` passing for the wrong reason (fails-closed NULL rather than a real policy match).

### Pitfall 4: Stock validated outside the finalize transaction (TOCTOU)
**What goes wrong:** BIL-02 "passes" in testing but oversells in production. Two front-desk devices both see 5 units available, both finalize invoices for 3 units, stock goes to −1.
**Why:** Validating in a read query, then writing in a separate statement, leaves a window.
**How to avoid:** Pattern 4 — `SELECT … FOR UPDATE` on batch rows inside the same transaction as the deduction and the status change.
**Warning signs:** Negative `quantity_remaining`; stock movements that don't reconcile with invoice line quantities.

### Pitfall 5: Invoice-level discount (D-07) breaks per-line GST
**What goes wrong:** A ₹100 invoice-level discount is applied to the total, but per-line taxable values still sum to the pre-discount amount. `Σ line.taxableValue ≠ invoice.taxableValue`, tax is overstated, and the invoice fails GSTR-1 reconciliation.
**Why:** Under GST, a discount known at the time of supply reduces the **taxable value** (Section 15(3)(a)), so it must be allocated to lines *before* tax is computed — not subtracted from the grand total afterwards.
**How to avoid:** Pro-rate the invoice-level discount across taxable lines by value, apply it to `lineTaxable`, *then* compute tax. Assign any rounding remainder from the pro-rata split to the largest line so the allocation sums exactly. **Exempt lines must be excluded from the tax computation but still receive their share of the discount** (the owner expects the discount they were promised).
**Warning signs:** `Σ line.taxableValue ≠ invoice.taxableValue`; grand total off by 1–2 paise; discount percentages that don't reproduce.

### Pitfall 6: `expire_by = now + 15min` is rejected by Razorpay
**What goes wrong:** Intermittent HTTP 400 from `paymentLink.create`, only in production, only under latency.
**Why:** Razorpay requires `expire_by` **≥ 15 minutes** in the future; network latency and clock skew push a `now + 900s` value below the threshold by the time it is evaluated server-side.
**How to avoid:** `expire_by = now + 16*60`. Keep the 15:00 user-facing countdown (D-11) and expire server-side at 15:00 independently.
**Warning signs:** `BAD_REQUEST_ERROR: expire_by should be at least 15 minutes from now`, reproducible only on slow networks.

### Pitfall 7: Client-side countdown is the only expiry mechanism
**What goes wrong:** Front desk opens the payment sheet, then backgrounds the app / the phone dies / they navigate away. The invoice stays `pending` forever. D-11 ("Pending payments timeout after 15 minutes and revert to unpaid") is never satisfied.
**How to avoid:** A server-side `node-cron` sweep (every minute) that finds `PaymentAttempt WHERE status='pending' AND expires_at < now()`, calls `paymentLink.cancel()`, and reverts the invoice to `UNPAID`. The client countdown is display only.

### Pitfall 8: `npx expo install` skipped for native modules
**What goes wrong:** `pnpm add expo-print` installs `57.x` against an Expo SDK 52 app. The JS resolves, TypeScript compiles, and the native build fails or the module is undefined at runtime.
**Why:** Expo uses unified versioning — `expo-print@57.x` targets SDK 57; SDK 52 needs the `14.0.x` line.
**How to avoid:** `npx expo install` for every native module. Add a CI check running `npx expo install --check`.
**Warning signs:** `Cannot read property 'printToFileAsync' of null`; EAS build failures referencing mismatched native versions.

### Pitfall 9: `expo-print` / `expo-sharing` are imported but not installed
**What goes wrong:** Phase 4's PDF feature (`useGeneratePdf.ts`) imports both, but neither appears in `apps/mobile/package.json` **or** `pnpm-lock.yaml` (verified: `grep -c expo-print pnpm-lock.yaml` → `0`). Phase 6 adds three more PDF templates on top of a feature that cannot currently run.
**How to avoid:** Wave 0 task: `npx expo install expo-print expo-sharing expo-file-system` and add a smoke test that renders one template.
**Warning signs:** Metro "Unable to resolve module expo-print"; PDF buttons throwing on tap.

### Pitfall 10: `react-native-paper` unavailable to the mobile app
**What goes wrong:** `06-UI-SPEC.md` specifies 40+ components built on Paper v5 MD3. `react-native-paper` is declared only in `packages/ui/package.json`. `STATE.md` line 72 records Phase 4 already hitting this: *"Used plain React Native components for consultation screen (react-native-paper not in mobile dependencies)"*. Phase 6 will repeat the fallback across the entire billing surface, producing a visually inconsistent app.
**How to avoid:** Wave 0 — either add `react-native-paper` + `@gorhom/bottom-sheet` + `react-native-reanimated` + `react-native-gesture-handler` to `apps/mobile/package.json`, or confirm `@breeyo/ui` re-exports every needed component and Phase 6 consumes only `@breeyo/ui`. Decide this **before** 06-03 is planned, not during.

### Pitfall 11: Phase 3/4 tables have no migrations
**What goes wrong:** `apps/api/prisma/migrations/` contains exactly two migrations creating 13 tables (`users`, `clinics`, `clinic_members`, `roles`, `permissions`, `role_permissions`, `clinic_member_roles`, `user_permission_overrides`, `refresh_tokens`, `auth_audit_log`, `notifications`, `device_tokens`, `consent_records`). Everything from Phase 3 and 4 — `pets`, `pet_owners`, `queue_entries`, `consultations`, `prescriptions`, `service_catalog`, `vitals`, `drugs`, and 8 more — exists in `schema.prisma` with **no corresponding migration**. `pnpm db:migrate` (`prisma migrate deploy`) will not create them; the team must be using `db push` locally.
**Why it matters for Phase 6:** ROADMAP plan 06-01 calls for "Prisma schema (8 billing models with RLS + indexes)". Prisma's `migrate dev` will detect drift and offer to reset the database — on a dev machine holding Phase 4 test data, that is data loss. RLS policies also live in `post-migrate.sql` which is only run after `migrate deploy`.
**How to avoid:** Wave 0 — generate a squashed baseline migration covering the current `schema.prisma`, extend `post-migrate.sql` with policies for all tenant tables, and verify `prisma migrate deploy` reproduces the schema from scratch in CI.

### Pitfall 12: Charging GST when the clinic isn't registered
**What goes wrong:** The billing settings GST Rate field defaults/placeholders to "18". A clinic below the ₹20 lakh threshold with no GSTIN prints "GST @ 18%: ₹216" and collects tax it has no authority to collect — Section 122 offence, penalty up to ₹25,000 or 100% of the tax.
**How to avoid:** `gstEnabled` derived from GSTIN presence; GST rate field disabled and tax lines omitted entirely when disabled; validate GSTIN format (15 chars, `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$`) before enabling.
**Warning signs:** Any invoice with a GST line and a blank GSTIN in the header.

---

## Code Examples

### Webhook raw body — route-scoped parser (Fastify 5)

```ts
// apps/api/src/modules/billing/webhook.routes.ts
// Pattern source: Fastify addContentTypeParser docs + Razorpay raw-body requirement
//   https://razorpay.com/docs/webhooks/validate-test/
import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';

export default async function webhookRoutes(fastify: FastifyInstance) {
  // Scoped to this plugin instance only — does NOT affect other routes' JSON parsing.
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (_req, body, done) => done(null, body), // hand the raw Buffer to the handler
  );

  fastify.post<{ Params: { webhookToken: string } }>(
    '/webhooks/razorpay/:webhookToken',
    {
      config: { rateLimit: false }, // Pitfall 2: Razorpay retries must not be 429'd
      // NO authenticate, NO tenantContext — Razorpay has no JWT
    },
    async (request, reply) => {
      const raw = request.body as Buffer;
      const signature = request.headers['x-razorpay-signature'] as string | undefined;
      const eventId = request.headers['x-razorpay-event-id'] as string | undefined;
      if (!signature || !eventId) return reply.status(400).send();

      const clinic = await resolveClinicByWebhookToken(request.params.webhookToken);
      if (!clinic) return reply.status(404).send();

      const secret = decryptSecret(clinic.razorpayWebhookSecretEnc);
      const expected = crypto.createHmac('sha256', secret).update(raw).digest();
      const received = Buffer.from(signature, 'hex');

      // Timing-safe: the SDK's built-in helper uses a plain === comparison.
      if (
        expected.length !== received.length ||
        !crypto.timingSafeEqual(expected, received)
      ) {
        request.log.warn({ clinicId: clinic.id }, 'razorpay webhook signature mismatch');
        return reply.status(400).send(); // do not reveal why
      }

      // Idempotency (Razorpay explicitly documents duplicate delivery).
      const inserted = await persistWebhookEventIfNew({
        eventId, clinicId: clinic.id, rawPayload: raw.toString('utf8'),
      });

      if (inserted) await enqueueWebhookJob(inserted.id);

      return reply.status(200).send({ received: true }); // < 5s budget
    },
  );
}
```

### GST calculation — pure, per-line, exempt-aware (Path B)

```ts
// apps/api/src/modules/billing/gst.service.ts
// All amounts are integer PAISE. No floats anywhere.
// Rounding per CGST Act s.170 + Rule 51: nearest rupee, per tax head, at invoice level.

export type TaxTreatment = 'exempt' | 'taxable' | 'nil_rated';

export interface TaxableLine {
  lineId: string;
  taxableValuePaise: number;   // after line discount AND pro-rata invoice discount
  gstRatePercent: number;      // 0 | 5 | 18 | 40  (GST 2.0 slabs, eff. 2025-09-22)
  taxTreatment: TaxTreatment;
  hsnSacCode: string | null;
}

const roundToNearestRupeePaise = (paise: number): number =>
  Math.round(paise / 100) * 100; // Math.round is half-up for positives, matching s.170

export function computeInvoiceTax(
  lines: TaxableLine[],
  opts: { gstEnabled: boolean; isInterState: boolean },
) {
  if (!opts.gstEnabled) {
    return {
      lines: lines.map((l) => ({
        lineId: l.lineId, cgstPaise: 0, sgstPaise: 0, igstPaise: 0,
      })),
      cgstPaise: 0, sgstPaise: 0, igstPaise: 0, roundOffPaise: 0,
      documentType: 'invoice' as const,
    };
  }

  const perLine = lines.map((l) => {
    if (l.taxTreatment !== 'taxable' || l.gstRatePercent === 0) {
      return { lineId: l.lineId, cgstPaise: 0, sgstPaise: 0, igstPaise: 0 };
    }
    // Exact paise, no intermediate rounding.
    const total = Math.round((l.taxableValuePaise * l.gstRatePercent) / 100);
    if (opts.isInterState) {
      return { lineId: l.lineId, cgstPaise: 0, sgstPaise: 0, igstPaise: total };
    }
    const half = Math.floor(total / 2);
    // Odd paise goes to CGST by convention; the two heads must sum to `total`.
    return { lineId: l.lineId, cgstPaise: total - half, sgstPaise: half, igstPaise: 0 };
  });

  const sum = (k: 'cgstPaise' | 'sgstPaise' | 'igstPaise') =>
    perLine.reduce((a, l) => a + l[k], 0);

  const cgstExact = sum('cgstPaise');
  const sgstExact = sum('sgstPaise');
  const igstExact = sum('igstPaise');

  const cgstPaise = roundToNearestRupeePaise(cgstExact);
  const sgstPaise = roundToNearestRupeePaise(sgstExact);
  const igstPaise = roundToNearestRupeePaise(igstExact);

  const roundOffPaise =
    (cgstPaise - cgstExact) + (sgstPaise - sgstExact) + (igstPaise - igstExact);

  const hasTaxable = lines.some((l) => l.taxTreatment === 'taxable');
  const hasExempt  = lines.some((l) => l.taxTreatment !== 'taxable');

  const documentType =
    hasTaxable && hasExempt ? 'invoice_cum_bill_of_supply' as const  // CGST Rule 46A
    : hasTaxable            ? 'tax_invoice' as const
    :                         'bill_of_supply' as const;

  return { lines: perLine, cgstPaise, sgstPaise, igstPaise, roundOffPaise, documentType };
}
```

### Gap-free invoice numbering inside the finalize transaction

```ts
// apps/api/src/modules/billing/numbering.service.ts
// ON CONFLICT DO UPDATE takes a row lock → serializes concurrent finalizes for the
// same (clinic, docType, period) AND rolls back with the transaction → no gaps.
// A PostgreSQL SEQUENCE would NOT roll back, leaving audit gaps under Rule 46(b).

export async function nextDocumentNumber(
  tx: Prisma.TransactionClient,
  clinicId: string,
  docType: 'INV' | 'CN',
  now: Date,
): Promise<string> {
  const period = formatISTPeriod(now); // 'YYYYMM' in Asia/Kolkata, NOT UTC

  const [{ last_number }] = await tx.$queryRaw<{ last_number: number }[]>`
    INSERT INTO invoice_number_counters (clinic_id, doc_type, period, last_number)
    VALUES (${clinicId}::uuid, ${docType}, ${period}, 1)
    ON CONFLICT (clinic_id, doc_type, period)
      DO UPDATE SET last_number = invoice_number_counters.last_number + 1
    RETURNING last_number
  `;

  // 'INV-202605-0001' = 15 chars, within Rule 46(b)'s 16-char limit.
  return `${docType}-${period}-${String(last_number).padStart(4, '0')}`;
}
```

### Razorpay payment link creation (per-clinic credentials)

```ts
// apps/api/src/modules/billing/payment.service.ts
// Params verified against https://razorpay.com/docs/api/payments/payment-links/create-standard/
import Razorpay from 'razorpay';

const EXPIRY_BUFFER_SECONDS = 16 * 60; // Razorpay requires >= 15 min; 16 avoids the boundary

export async function createPaymentLink(clinic: ClinicBillingConfig, invoice: Invoice, owner: PetOwner) {
  const rzp = new Razorpay({
    key_id: clinic.razorpayKeyId,
    key_secret: decryptSecret(clinic.razorpayKeySecretEnc), // never leaves the server
  });

  const link = await rzp.paymentLink.create({
    amount: invoice.balancePaise,            // integer paise, min 100
    currency: 'INR',
    accept_partial: false,                    // true only for the digital leg of a split (D-10)
    description: `Invoice ${invoice.number} — ${invoice.petName}`.slice(0, 2048),
    reference_id: invoice.id,                 // UUID = 36 chars, under the 40-char cap
    customer: { name: owner.fullName, contact: owner.mobile },
    notify: { sms: false, email: false },     // WhatsApp delivery lands in Phase 7
    expire_by: Math.floor(Date.now() / 1000) + EXPIRY_BUFFER_SECONDS,
    notes: { clinicId: clinic.id, invoiceId: invoice.id }, // webhook cross-check
  });

  // Return ONLY short_url to the client. It renders the QR locally.
  return { paymentLinkId: link.id, shortUrl: link.short_url, expiresAt: link.expire_by };
}
```

### QR rendering on device

```tsx
// apps/mobile/src/features/billing/components/QRCodeDisplay.tsx
// Renders the Payment Link short_url. No image is fetched or stored anywhere.
import QRCode from 'react-native-qrcode-svg';

export function QRCodeDisplay({ shortUrl }: { shortUrl: string }) {
  return <QRCode value={shortUrl} size={200} backgroundColor="#FFFBF5" />; // UI-SPEC: 200x200
}
```

---

## Runtime State Inventory

Not applicable — Phase 6 is greenfield feature work, not a rename/refactor/migration. No existing runtime state carries strings or identifiers that this phase changes.

*(The Wave 0 remediation items identified in Pitfall 3 and Pitfall 11 do touch existing database structure. Those are tracked in `## Environment Availability` and the pitfalls, not here.)*

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL 16 | All billing persistence, RLS, advisory locks | ✓ (project standard) | 16 | — |
| Redis 7 | BullMQ webhook queue, rate limiting | ✓ (`ioredis` + `redis.ts` plugin installed) | 7 | — |
| `razorpay` npm | BIL-05, BIL-06, D-12 | ✗ not installed | 2.9.8 available | none — blocking |
| Razorpay **test** account + API keys | Any BIL-05/06 development | ✗ unknown | — | none — blocking; each dev needs test keys |
| Razorpay **live** account per clinic | Production Beta (D-29) | ✗ not provisioned | — | none — 20 pilot clinics each need their own account + KYC. **Long lead time, start now** |
| Publicly reachable webhook URL | BIL-06 local development | ✗ | — | ngrok / Cloudflare Tunnel for dev; a real HTTPS endpoint for staging |
| Razorpay QR Codes API | Alternative QR approach | ✗ activation-gated | — | ✓ render QR from `short_url` client-side |
| `upi_link: true` on Payment Links | UPI-intent links | ✗ live mode only | — | ✓ standard payment link + client QR |
| `expo-print` | BIL-04 (all 3 PDF templates) | ✗ **imported by Phase 4 code but not installed** | resolve via `npx expo install` | none — blocking |
| `expo-sharing` | D-16 share/WhatsApp | ✗ same | resolve via `npx expo install` | none — blocking |
| `expo-file-system` | PDF filename handling | ⚠️ in lockfile transitively, not declared | 18.0.12 | declare explicitly |
| `react-native-qrcode-svg` + `react-native-svg` | D-09 QR display | ✗ not installed | 6.3.21 / 15.8.0 (SDK 52) | none |
| `react-native-paper` in mobile app | 40+ UI-SPEC components | ✗ only in `packages/ui` | 5.15.3 | ⚠️ plain RN fallback (Phase 4 precedent) — degrades design consistency |
| Prisma migrations for Phase 3/4 tables | Adding 8 billing models | ✗ **absent** (only 2 migrations exist, covering 13 of 24 tables) | — | none — must baseline in Wave 0 |
| RLS policies for Phase 3/4/5 tables | PLT-04 tenant isolation on billing data | ✗ only 3 tables have policies | — | none — must extend `post-migrate.sql` |
| `node-cron`, `bullmq`, `socket.io`, `zod` | Overdue job, async webhooks, live updates, validation | ✓ installed | 4.6.0 / 5.30.0 / 4.8.3 / 3.24.0 | — |
| Phase 5 inventory module | BIL-01 product lines, BIL-02 stock validation, D-04 Quick Sale, D-26 stock restoration | ✗ **not implemented** (`apps/api/src/modules/` has no `inventory`) | — | **none — Phase 6 is hard-blocked on Phase 5** |

**Missing dependencies with no fallback (blocking):**
- Phase 5 inventory module — BIL-01, BIL-02, D-04, D-26 all depend on it
- `razorpay` package + Razorpay test credentials
- `expo-print` / `expo-sharing` / QR packages
- Prisma migration baseline for Phases 3–4
- RLS policies for all tenant-scoped tables

**Missing dependencies with fallback:**
- Razorpay QR Codes API → client-rendered QR of `short_url` (recommended anyway)
- `upi_link: true` → standard payment link
- `react-native-paper` in mobile → plain RN components (degraded; resolve in Wave 0 instead)

**Long-lead-time item flagged for the user:** 20 pilot clinics each need their own Razorpay account with completed KYC (D-29) plus a webhook configured in their own dashboard. This is external, involves third-party turnaround, and is not something the build can unblock. It should start in parallel with Phase 6 development, not after.

---

## Project Constraints (from CLAUDE.md)

| Directive | Phase 6 application |
|-----------|--------------------|
| Module structure `modules/<name>/` with `controller.ts`, `service.ts`, `routes.ts`, `schema.ts` | `apps/api/src/modules/billing/` follows this; `service-catalog-seed.ts` already lives there |
| Routes via `app.register()` with `/api/v1` prefix | `/api/v1/billing/*`. **Webhook is the documented exception** — no JWT, no tenant context, no rate limit |
| `authenticate` + `authorize` middleware on all endpoints | All billing endpoints except the webhook. Use existing `requirePermission('CREATE_INVOICES')` etc. |
| RLS enforced at DB level via `prisma-rls.ts` — always set tenant context | ⚠️ See Pitfall 3 — the current implementation needs remediation before billing tables are added |
| Centralized `error-handler.ts` | Billing errors (insufficient stock, invalid transition, Razorpay failure) route through it with stable error codes |
| Rate limiting 200/min global, 20/min auth | Webhook route must set `rateLimit: false` |
| Prisma columns `snake_case` with `@map()`, TS `camelCase` | All 8 billing models |
| UUIDs from PostgreSQL `gen_random_uuid()` | `@default(dbgenerated("gen_random_uuid()")) @db.Uuid` |
| Audit logging via `audit-log.ts` | Extend `AuditEvent` enum: `INVOICE_FINALIZED`, `INVOICE_VOIDED`, `PAYMENT_RECORDED`, `REFUND_PROCESSED`, `CREDIT_NOTE_ISSUED`, `RAZORPAY_CREDENTIALS_UPDATED`. Note the table is `auth_audit_log` — decide whether to reuse it or add a domain audit table |
| Mobile: Expo Router, `expo-secure-store`, `@breeyo/validators` for forms | Billing screens under `app/(tabs)/billing/` |
| UI: atomic design, tokens in `packages/ui/src/theme/` | Per `06-UI-SPEC.md`; no new tokens introduced |
| TypeScript strict mode, ESM (`"type": "module"` in API) | `razorpay` is CJS (`module.exports = Razorpay`); `esModuleInterop: true` is set in `packages/config/tsconfig/base.json`, so `import Razorpay from 'razorpay'` works under `NodeNext` |
| Zod for all request/response validation | Extend `packages/validators/src/billing.ts` |
| Commits: `feat|fix|chore|docs(phase-NN): description`; branch `breeyo/phase-NN-description` | `breeyo/phase-06-invoicing-payments` |
| Vitest; API tests use `supertest` with `buildApp({ logger: false })`; Faker for data | Follow `apps/api/tests/` and `src/modules/*/__tests__/` patterns |
| Never commit `.env` | Razorpay keys via env + encrypted DB column, never in source |

**From `.claude/skills/breeyo-build/SKILL.md` (project skill):** builds run under a strict TDD iron law — *"Writes failing test FIRST, then minimal implementation to pass. If code is written before a test: DELETE IT and restart."* Every Phase 6 task must be authored test-first, must reference the `D-XX` decision it implements, and must reference its `REQ-ID`. Plans should be sized to 2–5 minute tasks. This makes the pure-function design of `gst.service.ts` especially valuable — it is trivially testable RED-first.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| GST slabs 0 / 5 / 12 / 18 / 28 | GST 2.0: **5 / 18 / 40** (+ nil/exempt) | 22 Sept 2025 (56th GST Council) | `05-08-PLAN.md`'s rate picker validating `0, 5, 12, 18, 28` is stale. Most medicines moved 12% → 5% |
| Razorpay Checkout SDK embedded in app | Payment Links + hosted page + webhooks | ongoing industry shift | Removes PCI scope from the app; enables remote collection. D-09 already reflects this |
| e-invoicing threshold ₹10 crore | **₹5 crore AATO from 1 April 2026** (Notification 17/2025-CT) | Apr 2026 | Still far above pilot clinics. Do **not** build IRP/IRN integration |
| Manual per-line rounding | Invoice-level rounding per tax head (s.170 + Rule 51) | long-standing, commonly implemented wrong | Per-line rounding accumulates error and breaks GSTR-1 reconciliation |
| Expo modules versioned independently | Expo unified versioning — module major tracks SDK major | SDK 52+ | `pnpm add expo-print` gets `57.x` for an SDK 52 app. `npx expo install` is mandatory |

**Deprecated / outdated:**
- **12% and 28% GST slabs** — superseded by GST 2.0. Do not seed them as selectable rates.
- **`06-UI-SPEC.md`'s "expo-print 55.0.13"** — no such version exists in any SDK-52-compatible line. Stale string; resolve via `npx expo install`.
- **`packages/shared/`** — empty orphan directory. All Phase 5 plan paths referencing it are wrong.
- **`razorpay-node` callback style** — the SDK still accepts callbacks; use the promise API exclusively.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 2.1 (`apps/api/vitest.config.ts`, `apps/mobile` + `packages/ui` each have their own) |
| Config file | `apps/api/vitest.config.ts` — `environment: 'node'`, `fileParallelism: false` (shared DB), 30s timeouts, `setupFiles: ['./tests/helpers/setup.ts']` |
| Test locations | Integration: `apps/api/tests/<module>/*.test.ts`. Unit: `apps/api/src/modules/<module>/__tests__/*.test.ts` |
| Helpers | `apps/api/tests/helpers/app.ts` (`buildApp({ logger: false })` + supertest), `factories.ts` (Faker), `setup.ts` (env) |
| Quick run command | `pnpm --filter @breeyo/api test -- src/modules/billing` |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BIL-01 | Draft invoice assembles dispensed products + catalog services | integration | `pnpm --filter @breeyo/api test -- tests/billing/invoice-create.test.ts` | ❌ Wave 0 |
| BIL-01 | End Consultation creates exactly one draft (idempotent on retry) | integration | `… tests/billing/invoice-create.test.ts -t "idempotent"` | ❌ Wave 0 |
| BIL-02 | Finalize rejects when stock insufficient, returns per-item shortfall | integration | `… tests/billing/finalize-stock.test.ts` | ❌ Wave 0 |
| BIL-02 | **Concurrent finalizes cannot oversell** (two txns, one batch) | integration | `… tests/billing/finalize-stock.test.ts -t "concurrent"` | ❌ Wave 0 |
| BIL-03 | State machine allows valid transitions, throws on invalid | unit | `… src/modules/billing/__tests__/invoice-state.test.ts` | ❌ Wave 0 |
| BIL-03 | Finalized invoice rejects edit (D-21) | integration | `… tests/billing/invoice-lock.test.ts` | ❌ Wave 0 |
| BIL-04 | Invoice HTML template renders all Rule 46 fields | unit (mobile) | `pnpm --filter @breeyo/mobile test -- src/features/pdf/__tests__/invoice-template.test.ts` | ❌ Wave 0 |
| BIL-05 | Payment link created with correct paise amount, `expire_by ≥ 15min`, `reference_id` ≤ 40 chars | unit (mocked SDK) | `… src/modules/billing/__tests__/payment.service.test.ts` | ❌ Wave 0 |
| BIL-06 | Valid signature → 200 + invoice marked paid | integration | `… tests/billing/webhook.test.ts` | ❌ Wave 0 |
| BIL-06 | **Invalid signature → 400, invoice unchanged** | integration | `… tests/billing/webhook.test.ts -t "invalid signature"` | ❌ Wave 0 |
| BIL-06 | **Duplicate `x-razorpay-event-id` processed exactly once** | integration | `… tests/billing/webhook.test.ts -t "idempotent"` | ❌ Wave 0 |
| BIL-06 | Webhook responds in < 5s under a 50-event burst | integration | `… tests/billing/webhook.test.ts -t "latency"` | ❌ Wave 0 |
| BIL-07 | Exempt service line produces zero tax; taxable product line produces CGST+SGST | unit | `… src/modules/billing/__tests__/gst.service.test.ts` | ❌ Wave 0 |
| BIL-07 | Inter-state invoice produces IGST only | unit | `… gst.service.test.ts -t "inter-state"` | ❌ Wave 0 |
| BIL-07 | `cgst + sgst === igst_equivalent` for the same base; each head rounds to whole rupees | unit | `… gst.service.test.ts -t "rounding"` | ❌ Wave 0 |
| BIL-07 | Mixed exempt+taxable → `documentType === 'invoice_cum_bill_of_supply'` | unit | `… gst.service.test.ts -t "document type"` | ❌ Wave 0 |
| BIL-07 | `gstEnabled: false` → no tax lines at all | unit | `… gst.service.test.ts -t "unregistered"` | ❌ Wave 0 |
| RPT-01 | Dashboard returns patients-seen-today using **IST** day boundary | integration | `… tests/billing/dashboard.test.ts` | ❌ Wave 0 |
| D-07 | Invoice-level discount pro-rates across lines; `Σ line.taxable === invoice.taxable` | unit | `… gst.service.test.ts -t "pro-rata"` | ❌ Wave 0 |
| D-15 | Numbering is gap-free under concurrency and rolls back with the txn | integration | `… tests/billing/numbering.test.ts` | ❌ Wave 0 |
| D-15 | Number ≤ 16 chars (Rule 46(b)) | unit | `… __tests__/numbering.test.ts` | ❌ Wave 0 |
| PLT-04 | **Clinic A cannot read Clinic B's invoices/payments** | integration | `pnpm --filter @breeyo/api test -- tests/tenant-isolation.test.ts` | ⚠️ exists, must be extended |

### Sampling Rate

- **Per task commit:** `pnpm --filter @breeyo/api test -- src/modules/billing` (unit only, fast)
- **Per wave merge:** `pnpm --filter @breeyo/api test` (includes DB integration; note `fileParallelism: false`)
- **Phase gate:** `pnpm test` green across all workspaces before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `apps/api/tests/billing/` directory — does not exist
- [ ] `apps/api/src/modules/billing/__tests__/gst.service.test.ts` — covers BIL-07, D-07, D-08/D-17
- [ ] `apps/api/src/modules/billing/__tests__/invoice-state.test.ts` — covers BIL-03, D-20, D-21
- [ ] `apps/api/src/modules/billing/__tests__/numbering.test.ts` — covers D-15, D-19
- [ ] `apps/api/src/modules/billing/__tests__/payment.service.test.ts` — covers BIL-05, D-10, D-11
- [ ] `apps/api/tests/billing/webhook.test.ts` — covers BIL-06 (signature, idempotency, latency)
- [ ] `apps/api/tests/billing/finalize-stock.test.ts` — covers BIL-02 including the concurrency case
- [ ] `apps/api/tests/billing/dashboard.test.ts` — covers D-24, RPT-01
- [ ] `apps/api/tests/helpers/factories.ts` — extend with invoice/payment/line-item factories
- [ ] `apps/api/tests/helpers/razorpay-mock.ts` — SDK mock + signed-webhook payload fixture builder
- [ ] Extend `apps/api/tests/tenant-isolation.test.ts` with billing tables (**and verify it fails against the current `createTenantClient` — see Pitfall 3**)
- [ ] `apps/mobile/src/features/pdf/__tests__/invoice-template.test.ts` — covers BIL-04, Rule 46 field coverage

No framework install needed — Vitest 2.1 is configured in every workspace.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Existing `authenticate` middleware (JWT). **Webhook route is deliberately unauthenticated** — compensating controls: unguessable path token + HMAC signature verification |
| V3 Session Management | yes (inherited) | Phase 1 refresh-token rotation; no Phase 6 changes |
| V4 Access Control | **yes — critical** | `requirePermission('CREATE_INVOICES' \| 'MANAGE_PAYMENTS' \| 'VIEW_INVOICES')`. Resolve D-05 vs. the Clinician seed (Contradiction 3). RLS as the second layer. Every invoice/payment/refund lookup must be tenant-scoped — an IDOR here exposes another clinic's revenue |
| V5 Input Validation | yes | Zod on every endpoint. Amounts: positive integers, sane upper bound. GSTIN format regex. Discount ≤ line total. Refund ≤ amount paid |
| V6 Cryptography | **yes — critical** | HMAC-SHA256 with `crypto.timingSafeEqual` for webhooks. AES-256-GCM for `razorpayKeySecret` / `razorpayWebhookSecret` at rest, key from env/KMS. **Never hand-roll** |
| V7 Error Handling & Logging | yes | Audit-log every finalize / void / payment / refund / credential change. **Never log raw webhook payloads containing card metadata, or decrypted secrets.** Signature-mismatch responses must not reveal the reason |
| V8 Data Protection | yes | Razorpay secrets encrypted at rest and never returned by any API. PDFs written to `FileSystem.cacheDirectory` contain owner PII — do not persist them to shared storage |
| V11 Business Logic | **yes — critical** | State machine enforced server-side; stock validated under row locks; totals recomputed server-side and never trusted from the client; refunds bounded by amount actually paid; finalized invoices immutable |
| V13 API & Web Service | yes | Webhook exempt from global rate limiting (Pitfall 2) but protected by token + signature. All other billing endpoints keep the 200/min limit |

### Known Threat Patterns for Fastify + Prisma + Razorpay

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged webhook marks an invoice paid | Spoofing | HMAC-SHA256 over the **raw** body with `timingSafeEqual`; reject on any mismatch |
| Webhook replay (captured legitimate payload resent) | Spoofing / Tampering | Idempotency via unique index on `x-razorpay-event-id`; reject events for already-`PAID` invoices as a no-op |
| Client submits a manipulated `grandTotal` | Tampering | Server recomputes all money from persisted line items on finalize; client totals are display-only |
| Cross-tenant invoice read (IDOR) | Information Disclosure | RLS with `FORCE ROW LEVEL SECURITY` **plus** explicit `clinicId` in every `WHERE` (defence in depth — see Pitfall 3 for why RLS alone is not currently trustworthy) |
| Razorpay `key_secret` exfiltration | Information Disclosure | Encrypted at rest; never in any response body, log line, or error message; Admin-only write |
| SQL injection via `$executeRawUnsafe` in the tenant client | Tampering | Switch to parameterized `$executeRaw` / `set_config($1, $2, true)` |
| Refund abuse (refunding more than was paid) | Tampering | Server-side bound: `Σ refunds ≤ Σ payments` enforced inside the refund transaction |
| Oversell via concurrent finalize | Tampering | `SELECT … FOR UPDATE` on batch rows within the finalize transaction |
| Webhook endpoint DoS causing Razorpay to disable the webhook | Denial of Service | Fast-ack pattern (< 500ms), async BullMQ processing, `rateLimit: false` on the route |
| Connection-pool exhaustion from per-request `PrismaClient` | Denial of Service | Wave 0 remediation of `createTenantClient` (Pitfall 3) |
| Collecting GST without registration | *(compliance, not STRIDE)* | `gstEnabled` gated on a validated GSTIN; no tax lines when disabled |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `react-native-qrcode-svg@6.3.21` is the appropriate QR renderer | Standard Stack | Discovered from `06-UI-SPEC.md`, not an authoritative first-party source. slopcheck `[OK]` and peer deps verified, but under the provenance rule this is `[ASSUMED]`. Low risk (widely used, trivially swappable) |
| A2 | Expo SDK 52 pins `expo-print` to the `~14.0.x` line | Environment Availability | Inferred from Expo unified versioning; the exact patch was not confirmed against Expo's SDK 52 version map. Mitigated entirely by using `npx expo install` |
| A3 | `fastify-raw-body` is a valid alternative to `addContentTypeParser` | Standard Stack | Not verified against official Fastify docs. Only listed as an alternative; the recommended path uses the built-in API |
| A4 | ROADMAP is the later authority over `06-CONTEXT.md` on GST scope | Contradiction 1 | Inferred from `STATE.md` line 96's gap-fill pattern and from Phase 4/5 having already built HSN/SAC support. **Requires explicit user confirmation** — this is the phase's largest scope question |
| A5 | RPT-01 means the daily summary card in ROADMAP criterion #5 | Phase Requirements | RPT-01 is undefined in REQUIREMENTS.md. Inference from ROADMAP wording. Low risk (small, additive), but the requirement should be formally added |
| A6 | `SET LOCAL` in `createTenantClient` does not reliably apply to the subsequent query | Pitfall 3 | Reasoned from PostgreSQL transaction-scoping semantics + Prisma pooling; **not empirically reproduced in this session**. The connection-leak half of the finding is unambiguous from reading the code. **Verify with a live test before planning the remediation scope** |
| A7 | Standalone Lab Test may fall outside the veterinary healthcare exemption | GST Finding G1 | Exemption boundaries are litigated; an Advance Ruling exists treating some lab services as taxable. Recommend per-service configurability rather than hard-coding, which the existing `gstRateOverride` column already permits |
| A8 | Phase 5's `StockMovement` will link to `Consultation`, enabling dispensed quantity lookup | Pattern 1 | Not verified — Phase 5 is unimplemented and `Prescription` has no quantity field. **If this link does not exist, BIL-01 cannot source correct quantities.** Verify before planning 06-02 |
| A9 | Interpreting D-13 as "generate the receipt record server-side, render the PDF on demand" satisfies the decision | PDF Engine | If the user reads D-13 as requiring a stored PDF artifact at webhook time, a server-side renderer becomes necessary and Contradiction 2 resolves toward `@react-pdf/renderer` |
| A10 | Per-clinic webhook path tokens are acceptable operationally | Razorpay Integration | Requires each of the 20 clinics to paste a distinct URL into their own Razorpay dashboard. If that onboarding burden is unacceptable, the parse-then-verify design is the fallback |

---

## Open Questions

1. **Is Phase 6 shipping flat-rate GST (D-08/D-17) or full per-line CGST/SGST/IGST (ROADMAP #4 / BIL-07)?**
   - What we know: ROADMAP and STATE.md say full; CONTEXT.md and UI-SPEC say flat. Phase 4 already shipped `ServiceCatalog.hsnCode/sacCode/gstRateOverride`; Phase 5 plan 05-08 exists solely to add `hsnSacCode`/`gstRate` to inventory items *for Phase 6's use*. The cost delta is ~0.5 plan-days.
   - What's unclear: which document the user considers authoritative.
   - Recommendation: **Path B.** Confirm with the user, then update the losing documents so they stop contradicting. If Path A wins, `06-UI-SPEC.md` line 947–957 and D-08/D-17 remain valid, but the exempt/taxable per-line flag (Finding G1) is still mandatory.

2. **Does veterinary-service GST exemption change the answer to Q1?**
   - What we know: consultations/surgery/vaccination are exempt (Notification 12/2017 Entry 46); products are taxable; a single flat rate across both is incorrect regardless of path.
   - What's unclear: whether the user was aware of this when locking D-08.
   - Recommendation: surface Finding G1 to the user explicitly. It may change their mind on Q1 independent of the ROADMAP-vs-CONTEXT argument.

3. **Should Wave 0 infrastructure remediation be in scope for Phase 6?**
   - What we know: `createTenantClient` leaks connections and may not enforce RLS; 11 of 24 tables have no migrations; only 3 have RLS policies; `expo-print`/`expo-sharing`/`react-native-paper` are missing from the mobile app.
   - What's unclear: whether these become a Phase 6 plan, a separate hotfix phase, or are deferred.
   - Recommendation: **make it plan 06-00 and block everything else on it.** Adding 8 money tables to a foundation with unverified tenant isolation is the highest-risk option available. This changes the phase from 4 plans to 5.

4. **Does Phase 5 link `StockMovement` to `Consultation`?**
   - What we know: `Prescription` (Phase 4) has `dispensed` and `inventoryItemId` but **no quantity**. BIL-01 needs quantity.
   - What's unclear: whether Phase 5's dispense flow records the consultation reference on the movement.
   - Recommendation: verify against `05-01-PLAN.md`/`05-06-PLAN.md` before planning 06-02. If absent, it is a Phase 5 amendment, not a Phase 6 workaround.

5. **How do 20 pilot clinics each get a Razorpay account and configure a webhook (D-29)?**
   - What we know: per-clinic keys means per-clinic accounts, per-clinic KYC, per-clinic webhook configuration and per-clinic webhook secrets.
   - What's unclear: whether this onboarding path exists, and whether Razorpay Route/Partner (one platform account) was considered and rejected.
   - Recommendation: treat as a long-lead external dependency starting now. Build a "Webhook configured ✓/✗" health check into Billing Settings so a misconfigured clinic is visible rather than silently broken.

6. **Should `InventoryItem.sellingPrice` be normalized to integer paise before Phase 5 ships?**
   - What we know: `ServiceCatalog.price` is `Int` paise (shipped); `05-01-PLAN.md` specifies `Decimal(10,2)` rupees. Mixing them on one invoice is a 100× error waiting to happen.
   - Recommendation: normalize now while Phase 5 is unimplemented — it is a one-line plan edit today and a data migration later.

7. **Is `auth_audit_log` the right home for billing audit events?**
   - What we know: the table is named for auth, and `AuditEvent` is an auth-centric enum. D-21/D-26 and GST record-keeping (invoices must be retained 6 years under Section 36) imply financial audit needs.
   - Recommendation: add a separate `billing_audit_log` or generalize the existing table. Ask the user; either is defensible.

---

## Sources

### Primary (HIGH confidence)

- **Codebase inspection** (authoritative for all "what exists today" claims): `apps/api/prisma/schema.prisma`, `apps/api/prisma/seed.ts`, `apps/api/prisma/post-migrate.sql`, `apps/api/prisma/migrations/`, `apps/api/src/app.ts`, `apps/api/src/lib/prisma-rls.ts`, `apps/api/src/middleware/{authenticate,authorize,tenant-context}.ts`, `apps/api/src/modules/billing/service-catalog-seed.ts`, `apps/api/src/jobs/midnight-archive.ts`, `apps/api/vitest.config.ts`, `apps/mobile/src/features/pdf/hooks/useGeneratePdf.ts`, `apps/mobile/package.json`, `packages/ui/package.json`, `packages/types/src/billing.ts`, `packages/validators/src/billing.ts`, `pnpm-lock.yaml`
- **Razorpay official docs** — Payment Links create API (endpoint, all params, `expire_by ≥ 15 min`, `reference_id` 40-char cap, `upi_link` live-mode-only, status enum): https://razorpay.com/docs/api/payments/payment-links/create-standard/
- **Razorpay official docs** — Payment Links webhook events + raw-body requirement: https://razorpay.com/docs/webhooks/payloads/payment-links/
- **Razorpay official docs** — webhook best practices (5s/2xx budget, 24h backoff then disable, `x-razorpay-event-id` dedupe): https://razorpay.com/docs/webhooks/best-practices/ and https://razorpay.com/docs/webhooks/validate-test/
- **Razorpay official docs** — QR Codes API (activation-gated on-demand feature): https://razorpay.com/docs/payments/qr-codes/apis/
- **`razorpay@2.9.8` package inspection** (tarball extracted and read): `dist/razorpay.d.ts`, `dist/utils/razorpay-utils.js` (`validateWebhookSignature` uses `===`), `dist/resources/{paymentLink,refunds,payments,qrCode}.js`, `package.json` (CJS, `axios ^1.18.1` sole dep, no postinstall)
- **npm registry** — versions and metadata for `razorpay` (2.9.8, 438,478 weekly downloads, created 2016), `react-native-qrcode-svg` (6.3.21, peer deps), `react-native-svg`, `expo-print`, `expo-sharing`, `expo-file-system`, `react-native-paper` (5.15.3); `expo` dist-tags confirming unified versioning
- **slopcheck** — legitimacy scan of 8 candidate packages, all `[OK]`
- **CBIC** — CGST Rule 46A (invoice-cum-bill of supply): https://taxinformation.cbic.gov.in/content/html/tax_repository/gst/rules/cgst_rules/active/chapter6/rule46a_v1.00.html

### Secondary (MEDIUM confidence — WebSearch cross-verified across multiple sources)

- Veterinary services GST exemption, Entry 46 of Notification 12/2017-CT(R), SAC 99835 / 998351: [taxguru.in](https://taxguru.in/goods-and-service-tax/veterinary-healthcare-services-gst-perspective.html), [bizfoc.com](https://bizfoc.com/hsn-code/veterinary-services-sac-99835-gst-rates), [busy.in](https://busy.in/sac-code-998351/), [casahuja.com](https://www.casahuja.com/2025/12/gst-classification-and-taxability.html)
- GST 2.0 slab restructure effective 22 Sept 2025 (5/18/40; medicines 12%→5%): [cygnet.one](https://www.cygnet.one/blog/gst-2-0-changes-september-2025/), [busy.in](https://busy.in/gst/gst-2-0-transition-new-slab-rates/), [cleartax.in](https://cleartax.in/s/gst-rates), [loyalpetzone.com](https://www.loyalpetzone.com/impact-gst-pet-products/)
- Rule 46 mandatory fields, 16-char invoice number limit, HSN digit thresholds, ₹5 crore e-invoicing threshold (Notification 17/2025-CT, from 1 Apr 2026): [cleartax.in](https://cleartax.in/s/gst-invoice-details), [taxgarden.in](https://taxgarden.in/blog/gst-invoice-rules-format-mandatory-fields-e-invoice-india-2026), [zapinvoice.in](https://zapinvoice.in/blog/gst-invoice-format-requirements), [hrareceipt.in](https://hrareceipt.in/answers/e-invoicing-gst-5-crore-threshold-fy2026-27)
- Section 170 + Rule 51 rounding (nearest rupee, per tax head, invoice level): [cleartax.in](https://cleartax.in/s/rounding-off-tax-section-170-gst), [captainbiz.com](https://www.captainbiz.com/blogs/rounding-off-tax-under-gst-section-170/), [busy.in](https://busy.in/gst/rounding-off-rules-in-gst-invoices/)
- Rule 46A applicability (registered supplier, unregistered recipient, mixed taxable+exempt): [gstzen.in](https://gstzen.in/a/invoice-cum-bill-of-supply-cgst-rule-46a.html), [taxwink.com](https://www.taxwink.com/blog/invoice-cum-bill-of-supply-under-gst), [cleartax.in](https://cleartax.in/v/gst/gst-rules/cgst-rule-46a-invoice-cum-bill-of-supply)
- Razorpay multi-merchant webhook patterns (application-level webhooks, Partner accounts, Route linked accounts): [Razorpay Route docs](https://razorpay.com/docs/payments/route/linked-account/), [Razorpay Partner webhooks](https://razorpay.com/docs/api/partners/webhooks/create/)

### Tertiary (LOW confidence — flagged for validation)

- GST registration threshold ₹20 lakh for services (₹10 lakh special-category states) — widely known, but not verified against a CBIC primary source in this session. Affects Finding G3's framing, not its conclusion (the off-switch is needed regardless).
- Section 122 penalty amounts for collecting tax without registration — cited from secondary tax-blog sources.
- Six-year GST record-retention obligation (Section 36) referenced in Open Question 7 — not verified in this session.

---

## Metadata

**Confidence breakdown:**

| Area | Level | Reason |
|------|-------|--------|
| Razorpay integration | **HIGH** | Official docs fetched for every API surface; SDK tarball extracted and source-read; all constraints (5s budget, raw body, `expire_by ≥ 15min`, `reference_id` 40 chars, event names, dedupe header) traced to first-party documentation |
| Existing-codebase findings | **HIGH** | Every claim verified by direct file read or `grep`/`npm` command in this session. Migration gap, RLS coverage, missing deps, permission seed, money-unit mismatch, and `packages/shared` orphan are all directly observed, not inferred |
| GST compliance rules | **HIGH** | Rule 46, Rule 46A, Section 170 rounding, the veterinary exemption, and GST 2.0 slabs each corroborated by 3+ independent sources; Rule 46A confirmed against the CBIC primary source |
| GST scope contradiction analysis | **MEDIUM-HIGH** | The contradiction itself is documented fact (exact file/line citations). The *resolution* recommendation is reasoned inference from STATE.md's gap-fill pattern and Phase 4/5 build artifacts — user confirmation required (A4) |
| Architecture patterns | **HIGH** | Standard, well-established patterns (transactional finalize with row locks, counter-table numbering, webhook fast-ack) adapted to the observed codebase conventions |
| Common pitfalls | **HIGH** for codebase-observed (1, 2, 4, 8–12); **MEDIUM** for Pitfall 3's RLS half (reasoned from PostgreSQL semantics + Prisma pooling, not empirically reproduced — see A6) |
| Expo module versions | **MEDIUM** | Unified-versioning behaviour confirmed via npm dist-tags; exact SDK-52 pins not confirmed against Expo's version map. Fully mitigated by mandating `npx expo install` (A2) |
| Phase 5 integration surface | **LOW-MEDIUM** | Phase 5 is unimplemented; all claims derive from its plan documents, which themselves reference a non-existent `packages/shared/` path. The dispensed-quantity join (A8) is the highest-risk unknown in this phase |

**Research date:** 2026-08-12
**Valid until:** 2026-09-11 (30 days). Re-verify sooner if: the GST Council issues a rate notification; Razorpay changes Payment Links pricing or API; the project upgrades Expo SDK; or Phase 5 lands and changes the inventory contract.
