# PRD-06: Invoicing & Payments

**Type:** Lightweight PRD
**Phase:** 06 - Invoicing & Payments
**Status:** Draft
**Author:** Auto-generated
**Date:** 2026-08-03

---

## 1. Executive Summary

Phase 6 delivers the complete billing lifecycle for Breeyo: invoice creation, payment collection, refunds, and financial reporting. This is the phase where clinical work (Phase 4) and inventory management (Phase 5) converge into revenue -- the fundamental operation that keeps a veterinary clinic running.

The phase delivers an invoice builder that auto-populates dispensed items from consultations and lets Front Desk staff add services from a preset catalog, a Quick Sale screen for counter sales without consultations, Razorpay Payment Links integration for UPI and card payments (with QR code display for in-person collection and shareable links for remote payment), split payment support (cash + digital), full and partial refunds, credit notes, professional PDF invoices with basic GST, auto-generated payment receipts, and a billing dashboard with daily revenue metrics. The bottom navigation is restructured to give Billing a dedicated tab, replacing the existing 'More' tab, reflecting its importance as a core daily workflow.

This phase directly addresses the Indian veterinary market reality: clinics that currently track payments on paper, miss follow-ups on unpaid invoices, and lose revenue to manual billing errors. By connecting clinical records to billing in a single mobile-first flow, Breeyo eliminates the gap between treatment and payment that costs solo vets time and money every day.

---

## 2. Problem Statement

Indian veterinary clinics face several interconnected billing challenges:

**Manual invoicing is slow and error-prone.** Solo vets or their front desk staff hand-write invoices or use generic spreadsheets. Dispensed medications are frequently omitted, service charges are inconsistent, and GST calculations are done mentally or skipped entirely. A typical clinic loses 15-30 minutes per day on billing admin and an estimated 5-10% of revenue to missed charges.

**Payment collection is fragmented.** Pet owners pay via UPI, cash, or card -- often splitting across methods. Clinics track these payments in notebooks or WhatsApp messages, leading to disputes and lost records. When an owner leaves without paying (a common occurrence), there is no systematic way to follow up or collect remotely.

**No connection between clinical work and billing.** The vet dispenses medications and provides services during a consultation, but the billing step is entirely disconnected. Front desk staff must manually ask the vet what was done, look up prices, and reconstruct the invoice from memory or notes. This disconnect introduces errors and delays.

**Financial visibility is absent.** Most clinics have no real-time view of daily revenue, outstanding balances, or overdue payments. End-of-day reconciliation is manual, and month-end financial summaries require hours of ledger work.

**GST compliance is burdensome.** Indian businesses above the GST threshold must issue tax invoices with GSTIN, proper numbering, and tax breakdowns. Solo vets find this paperwork overwhelming and often maintain compliance through external accountants at additional cost.

Without a billing system that ties directly into the clinical and inventory workflows already built in Phases 4 and 5, Breeyo remains a clinical tool but not a practice management platform. Billing is the capability that makes the platform operationally complete for daily use.

---

## 3. Target Users & Personas

### Primary: Dr. Priya -- Solo Vet / Admin

- **Role:** Owner-operator who handles all aspects of the practice, including billing. Uses the Admin role in Breeyo, giving her full billing access.
- **Context:** Sees 15-25 patients per day. Currently writes invoices by hand or dictates charges to a notebook. Uses her personal phone for UPI collections via Google Pay/PhonePe. Has no consolidated view of daily revenue.
- **Needs:** One-tap invoice creation after consultations with dispensed items pre-filled. Quick counter sales for OTC products. UPI payment collection via QR code on her phone. End-of-day revenue summary without manual counting.
- **Frustrations:** Forgetting to charge for dispensed medications. Owners leaving without paying and no way to follow up. Manual GST calculation. No idea what the clinic made today until she counts cash at closing.

### Secondary: Receptionist Rekha -- Front Desk Staff

- **Role:** Handles billing and payment collection for clinics with at least one staff member. Assigned the Front Desk role.
- **Context:** Sits at the reception counter. Creates invoices after the vet completes consultations. Handles counter sales for pet food and supplements. Collects payments via cash and UPI. Cannot process refunds or void invoices without Admin approval.
- **Needs:** See completed consultations ready for billing. Add services and finalize invoices quickly during patient handoff. Handle split payments (part cash, part UPI) which are common. Generate and share invoices via WhatsApp.
- **Frustrations:** Asking the vet repeatedly what services were provided. Manually calculating totals and tax. Tracking partial payments on paper.

