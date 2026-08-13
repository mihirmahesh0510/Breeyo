# Phase 6: Invoicing & Payments - Context

**Gathered:** 2026-05-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Generate invoices from consultation services and dispensed inventory items, accept payments via Razorpay (UPI/card) and cash, manage invoice lifecycle (draft through paid/voided), and produce professional PDF invoices with basic GST. Delivers: service catalog, invoice builder, Razorpay Payment Links integration, split payment support, full/partial refunds, credit notes, PDF generation, payment receipts, billing dashboard, and Quick Sale screen for counter sales. Phase 6 builds on Phase 5's dispensed item auto-add (D-50) and Phase 4's consultation workflow.

</domain>

<decisions>
## Implementation Decisions

### Invoice Creation Flow
- **D-01:** Auto-populate + manual add — draft invoice auto-populates dispensed items from Phase 5 inventory (D-50). Front desk manually adds service line items from a preset service catalog. One-tap to add common services
- **D-02:** Preset + custom service catalog — ship with common presets: General Consultation, Surgery, Vaccination, Lab Test, X-Ray, Dental Cleaning. Admin can add custom services with name + price. Quick-tap to add to invoice
- **D-03:** Both creation paths — End Consultation (Phase 4, D-04) creates draft invoice with dispensed items. Invoices can also be created independently from Billing tab for counter sales or missed charges
- **D-04:** Separate "Quick Sale" screen — dedicated POS-like screen in Billing tab for counter sales (pet food, supplements, accessories without consultation). Scan barcode, add to cart, generate invoice. Linked to Phase 5 counter sale (D-52)
- **D-05:** Front Desk + Admin billing permissions — only Front Desk and Admin roles can create and manage invoices. Clinicians cannot create invoices directly. Solo vets use Admin role which has full billing access
- **D-06:** Front Desk pulls from completed visits — Front Desk sees completed consultations and creates invoices by pulling in dispensed items and adding services. No auto-queue or vet-initiated handoff
- **D-07:** Line-item + invoice-level discounts — percentage or flat discount on individual items OR on the total invoice. Common in Indian vet clinics for regulars and multi-pet owners
- **D-08 (superseded 2026-08-12 during plan-phase research — see 06-RESEARCH.md Contradiction 1):** Full per-line-item GST — each line item (service or product) carries its own `taxTreatment` (exempt/taxable), GST rate, and HSN/SAC code, sourced from `ServiceCatalog`/`InventoryItem`. CGST+SGST for intra-state, IGST for inter-state, computed per line and rounded per tax head at invoice level (Section 170/Rule 51). Full GST breakdown is now IN SCOPE for Phase 6 (BIL-07), matching ROADMAP success criterion #4 — both upstream catalogs already carry the HSN/SAC + rate fields needed. Veterinary healthcare services (consultation, surgery, vaccination) are GST-exempt by law (Notification 12/2017-CT(R) Entry 46, SAC 998351) — a single flat rate applied to everything (the original D-08) would have meant illegally taxing exempt services, not just a simplification.

### Payment Integration
- **D-09:** Razorpay Payment Links API — server creates payment link via Razorpay API. QR code displayed on clinic device for in-person payment. Shareable link for remote collection (owner left without paying). Webhook confirms payment status
- **D-10:** Cash + digital + split payment — support cash, UPI, and card payments. Split payment allowed (e.g., ₹1000 cash + ₹500 UPI). Cash payments marked manually. Digital payments via Razorpay
- **D-11:** Auto-retry + manual fallback on failure — failed Razorpay payment shows error with reason. Front desk can retry (regenerate link/QR) or mark as unpaid. Pending payments timeout after 15 minutes and revert to unpaid
- **D-12:** Full + partial refunds — both full and partial refunds supported. Digital refunds via Razorpay Refund API. Cash refunds tracked as manual adjustment. Split payment refunds: digital portion via Razorpay, cash portion marked as "refunded manually"
- **D-13:** Auto-generated payment receipts — after payment confirmation (webhook), system generates payment receipt with transaction ID, amount, method, timestamp. Available as PDF. Separate document from the invoice

