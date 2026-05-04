# Phase 6: Invoicing & Payments - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-04
**Phase:** 06-invoicing-payments
**Areas discussed:** Invoice creation flow, Payment integration, Invoice presentation & PDF, Invoice lifecycle & status, Billing tab navigation, Multi-pet invoicing, Clinic settings for billing

---

## Invoice Creation Flow

### How should invoices be created?

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-populate + manual add | Draft auto-populates dispensed items, vet manually adds services from catalog | ✓ |
| Fully manual | Vet builds entire invoice from scratch | |
| Fully automatic | System auto-generates everything including standard consultation fee | |

**User's choice:** Auto-populate + manual add
**Notes:** Matches Phase 5 D-50 auto-add pattern

### Service catalog design

| Option | Description | Selected |
|--------|-------------|----------|
| Preset + custom services | Ship with common presets, admin can add custom services | ✓ |
| Free-text line items only | No catalog, vet types name and price each time | |
| Visit-type linked pricing | Prices auto-set based on visit type | |

**User's choice:** Preset + custom services

### Invoice creation timing

| Option | Description | Selected |
|--------|-------------|----------|
| At End Consultation | Draft invoice presented when vet taps End Consultation | |
| Separate billing step | Invoice created independently from Billing tab | |
| Both paths | End Consultation prompts invoice + independent Billing tab creation | ✓ |

**User's choice:** Both paths

### Counter sale invoicing

| Option | Description | Selected |
|--------|-------------|----------|
| Quick invoice from dispense | Counter sale auto-creates simple invoice | |
| Separate counter sale screen | Dedicated Quick Sale screen, POS-like | ✓ |
| Same invoice flow | Counter sales through full invoice creation flow | |

**User's choice:** Separate counter sale screen

### Discount support

| Option | Description | Selected |
|--------|-------------|----------|
| Line-item + invoice-level discount | Percentage or flat discount on items or total | ✓ |
| Invoice-level discount only | Single discount on total | |
| No discounts for Beta | Keep simple, adjust prices manually | |

**User's choice:** Line-item + invoice-level discount

### Billing permissions

| Option | Description | Selected |
|--------|-------------|----------|
| Clinician + Front Desk + Admin | All clinical and admin roles can create invoices | |
| Front Desk + Admin only | Clinicians focus on clinical work | ✓ |
| Everyone except Inventory Manager | Maximum flexibility | |

**User's choice:** Front Desk + Admin only

### Consultation-to-billing handoff

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-queue for Front Desk | Draft invoice appears in pending queue | |
| Vet confirms, Front Desk finalizes | Vet reviews draft, then hands to Front Desk | |
| Front Desk pulls from completed visits | Front Desk creates invoices from completed consultations | ✓ |

**User's choice:** Front Desk pulls from completed visits

### Solo vet billing

| Option | Description | Selected |
|--------|-------------|----------|
| Admin role covers it | Solo vet uses Admin role with full access | ✓ |
| Clinician gets billing in solo mode | Auto-grant billing in single-user mode | |
| Always allow clinician billing | Clinicians can always create invoices | |

**User's choice:** Admin role covers it

### Per-service tax configuration

| Option | Description | Selected |
|--------|-------------|----------|
| Single tax rate for all | One GST rate applied to everything | ✓ |
| Per-service tax rate | Each service has its own rate | |
| No tax calculation for Beta | Vet handles tax manually | |

**User's choice:** Single tax rate for all services

---

## Payment Integration

### Payment collection flow

| Option | Description | Selected |
|--------|-------------|----------|
| In-app payment link | QR code on screen, owner scans to pay | |
| Owner's device payment page | Link sent to owner's phone | |
| Both QR + link | QR for in-person + shareable link for remote | ✓ |

**User's choice:** Both QR + link

### Cash payment support

| Option | Description | Selected |
|--------|-------------|----------|
| Cash + digital | Cash marking + Razorpay | |
| Digital only | Only Razorpay payments | |
| Cash + digital + split | Allow splitting bill between methods | ✓ |

**User's choice:** Cash + digital + split payment

### Failed/pending payment handling

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-retry + manual fallback | Retry on fail, 15-min timeout on pending | ✓ |
| Manual only | Front desk decides on failure | |
| You decide | Claude handles with standard patterns | |

**User's choice:** Auto-retry + manual fallback

### Refund support

| Option | Description | Selected |
|--------|-------------|----------|
| No refunds for Beta | Handle outside system | |
| Basic full refund only | Full refund via Razorpay | |
| Full + partial refunds | Both supported | ✓ |

**User's choice:** Full + partial refunds

### Razorpay integration mode

| Option | Description | Selected |
|--------|-------------|----------|
| Payment Links API | Server-side, no SDK needed | ✓ |
| Razorpay Checkout SDK | In-app SDK with full UX | |
| Both | Payment Links + Checkout SDK | |

**User's choice:** Payment Links API

### Split payment refund flow

| Option | Description | Selected |
|--------|-------------|----------|
| Refund digital via Razorpay, cash manually | Match refund to original method | ✓ |
| Refund from either method | Front desk chooses method | |
| You decide | Claude handles with standard patterns | |

**User's choice:** Refund digital portion via Razorpay, cash portion manually

### Payment receipts

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-generate receipt | Separate PDF receipt after payment | ✓ |
| Invoice doubles as receipt | Invoice gets PAID stamp | |
| You decide | Claude decides | |

**User's choice:** Auto-generate receipt