### Tertiary: Pet Owner Amit -- Payment Recipient

- **Role:** Pet owner who receives and pays invoices. Not a direct Breeyo user in this phase.
- **Context:** Brings his dog for consultations. Prefers to pay via UPI (PhonePe or Google Pay). Sometimes leaves the clinic intending to pay later. Occasionally needs a formal invoice for pet insurance claims.
- **Needs:** Easy UPI payment via QR scan at the clinic counter. Professional invoice PDF for records. Ability to pay remotely if he forgot at the clinic.
- **Frustrations:** Handwritten receipts that are not acceptable for insurance. No record of what he paid for. Cannot pay remotely when he misses payment at the clinic.

---

## 4. Strategic Context

### Market Positioning

Breeyo's competitive edge in the Indian veterinary market rests on being a mobile-first, end-to-end practice management platform. Phases 1-5 built identity, UI, patient management, clinical records, and inventory. Phase 6 closes the loop by connecting clinical work to revenue, making Breeyo operationally complete for the daily workflow: patient walks in, gets treated, medications dispensed, invoice generated, payment collected -- all from the vet's phone.

India has 40,000+ targetable vet clinics, mostly operating on paper records, WhatsApp for communication, and manual invoicing. Pet ownership is growing 10-15% annually (32M+ pets). The market is approximately $2.8B TAM with no dominant digital solution. Existing competitors (Pet360, Simplivet, VetPort, VetBuddy) are either US-centric, desktop-first, or lack integrated billing with UPI support. Breeyo's integrated walk-in-to-payment flow on mobile is a direct competitive differentiator.

### Payment Gateway from Day One

A deliberate project-level decision (PROJECT.md) mandates real payment gateway integration (Razorpay) from day one rather than simulating payments. Indian pet owners expect UPI payments; simulating this would fail to test the real user experience and would require significant rework when going live. Razorpay Payment Links API is chosen over the full Checkout SDK for simplicity -- it requires no in-app SDK, works via QR codes and shareable links, and aligns with how every Indian consumer already pays (scanning QR codes at shops).

### GST Compliance Strategy

Phase 6 ships with basic GST: a single configurable rate applied to all line items, GSTIN displayed on invoices, and proper sequential invoice numbering (INV-YYYYMM-XXXX). This satisfies the immediate needs of solo vets who are either below the GST threshold or use a single rate. Full GST compliance with CGST/SGST/IGST breakdown and HSN/SAC codes is delivered as an upgrade within Phase 6 (Plan 06-04, BIL-07) to prepare for larger clinics and regulatory audits.

### Revenue Impact for Pilot Clinics

Billing is the feature that makes Breeyo directly revenue-relevant for pilot clinics. A clinic that collects payments faster, misses fewer charges (through auto-populated dispensed items), and has real-time revenue visibility is a clinic that renews its Breeyo subscription. The billing dashboard's "Today's Revenue" metric alone provides daily value that no paper-based system can match. The B2B SaaS subscription target (Rs 999-3,000/month per clinic) depends on delivering capabilities that visibly save the clinic money -- billing is that capability.

### Dependency Chain

Phase 6 is the convergence point of the clinical stack:
- **Phase 4 (EMR):** End Consultation creates a draft invoice with dispensed items. Consultation services become billable line items.
- **Phase 5 (Inventory):** Dispensed items flow to invoice line items with selling prices (D-50). Counter sales (D-52) are invoiced through Quick Sale. Invoice void can trigger stock restoration (D-51). FIFO dispensing and selling prices are Phase 5 responsibilities.
- **Phase 3 (Patients):** Pet profile gets an Invoices tab. Owner information populates invoice headers. Patient search powers invoice search.
- **Phase 2 (Design System):** All billing UI is built from the established component library -- summary cards, filter chips, bottom sheets, FABs, status badges.

### Downstream Dependencies

- **Phase 7 (WhatsApp):** Invoice PDF sharing via WhatsApp abstraction layer. Future automated overdue payment reminders.
- **Phase 9 (Owner Portal):** Invoice viewing and payment from the pet owner's side via tokenized web portal.

---

## 5. Solution Overview

### 5.1 Invoice Builder