### Invoice Presentation & PDF
- **D-14:** Full professional invoice — clinic header (logo, name, address, phone, GSTIN), owner info (name, phone), pet info (name, species), line items (services + products with qty, rate, amount), subtotal, GST line, discount, grand total, payment status, invoice number, date
- **D-15:** Auto-sequential numbering per clinic — format: INV-YYYYMM-XXXX (e.g., INV-202605-0001). Sequential within each clinic, resets monthly. Unique, auditable, GST-friendly
- **D-16:** Print + WhatsApp share + download — three share options: Print (thermal/regular), WhatsApp (sends PDF to owner via Phase 7 abstraction layer), Download (save to device). Same pattern as Phase 4 PDFs (D-45 to D-48)
- **D-17 (superseded 2026-08-12 — see D-08 update, 06-RESEARCH.md Contradiction 1):** Full GST breakdown on invoice — CGST/SGST shown per line for intra-state transactions, IGST for inter-state, with HSN/SAC codes per line. Document heading switches between `INVOICE` / `BILL OF SUPPLY` / `TAX INVOICE` / `INVOICE-CUM-BILL OF SUPPLY` depending on clinic registration status and exempt/taxable line mix (CGST Rule 46A). GST is a first-class per-clinic on/off toggle — most solo vets are below the ₹20L registration threshold and must not collect GST at all; an invoice from an unregistered clinic never shows a GST line or GSTIN. Clinic configures GSTIN, state code, and registration status in settings.
- **D-18:** Full in-app invoice view — invoice displayed as native screen with all details, action buttons (Pay, Print, Share, Refund), payment history, and status. PDF generated on demand when Print/Share is tapped
- **D-19:** Credit note numbering — auto-sequential: CN-YYYYMM-XXXX. Same pattern as invoice numbering

### Invoice Lifecycle & Status
- **D-20:** States: Draft → Finalized → Paid/Partially Paid/Unpaid/Overdue — Draft: editable, not yet sent. Finalized: locked, printable, awaiting payment. Paid: full payment received. Partially Paid: split payment with portion pending. Overdue: unpaid past due date
- **D-21:** Finalized invoices locked — cannot be edited after finalization. If wrong, void the invoice and create a new one. For partial corrections, issue a credit note. Maintains audit trail integrity
- **D-22:** Simple credit notes — negative invoice referencing the original. Contains items/amount being credited. Reduces outstanding balance. Shows in billing history linked to original invoice
- **D-23:** Due date + overdue flag — each invoice has a due date (default configurable in settings). System auto-flags overdue invoices. Overdue list visible in Billing dashboard. No automated reminders for Beta
- **D-24:** Summary cards + filterable invoice list — top of Billing tab: Today's Revenue, Unpaid Total, Overdue Count, Recent Payments. Below: filterable invoice list by status, date range, patient. Same pattern as Inventory summary (Phase 5, D-32)
- **D-25:** Invoice tab on pet profile — add "Invoices" tab to pet profile (Phase 3). Shows all invoices for that pet, newest first. Tap to view full invoice
- **D-26:** Void prompts stock restoration — when voiding an invoice, system asks "Return dispensed items to stock?" If yes, creates reverse stock movements (Phase 5 return flow, D-51). If no, stock stays deducted
- **D-27:** One invoice per pet — each consultation generates its own invoice linked to that pet. Multi-pet owners get separate invoices. Owner can pay multiple invoices at once via combined payment link

### Navigation & Settings
- **D-28:** Replace 'More' tab with Billing — bottom tabs become: Queue, Patients, Inventory, Billing. 'More' menu items (settings, profile, reports) move to a drawer/hamburger menu or settings gear icon. Billing is a core daily workflow
- **D-29:** Essential billing settings — admin configures in clinic settings: GSTIN number, default GST rate (%), default due date (days from invoice), clinic bank account details (for display on invoice), invoice footer text (terms/notes), Razorpay API keys. All optional except Razorpay keys for digital payments

### Plan-Phase Research Resolutions (2026-08-12)

Decisions made resolving 06-RESEARCH.md's blocking contradictions and open questions, before plan generation:

- **D-30 (refined 2026-08-12 by pattern-mapper — see 06-PATTERNS.md):** Wave 0 infrastructure remediation in scope — a blocking plan (06-00) precedes all other Phase 6 plans. The root cause is worse than initially diagnosed: it is not just that `createTenantClient` leaks a connection and sets `SET LOCAL app.clinic_id` outside a transaction — **no existing route actually uses the tenant-scoped client at all.** `emr.routes.ts`, `queue.routes.ts`, and every other module pass `fastify.prisma` (the RLS-bypassing admin client) to their services, not `request.db`. Fixing `createTenantClient` in isolation changes nothing at runtime. There is also an orphaned RLS SQL file (`apps/api/prisma/rls/phase-03-patient-queue-rls.sql`) that sets policies against a different GUC name (`app.current_clinic_id`) than the one `prisma-rls.ts` actually sets (`app.clinic_id`) — those policies are unreachable. Wave 0 must: (a) fix `createTenantClient`'s connection lifecycle and wrap the GUC set in a transaction, (b) audit and fix every existing route/service call site to actually use the tenant-scoped client instead of the admin client, (c) reconcile or regenerate the RLS policy SQL so the GUC names match, (d) generate missing Prisma migrations for Phase 3-4 tables (only 2 migrations exist covering 13 of 24 tables), and (e) add missing mobile deps (`expo-print`, `expo-sharing`, `react-native-paper`, and `@breeyo/ui` — all imported/specified but not declared in `apps/mobile/package.json`). Billing tables do not get created on top of a tenant-isolation boundary that is not just unverified but demonstrably bypassed today.
- **D-31:** Money representation — integer paise throughout Phase 6's own billing tables and calculations, matching the already-shipped `ServiceCatalog.price: Int`. Phase 5's `InventoryItem.sellingPrice` plan (`Decimal(10,2)` rupees) is NOT modified. Instead, Phase 6 adds a tested `toPaise()` boundary adapter in the invoice line-item builder that converts product prices to paise at the point they enter an invoice, with a unit test guarding the 100x conversion error.
- **D-32:** Billing audit events go in a new, dedicated `billing_audit_log` table — separate from the existing auth-centric `auth_audit_log`. Financial events (void, refund, credit note, payment) get independent retention (GST record-keeping requires 6-year retention under Section 36) decoupled from auth audit policy.
- **D-33:** RPT-01 (patients-seen-today) ships as a 5th summary card on the Billing dashboard, alongside D-24's existing four (Today's Revenue, Unpaid Total, Overdue Count, Recent Payments). Computed as `COUNT(DISTINCT petId)` over today's finalized consultations, IST-bounded.

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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Context
- `.planning/PROJECT.md` -- Core value (mobile-first for solo vets), constraints (mid-range Android 8+, offline support, price sensitivity, GST compliance), key decisions (real payment gateway from day one)
- `.planning/REQUIREMENTS.md` -- BIL-01 through BIL-06 are the requirements for this phase. BIL-07 through BIL-09 are v2 billing enhancements (deferred)
- `.planning/ROADMAP.md` -- Phase 6 goal, success criteria, dependency on Phase 5

### Prior Phase Context
- `.planning/phases/01-foundation-authentication/01-CONTEXT.md` -- Auth system, RBAC with customizable per-user permissions (D-16), multi-tenant RLS (D-22-D-26), API conventions `/api/v1/{resource}` (D-27-D-30), audit trail patterns (D-34-D-36, immutable append-only logs)
- `.planning/phases/02-ui-ux-design-design-system/02-CONTEXT.md` -- Design system: Material Design 3 (D-01), warm colors (D-02), bottom tab bar (D-25, modified in this phase to include Billing), FABs (D-30), summary card pattern, balanced density for lists (D-32)
- `.planning/phases/03-patient-registration-walk-in-queue/03-CONTEXT.md` -- Pet profile tabbed layout (Phase 6 adds Invoices tab), patient search pattern with pg_trgm (D-25), visit history timeline (D-31)
- `.planning/phases/04-emr-clinical-records/04-CONTEXT.md` -- Consultation workflow: End Consultation (D-04) triggers invoice draft creation, dispensed vs prescribed flag on medications (D-33-D-34), PDF generation patterns (D-45-D-48: clinic header branding, English-only PDFs for Beta)
- `.planning/phases/05-inventory-management/05-CONTEXT.md` -- Dispensed items auto-add to draft invoice (D-50), counter sales (D-52), selling price per item (D-03), FIFO dispensing (D-22), return to stock flow (D-51), stock movement history (D-45-D-47)