---

## Invoice Presentation & PDF

### Invoice content

| Option | Description | Selected |
|--------|-------------|----------|
| Full professional invoice | Clinic header, GSTIN, line items, tax, totals | ✓ |
| Minimal invoice | Clinic name, items, total only | |
| You decide | Claude designs based on Indian billing | |

**User's choice:** Full professional invoice

### Invoice numbering

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-sequential per clinic | INV-YYYYMM-XXXX format | ✓ |
| Custom prefix + auto-number | Admin sets prefix | |
| Simple sequential | INV-00001 | |

**User's choice:** Auto-sequential per clinic

### PDF sharing

| Option | Description | Selected |
|--------|-------------|----------|
| Print + WhatsApp + download | Three share options | ✓ |
| Download + print only | No WhatsApp sharing | |
| You decide | Claude decides | |

**User's choice:** Print + WhatsApp share + download

### GST display

| Option | Description | Selected |
|--------|-------------|----------|
| Basic GST line | Single rate, no breakdown | ✓ |
| No GST for Beta | Manual tax calculation | |
| Full GST breakdown | CGST/SGST, HSN/SAC codes | |

**User's choice:** Basic GST line

### In-app invoice view

| Option | Description | Selected |
|--------|-------------|----------|
| Full in-app view | Native screen with action buttons | ✓ |
| PDF-first | Summary card + PDF viewer | |
| You decide | Claude decides | |

**User's choice:** Full in-app invoice view

---

## Invoice Lifecycle & Status

### Invoice states

| Option | Description | Selected |
|--------|-------------|----------|
| Draft → Finalized → Paid/Unpaid | With Partially Paid and Overdue states | ✓ |
| Simple: Unpaid → Paid | No draft state | |
| Full accounting lifecycle | Draft → Issued → Sent → Viewed → etc. | |

**User's choice:** Draft → Finalized → Paid/Partially Paid/Unpaid/Overdue

### Finalized invoice editing

| Option | Description | Selected |
|--------|-------------|----------|
| Locked + void/credit note | Cannot edit, void and recreate | ✓ |
| Editable with audit trail | Changes logged but allowed | |
| Locked, no void | Permanently locked | |

**User's choice:** Locked + void/credit note

### Due dates

| Option | Description | Selected |
|--------|-------------|----------|
| Due date + overdue flag | Auto-flag overdue, no reminders | ✓ |
| No due dates | Just paid/unpaid | |
| Due date + automated reminders | With WhatsApp reminders | |

**User's choice:** Due date + overdue flag

### Billing dashboard

| Option | Description | Selected |
|--------|-------------|----------|
| Summary cards + invoice list | Revenue, unpaid, overdue cards + filterable list | ✓ |
| Invoice list only | Flat list, filterable | |
| Full analytics dashboard | Charts, trends, breakdowns | |

**User's choice:** Summary cards + filterable invoice list

### Pet profile invoice history

| Option | Description | Selected |
|--------|-------------|----------|
| Invoice tab on pet profile | Invoices tab showing billing history | ✓ |
| Billing section only | Access from Billing tab with filter | |
| Both | Two entry points | |

**User's choice:** Invoice tab on pet profile

### Void + stock restoration

| Option | Description | Selected |
|--------|-------------|----------|
| Prompt to restore stock | Ask on void, optional restore | ✓ |
| Auto-restore stock | Always restore on void | |
| Never restore stock | Manual stock adjustment | |

**User's choice:** Prompt to restore stock

### Credit notes

| Option | Description | Selected |
|--------|-------------|----------|
| Simple credit note | Negative invoice referencing original | ✓ |
| Adjustment on next invoice | Credit applied to next bill | |
| You decide | Claude decides | |

**User's choice:** Simple credit note

---

## Billing Tab Navigation

| Option | Description | Selected |
|--------|-------------|----------|
| Replace 'More' with Billing | Tabs: Queue, Patients, Inventory, Billing | ✓ |
| Under 'More' menu | Sub-item under More | |
| 5th bottom tab | Add Billing as 5th tab | |

**User's choice:** Replace 'More' with Billing

---

## Multi-Pet Invoicing

| Option | Description | Selected |
|--------|-------------|----------|
| One invoice per pet | Separate invoices, can pay together | ✓ |
| Combined invoice per owner | Single invoice covering all pets | |
| Owner chooses at payment | Per-pet invoices, combined payment | |

**User's choice:** One invoice per pet

---

## Clinic Settings for Billing

| Option | Description | Selected |
|--------|-------------|----------|
| Essential billing settings | GSTIN, GST rate, due date, bank details, footer, Razorpay keys | ✓ |
| Minimal settings | Just Razorpay keys and GST rate | |
| You decide | Claude determines needed settings | |

**User's choice:** Essential billing settings

---

## Claude's Discretion

- Invoice builder UI layout
- Quick Sale screen UX details
- Payment QR code display
- Refund confirmation flow UI
- Credit note creation wizard vs inline form
- Invoice list card design
- Due date calculation logic
- Receipt PDF layout
- Billing summary card styling
- Invoice search and filter UX

## Deferred Ideas

- Full GST with CGST/SGST/IGST and HSN/SAC codes (v2 BIL-07)
- WhatsApp invoice delivery with pay links (v2 BIL-09)
- Automated overdue reminders
- Revenue analytics charts
- Multi-pet combined invoices
- Recurring invoices
- Razorpay Checkout SDK