| Capability | Details |
|---|---|
| **Auto-populated line items** (D-01, BIL-01) | Draft invoices auto-populate with dispensed items from Phase 5 inventory (quantities, selling prices, batch references). Front Desk reviews and adjusts as needed. |
| **Service catalog** (D-02) | Ships with 6 preset services: General Consultation, Surgery, Vaccination, Lab Test, X-Ray, Dental Cleaning. Admin can add custom services with name and price. One-tap to add any service to an invoice. |
| **Dual creation paths** (D-03) | Path A: End Consultation (Phase 4) creates a draft invoice with dispensed items pre-populated. Path B: Independent creation from the Billing tab for counter sales or missed charges. Front Desk pulls from completed visits -- no auto-queue or vet-initiated handoff (D-06). |
| **Discounts** (D-07) | Line-item discounts (percentage or flat amount on individual items) and invoice-level discounts (on the subtotal). Common in Indian vet clinics for regulars and multi-pet owners. |
| **Stock validation** (BIL-02) | Real-time stock availability check before finalizing. Insufficient stock blocks finalization with clear per-item error messaging. |
| **Notes and due date** (D-23) | Optional invoice notes field. Due date defaults to clinic-configured days from invoice date (configurable in settings, D-29). |

### 5.2 Quick Sale Screen

| Capability | Details |
|---|---|
| **POS-like counter sales** (D-04) | Dedicated screen for selling products without a consultation (pet food, supplements, accessories). Accessed via Billing tab FAB. Linked to Phase 5 counter sale flow (D-52). |
| **Barcode scanning** | Integrates Phase 5 barcode scanner. Scan a product barcode, item appears in cart with quantity stepper. |
| **Product search** | Manual search fallback when barcode is not available. Debounced pg_trgm search (same pattern as Phase 3/5). |
| **Cart management** | Quantity steppers, remove items, inline stock validation, running subtotal/GST/total. |
| **One-step checkout** | "Generate Invoice" creates and finalizes the invoice in a single step, then navigates to payment collection. Products recorded as counter sale stock movements in Phase 5. |

### 5.3 Payment Collection

| Capability | Details |
|---|---|
| **Razorpay Payment Links** (D-09, BIL-05) | Server creates a payment link via Razorpay API. QR code displayed on the clinic device for in-person scanning. Shareable link for remote collection (owner left without paying). |
| **Cash payments** (D-10) | Front Desk marks cash payments manually. No external integration required. |
| **Split payments** (D-10) | A single invoice can be paid partially in cash and partially via digital payment. Example: Rs 1,000 cash + Rs 500 UPI. Cash portion marked immediately, digital portion via Razorpay QR/link flow. |
| **Webhook confirmation** (D-09, BIL-06) | Razorpay `payment_link.paid` webhook automatically updates invoice status. HMAC-SHA256 signature verification ensures authenticity. Raw body preservation for verification. |
| **Payment link expiry** (D-11) | Links expire after 15 minutes. Expired links revert the invoice to unpaid. Front Desk can regenerate a new link or mark as unpaid. |
| **Failure handling** (D-11) | Failed payments show the error reason from Razorpay. Front Desk can retry (regenerate link/QR) or mark as unpaid. |
| **Auto-generated receipts** (D-13) | After payment confirmation (webhook or manual), system generates a payment receipt with transaction ID, amount, method, and timestamp. Available as a separate PDF from the invoice. |

### 5.4 Invoice Lifecycle & Status

| Capability | Details |
|---|---|
| **Status state machine** (D-20) | Draft (editable) -> Finalized (locked, awaiting payment) -> Paid / Partially Paid / Unpaid / Overdue. Plus Voided as a terminal state. |
| **Finalized invoices are immutable** (D-21) | Cannot be edited after finalization. Corrections require voiding and recreating, or issuing a credit note. Maintains audit trail integrity. |
| **Invoice numbering** (D-15) | Auto-sequential format: INV-YYYYMM-XXXX (e.g., INV-202605-0001). Per-clinic, monthly reset. Guaranteed unique via database advisory locks. |
| **Due dates and overdue detection** (D-23) | Each invoice has a configurable due date. System auto-flags overdue invoices via daily cron job. Overdue count visible on the billing dashboard. No automated reminders in this phase (deferred to Phase 7). |
| **Void with stock restoration** (D-26) | Voiding an invoice prompts "Return dispensed items to stock?" If yes, reverse stock movements are created via Phase 5 return flow (D-51). If no, stock stays deducted. |
| **One invoice per pet** (D-27) | Each consultation generates its own invoice linked to a specific pet. Multi-pet owners receive separate invoices. Owners can pay multiple invoices at once via combined payment link. |

### 5.5 Refunds & Credit Notes