### Technology Stack
- `.planning/research/STACK.md` -- React Native/Expo, Node.js/Fastify, PostgreSQL, Redis, Prisma, TypeScript, Zustand, React Query, zod, Razorpay SDK

No additional external specs or ADRs -- requirements fully captured in decisions above and REQUIREMENTS.md.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None yet -- Phases 1-5 create the foundation. Phase 6 consumes the full stack (auth, design system, patient data, EMR, inventory) for billing

### Established Patterns
- Monorepo structure from Phase 1 -- billing module follows bounded context pattern (`apps/api/src/modules/billing/`)
- PostgreSQL RLS multi-tenancy from Phase 1 -- all billing data scoped to clinic tenant
- Auth middleware from Phase 1 -- all billing endpoints require authentication with role-based access
- Design system from Phase 2 -- cards, summary cards, FAB, bottom sheet, search bar, filter chips, tabs, status badges all from component library
- API conventions from Phase 1 (D-27-D-30) -- REST endpoints follow `/api/v1/billing/*` pattern
- PDF generation pattern from Phase 4 -- clinic header branding, English-only, shareable via WhatsApp abstraction layer
- Live search pattern from Phase 3 -- debounced search with pg_trgm for invoice/patient search
- Timeline pattern from Phase 3 -- visit history, reused for payment history on invoice
- Zod schema validation from Phase 3 -- shared client/server validation for invoice schemas
- Prisma Client Extensions for RLS from Phase 3 -- same tenant isolation approach

### Integration Points
- EMR (Phase 4) -- End Consultation creates draft invoice with dispensed items; consultation services linked to invoice
- Inventory (Phase 5) -- dispensed items flow to invoice line items; void restores stock; counter sales create invoices
- Pet Profile (Phase 3) -- new Invoices tab shows billing history per pet
- Navigation (Phase 2) -- bottom tab bar modified to include Billing tab
- WhatsApp (Phase 7) -- invoice PDF sharing via abstraction layer; future automated reminders for overdue invoices
- Owner Portal (Phase 9) -- invoice viewing and payment from owner's side

</code_context>

<specifics>
## Specific Ideas

- Invoice creation feels seamless from consultation: vet finishes, front desk picks up the draft with dispensed items already listed
- Quick Sale screen is POS-like: scan, add, pay — no consultation overhead for OTC purchases
- Split payments reflect Indian reality: many owners pay part cash, part UPI
- QR code on screen for in-person payment mirrors the paytm/phonepe experience every Indian is familiar with
- Shareable payment link covers the "owner left without paying" scenario that every vet complains about
- Credit notes maintain accounting integrity without forcing the vet into complex accounting workflows
- One invoice per pet keeps the billing-to-medical-record relationship clean for Phase 9 owner portal
- Billing as a bottom tab (replacing 'More') gives it the prominence matching its daily importance in clinic operations

</specifics>

<deferred>
## Deferred Ideas

- ~~Full GST compliance with CGST/SGST/IGST breakdown and HSN/SAC codes -- v2 (BIL-07)~~ MOVED INTO SCOPE 2026-08-12 — see D-08/D-17 updates above
- Payment link generation shareable via WhatsApp/SMS -- v2 (BIL-08)
- WhatsApp invoice delivery with embedded pay links (real API) -- v2 (BIL-09)
- Automated overdue payment reminders via WhatsApp -- Phase 7 or post-Beta
- Revenue analytics charts and trends -- post-Beta analytics dashboard
- Multi-pet combined invoice option -- deferred, one-per-pet is cleaner for Beta
- Recurring invoices for chronic treatment plans -- post-Beta if needed
- Razorpay Checkout SDK (in-app) -- Payment Links API sufficient for Beta

</deferred>

---

*Phase: 06-invoicing-payments*
*Context gathered: 2026-05-04*