| Capability | Details |
|---|---|
| **Full and partial refunds** (D-12) | Both supported. Digital refunds processed via Razorpay Refund API. Cash refunds tracked as manual adjustments. Split payment refunds: digital portion via Razorpay, cash portion marked as manually refunded. |
| **Credit notes** (D-22) | Simple negative invoice referencing the original. Contains specific items/amounts being credited. Reduces outstanding balance. Auto-numbered CN-YYYYMM-XXXX (D-19). Shows in billing history linked to original invoice. |
| **Refund permissions** (D-05) | Admin-only for refunds and voids. Front Desk cannot process refunds or void invoices. |

### 5.6 PDF Generation & Sharing

| Capability | Details |
|---|---|
| **Professional invoice PDF** (D-14, BIL-04) | Clinic header (logo, name, address, phone, GSTIN), owner info (name, phone), pet info (name, species), line items (services + products with qty, rate, amount), subtotal, discount, GST line, grand total, payment status, invoice number, date, due date, footer text. A4 portrait. English only for Beta. Same clinic header branding pattern as Phase 4 (D-45 to D-48). |
| **Payment receipt PDF** (D-13) | Separate document from the invoice. Contains clinic header, receipt number, payment date, invoice reference, amount, method, transaction ID. Compact layout optimized for 80mm thermal printer width with regular printer fallback. |
| **Credit note PDF** | Same layout as invoice with "CREDIT NOTE" header and negative amounts. |
| **Share options** (D-16) | Print (thermal/regular), WhatsApp (sends PDF via Phase 7 abstraction layer), Download (save to device). Same pattern as Phase 4 consultation PDFs. |

### 5.7 Billing Dashboard

| Capability | Details |
|---|---|
| **Summary cards** (D-24) | Four metrics at the top of the Billing tab: Today's Revenue (total collected today), Unpaid Total (sum of all unpaid/overdue invoices), Overdue Count (number of overdue invoices), Recent Payments (count of payments received today). Same summary card pattern as Phase 5 inventory summary (D-32). |
| **Filterable invoice list** (D-24) | Below summary cards. Filter by status (All, Draft, Unpaid, Overdue, Paid, Voided). Sort by date, amount, or due date. Search by invoice number, patient name, or owner name/phone. Debounced search with pg_trgm. |
| **Summary card interactions** | Tapping "Unpaid Total" filters the list to Unpaid + Overdue. Tapping "Overdue" filters to Overdue only. |
| **Patients seen today** (RPT-01) | Dashboard includes patients-seen-today count as part of the daily summary metrics. |

### 5.8 Navigation & Settings

| Capability | Details |
|---|---|
| **Bottom tab restructure** (D-28) | Tabs change from Queue / Patients / Inventory / More to Queue / Patients / Inventory / Billing. Former 'More' items (settings, profile, reports) move to a hamburger/drawer menu or settings gear icon on the top navigation bar. |
| **Invoice tab on pet profile** (D-25) | New "Invoices" tab added to the pet profile screen (Phase 3). Shows all invoices for that pet, newest first. Tap to view full invoice detail. |
| **Billing settings** (D-29) | Admin configures in clinic settings: GSTIN number, default GST rate (%), default due date (days from invoice date), clinic bank account details (for display on invoice), invoice footer text (terms/notes), Razorpay API keys (Key ID + Secret), test mode toggle. All optional except Razorpay keys for digital payments. |

### 5.9 GST Compliance

| Capability | Details |
|---|---|
| **Basic GST** (D-08, D-17) | Single configurable rate (e.g., 18%) applied to all services and products. Displayed as "GST @ 18%: Rs 216" on invoices. No CGST/SGST split initially. Clinic configures GST rate and GSTIN in settings. |
| **Full GST upgrade** (BIL-07, Plan 06-04) | Per-line-item CGST/SGST/IGST with HSN/SAC codes pulled from inventory items and service catalog. Clinic state code for intra/inter-state determination. GST-compliant PDF template. Delivered as the final plan within Phase 6. |

### 5.10 Permissions

| Capability | Details |
|---|---|
| **Role-based access** (D-05) | Front Desk and Admin can create, view, and manage invoices. Clinicians cannot create invoices directly (clinical focus). Admin-only for refunds, voids, and billing settings changes. Solo vets use the Admin role which has full billing access. |

---

## 6. Success Metrics

| # | Metric | Target | Measurement |
|---|---|---|---|
| 1 | **Invoice generation from consultation** | User can generate an invoice that pulls consultation services and dispensed inventory items, with real-time stock validation before finalizing | Integration tests + manual QA |
| 2 | **Razorpay payment collection** | User can accept payment via Razorpay (UPI and card), and payment confirmation automatically updates invoice status via webhook | End-to-end payment flow test with Razorpay test mode |
| 3 | **Manual payment and status management** | User can mark invoices as paid or unpaid manually | Integration tests |
| 4 | **PDF export and printing** | User can print or export invoices as professional PDF with clinic header, line items, GST, and totals | PDF output verification |
| 5 | **GST compliance** | Invoices include full GST breakdown: CGST/SGST for intra-state, IGST for inter-state, with HSN/SAC codes per line item (after Plan 06-04) | Invoice content verification against GST Rule 46 |
| 6 | **Daily billing dashboard** | Billing dashboard shows summary cards: today's revenue, unpaid total, overdue count, recent payments, patients seen today | Screen state tests + manual QA |
| 7 | **Quick Sale functionality** | User can complete a counter sale via barcode scan or search, generate invoice, and collect payment | Manual QA of POS flow |
| 8 | **Split payment support** | User can record a split payment (e.g., Rs 1,000 cash + Rs 500 UPI) with both portions tracked correctly | Integration tests |
| 9 | **Refund processing** | Admin can process full and partial refunds for both digital (via Razorpay) and cash payments | Integration tests + Razorpay test mode |
| 10 | **Credit note issuance** | Admin can issue a credit note referencing an original invoice, with the outstanding balance correctly reduced | Integration tests |

---

## 7. User Stories & Requirements

### Invoice Creation

| ID | Story | Acceptance Criteria |
|---|---|---|
| BIL-01 | As a Front Desk user, I want to generate an invoice from a completed consultation so that dispensed items and services are billed accurately. | Draft invoice auto-populates dispensed items from inventory with correct quantities and selling prices. Front Desk can add services from the preset catalog with one tap. Custom services can be added with name and price. Line-item and invoice-level discounts (percentage or flat) are supported. Invoice linked to the specific pet and owner. |
| BIL-01a | As a Front Desk user, I want to create invoices independently from the Billing tab so I can bill for counter sales or missed charges. | Invoice can be created without a linked consultation. Front Desk selects from completed consultations without invoices (D-06). User selects a pet/owner, adds line items manually. Same builder interface as consultation-linked invoices. |
| BIL-01b | As a Front Desk user, I want a Quick Sale screen so I can quickly sell counter products (pet food, supplements) without creating a consultation. | Dedicated POS-like screen accessible from Billing tab FAB. Barcode scan adds product to cart (Phase 5 scanner). Manual product search available. Quantity steppers on cart items. Stock validation inline. "Generate Invoice" creates and finalizes in one step. Products recorded as counter sale stock movements (Phase 5 D-52). |

### Stock Validation

| ID | Story | Acceptance Criteria |
|---|---|---|
| BIL-02 | As a Front Desk user, I want the system to validate stock availability before I finalize an invoice so that I do not bill for items that are out of stock. | Stock check runs at finalization. Insufficient stock shows per-item error: "[Item Name] has insufficient stock ([available] available, [requested] requested)." Finalize button disabled until all items pass validation. |

### Payment Recording

| ID | Story | Acceptance Criteria |
|---|---|---|
| BIL-03 | As a Front Desk user, I want to mark invoices as paid or unpaid so I can track payment status for all invoices. | Cash payments marked manually via "Mark as Paid" button. Status updates immediately. Payment history records the amount, method, and timestamp. Split payments supported: cash portion marked immediately, digital portion tracked separately. Invoice status transitions correctly through the state machine (D-20). |

### PDF Export

| ID | Story | Acceptance Criteria |
|---|---|---|
| BIL-04 | As a user, I want to print or export an invoice as a PDF so I can provide professional documentation to pet owners. | PDF includes: clinic header (logo, name, address, phone, GSTIN), patient/owner info, line items table (services + products with qty, rate, amount), subtotal, discount line (if applicable), GST line, grand total, payment status, invoice number (INV-YYYYMM-XXXX), date, due date, footer text. Three share options: Print, WhatsApp, Download (D-16). Payment receipts generated as separate PDFs (D-13). Credit notes generate PDFs with "CREDIT NOTE" header. |

### Digital Payments

| ID | Story | Acceptance Criteria |
|---|---|---|
| BIL-05 | As a Front Desk user, I want to accept payment via Razorpay (UPI and card) so pet owners can pay digitally at the clinic or remotely. | Server creates Razorpay Payment Link via API (D-09). QR code displayed on clinic device for in-person scanning. Payment link URL copyable and shareable for remote collection. Link expires after 15 minutes with clear countdown timer (D-11). Failed payments show Razorpay error reason with retry option. Front Desk can regenerate expired/failed links or mark invoice as unpaid. |
| BIL-06 | As a user, I want payment confirmation to automatically update invoice status so I do not have to manually track digital payments. | Razorpay `payment_link.paid` webhook received and verified (HMAC-SHA256). Invoice status updated to Paid (or Partially Paid for split payments) automatically. Payment receipt auto-generated with transaction ID, amount, method, and timestamp (D-13). Webhook processing is idempotent. |

### GST Compliance

| ID | Story | Acceptance Criteria |
|---|---|---|
| BIL-07 | As a clinic owner, I want GST-compliant invoices so I can file accurate tax returns without additional accounting overhead. | Basic (initial delivery): Single configurable GST rate applied to all line items. Displayed as "GST @ X%: Rs Y" (D-08, D-17). GSTIN shown in clinic header if configured. Full (Plan 06-04 upgrade): Per-line-item CGST/SGST for intra-state and IGST for inter-state transactions. HSN/SAC codes per line item pulled from inventory items and service catalog. Clinic state code configured in settings for intra/inter-state determination. GST-compliant PDF template. |

### Reporting

| ID | Story | Acceptance Criteria |
|---|---|---|
| RPT-01 | As a clinic owner, I want to see a daily summary of billing activity so I can understand my clinic's financial performance at a glance. | Billing dashboard displays: Today's Revenue (total collected today), Unpaid Total (sum of all unpaid/overdue), Overdue Count (number of overdue invoices), Recent Payments (count received today), Patients Seen Today (D-24). Filterable invoice list by status, date range, and patient. Summary cards tappable: "Unpaid Total" filters to Unpaid + Overdue, "Overdue" filters to Overdue only. |

### Invoice Lifecycle

| ID | Story | Acceptance Criteria |
|---|---|---|
| BIL-LC-01 | As a Front Desk user, I want invoices to follow a clear lifecycle so I always know the current state of every invoice. | States: Draft (editable), Finalized (locked, printable, awaiting payment), Paid (full payment received), Partially Paid (split payment with portion pending), Unpaid (no payment), Overdue (unpaid past due date), Voided (cancelled). State transitions enforced by server-side state machine (D-20). |
| BIL-LC-02 | As a Front Desk user, I want finalized invoices to be locked so the billing record maintains audit trail integrity. | Finalized invoices cannot be edited (D-21). Corrections require: void and recreate (for full corrections), or issue a credit note (for partial corrections). Void prompts "Return dispensed items to stock?" with optional stock restoration via Phase 5 return flow (D-26). |
| BIL-LC-03 | As an Admin, I want to issue credit notes for corrections so I can adjust billing records without breaking the audit trail. | Credit note is a negative invoice referencing the original (D-22). Contains specific items and amounts being credited. Auto-numbered CN-YYYYMM-XXXX (D-19). Reduces outstanding balance on original invoice. Visible in invoice detail under "Linked Credit Notes." Generates its own PDF. |

### Refunds

| ID | Story | Acceptance Criteria |
|---|---|---|
| BIL-RF-01 | As an Admin, I want to process refunds so pet owners can receive their money back for cancelled or incorrect charges. | Full and partial refunds supported (D-12). Digital refunds processed via Razorpay Refund API (2-5 business days). Cash refunds tracked as manual adjustments. Split payment refunds: digital portion via Razorpay, cash portion marked as manually refunded. Admin-only permission (D-05). Confirmation bottom sheet with clear amount, method, and processing time display. |

### Navigation & Settings

| ID | Story | Acceptance Criteria |
|---|---|---|
| BIL-NV-01 | As a user, I want Billing as a bottom tab so I can access invoicing quickly as part of my daily workflow. | Bottom tabs: Queue, Patients, Inventory, Billing (D-28). Former 'More' items (settings, profile, reports) accessible via hamburger/drawer menu or settings gear icon. |
| BIL-NV-02 | As a user, I want to see a pet's invoice history on their profile so I can quickly review billing for a specific patient. | "Invoices" tab added to pet profile (Phase 3, D-25). Shows all invoices for that pet, newest first. Each row shows invoice number, amount, date, and status badge. Tap opens full invoice detail. |
| BIL-ST-01 | As an Admin, I want to configure billing settings so invoices reflect my clinic's details and tax configuration. | Settings include (D-29): GSTIN number, default GST rate (%), default due date (days from invoice date), clinic bank account details (for display on invoice), invoice footer text, Razorpay API keys (Key ID + Secret), test mode toggle. All optional except Razorpay keys for digital payments. |

---

## 8. Out of Scope

The following are explicitly excluded from Phase 6:

- **Automated overdue payment reminders** -- Overdue invoices are flagged and visible in the dashboard, but automated WhatsApp/SMS reminders are deferred to Phase 7 or post-Beta.
- **Revenue analytics with charts and trend lines** -- The billing dashboard shows summary metrics (today's revenue, unpaid total, overdue count), but time-series charts, revenue trends, and detailed financial analytics are post-Beta.
- **Multi-pet combined invoices** -- Each pet gets a separate invoice (D-27). Combined invoices covering multiple pets in a single document are deferred. Owners can pay multiple invoices at once via combined payment link.
- **Recurring invoices** -- For chronic treatment plans or subscription-like billing. Deferred to post-Beta if demand emerges.
- **Razorpay Checkout SDK (in-app)** -- Payment Links API is sufficient for Beta. The full in-app Checkout SDK with embedded payment UI is deferred.
- **WhatsApp invoice delivery with embedded pay links** -- PDF sharing via WhatsApp is supported, but embedded interactive pay links within WhatsApp messages require real WhatsApp Business API. Deferred to v2 (BIL-09).
- **Payment link generation shareable via WhatsApp/SMS** -- Basic link copying is supported; automated WhatsApp/SMS delivery of payment links is deferred to v2 (BIL-08).
- **Offline invoice creation** -- Invoice creation and payment collection require connectivity. Cached invoices are viewable offline, but creating or modifying invoices offline is deferred to Phase 10.
- **Multi-currency support** -- All amounts are in INR (Indian Rupees). No currency conversion or multi-currency invoicing.
- **Inventory purchase invoicing (accounts payable)** -- Phase 6 covers only sales invoices (accounts receivable). Purchase invoicing from suppliers is out of scope.
- **GST e-invoicing (IRN generation via NIC/GSP)** -- E-invoicing via the government's Invoice Registration Portal is not in scope. Relevant only for businesses above the e-invoicing threshold.
- **GST return filing (GSTR-1, GSTR-3B)** -- The system generates GST-compliant invoices but does not file returns.
- **Estimates / quotations** -- No pre-invoice estimate document. Invoices are the only billing document.
- **Loyalty programs / reward points** -- No customer loyalty or rewards features.
- **Web dashboard billing views** -- Phase 9. Mobile-only in Phase 6.
- **Owner portal invoice history** -- Phase 9. Pet owners do not have a self-service portal in Phase 6.
- **Accounting integration (Tally, Zoho Books)** -- No direct integration with accounting software.

---

## 9. Dependencies & Risks

### Dependencies

| Dependency | Type | Impact |
|---|---|---|
| **Phase 5 (Inventory) -- Dispensed items, counter sales, stock** | Internal | Invoice line items pull from dispensed inventory records (D-50). Counter sales link to Phase 5 stock movements (D-52). Void stock restoration uses Phase 5 return flow (D-51). FIFO dispensing and selling prices are Phase 5 responsibilities. Phase 5 must be complete before Phase 6 can function fully. |
| **Phase 4 (EMR) -- End Consultation flow** | Internal | End Consultation triggers draft invoice creation with dispensed items (D-03). Consultation services linked to invoice line items. If Phase 4 is incomplete, the primary invoice creation path is unavailable. Mitigation: independent invoice creation from Billing tab still works. |
| **Phase 3 (Patients) -- Pet profile and owner data** | Internal | Invoice headers require pet and owner data. Pet profile needs modification to add the Invoices tab (D-25). Patient search powers invoice search. Phase 3 is complete. |
| **Phase 2 (Design System) -- Component library** | Internal | All billing UI is built from Phase 2 components: summary cards, filter chips, bottom sheets, FABs, status badges, search bar, cards, form fields. Phase 2 is complete. |
| **Razorpay Payment Links API** | External service | Digital payment collection depends on Razorpay API availability and the clinic having valid API keys configured. Razorpay test mode available for development and testing. |
| **Razorpay Refund API** | External service | Digital refund processing. Cash refunds work independently. |
| **Razorpay Webhooks** | External service | Automatic payment status updates depend on webhook delivery. Webhook endpoint must be publicly accessible. Must handle failures gracefully with manual fallback. |
| **react-native-qrcode-svg** | npm dependency | QR code rendering for payment links on the clinic device. |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Razorpay Payment Link creation failures** | Medium | High -- owners cannot pay digitally | Implement retry logic. Show clear error to Front Desk with manual fallback (mark as unpaid, collect cash). Log failures for debugging. Support Razorpay test mode for development. |
| **Webhook delivery failures or delays** | Medium | High -- invoice status not updated automatically | Implement idempotent webhook processing (handle duplicate deliveries). Provide manual "Check Payment Status" button that queries Razorpay API directly. Webhook signature verification prevents spoofing. Log all webhook events. |
| **Split payment accounting errors** | Low | High -- incorrect revenue tracking | Thorough validation: cash + digital amounts must equal invoice total. Database constraints on payment amounts. Integration tests covering all split payment scenarios. |
| **Invoice numbering collisions under concurrency** | Low | High -- duplicate invoice numbers violate GST compliance | PostgreSQL advisory locks for sequence generation (Plan 06-02). Per-clinic, per-month sequences. Database unique constraint as safety net. |
| **GST rate misconfiguration** | Medium | Medium -- incorrect tax on invoices | Default GST rate clearly labeled in settings. Validation on rate range. Rate changes apply only to new invoices (existing invoices unaffected). |
| **Clinics operating without Razorpay keys** | High | Medium -- digital payments unavailable | Cash payment works without any configuration. Clear messaging when Razorpay keys are missing: "Configure Razorpay in Settings to accept digital payments." Billing dashboard and invoice creation fully functional without Razorpay. |
| **PDF generation performance on mid-range Android** | Medium | Medium -- slow invoice generation | Use expo-print (HTML-to-PDF) with optimized HTML templates. Same approach validated in Phase 4. Generate on demand (not proactively). Show loading indicator during generation. |
| **Owner pays via UPI outside the Razorpay link** | High | Low -- payment received but not tracked | Common scenario: owner scans a personal QR code or transfers directly. Front Desk uses "Mark as Paid" (cash method) as a manual fallback. System is not responsible for tracking payments outside Razorpay. |
| **Stock out-of-sync between dispense and finalization** | Low | Medium -- billing for unavailable items | Real-time stock validation at finalization (BIL-02). If stock changes between consultation end and invoice finalization, validation catches it. Clear per-item error messages. |

---

## 10. Open Questions

| # | Question | Context | Owner |
|---|---|---|---|
| 1 | What is the default due date for invoices? | D-23 specifies a configurable default but does not define whether same-day walk-in invoices should default to 0 days (due immediately) versus a grace period. Most Indian vet clinics expect immediate payment. The UI spec suggests 0 (same-day) as the default. | Product |
| 2 | Should the Quick Sale screen require linking to a pet/owner, or allow anonymous counter sales? | D-04 describes counter sales for pet food and supplements. Some purchases may not need a patient record. However, anonymous sales break the one-invoice-per-pet model (D-27). | Product |
| 3 | How should the system handle the combined payment link for multiple invoices from the same owner? | D-27 states multi-pet owners get separate invoices but "can pay multiple at once via combined payment link." The exact UX for selecting which invoices to combine and creating a single Razorpay link needs definition. | Engineering + Product |
| 4 | What is the thermal printer integration approach? | D-16 lists Print as a share option, including thermal printer support (80mm receipt). Expo's print API sends to the OS print dialog, but thermal printers often need specific formatting. Is OS print dialog sufficient, or do we need direct Bluetooth/USB thermal printer support? | Engineering |
| 5 | Should the Billing tab FAB offer a third option beyond "From Consultation" and "Quick Sale"? | D-03 describes two creation paths (from consultation and independent), but a third option for manually creating an invoice for a selected patient (non-consultation charges like boarding fees) may be needed. | Product |
| 6 | What is the refund policy time limit, if any? | D-12 supports refunds but does not specify a time limit. Should there be a configurable window (e.g., 7 days, 30 days) after which refunds are no longer allowed through the system? | Product |
| 7 | How should the system handle Razorpay API key rotation? | D-29 includes Razorpay API key configuration. When a clinic rotates their keys, in-flight payment links created with old keys may fail. Need to define handling for this transition scenario. | Engineering |

---

*This is a Lightweight PRD for the invoicing and payments phase. Detailed technical design lives in the implementation plans (06-01-PLAN through 06-04-PLAN), UI specifications (06-UI-SPEC.md), and the context document (06-CONTEXT.md).*
