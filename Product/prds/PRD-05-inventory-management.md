# PRD-05: Inventory Management

**Type:** Lightweight PRD
**Phase:** 05 - Inventory Management
**Status:** Draft
**Author:** Auto-generated
**Date:** 2026-08-03

---

## 1. Executive Summary

Phase 5 delivers a complete inventory management system for Breeyo, enabling veterinary clinics to track stock with barcode scanning, manage batches with expiry dates, enforce FIFO dispensing, receive alerts when items run low, generate want-lists for reordering, and maintain HSN/SAC codes for GST-compliant invoicing. The system works offline for barcode scanning, queuing operations locally and syncing when connectivity returns.

This phase sits at a critical junction in Breeyo's architecture: it consumes the auth and RBAC system (Phase 1), the design system (Phase 2), patient data patterns (Phase 3), and EMR prescription data (Phase 4) -- while providing the stock and pricing data that Phase 6 (Invoicing) requires for invoice line items and GST calculations. Inventory management is the third-highest pain point for solo vets after paperwork burden and record retrieval, with clinics losing an estimated Rs 800-2,000/month to expired stock, stockouts during consultations, and manual want-list preparation.

The module covers nine requirements (INV-01 through INV-09), eight implementation plans, and targets three user personas: Manager Mohan (primary -- manages all inventory), Dr. Priya (primary -- dispenses during consultation and sees stock alerts), and Receptionist Rekha (secondary -- can manage stock but cannot dispense).

---

## 2. Problem Statement

Indian veterinary clinics manage their medicine and supply inventory through a combination of paper registers, mental arithmetic, and periodic physical counts. This creates five interconnected problems:

**Expired stock goes undetected.** Without batch tracking or expiry alerts, expired drugs and vaccines sit on shelves until someone conducts a manual audit -- typically every 2-4 weeks. Expired items represent pure financial loss (Rs 500-2,000/month for a typical solo clinic) and a patient safety risk. Manager Mohan describes finding "three strips of expired Meloxicam worth Rs 800 at the back of the shelf" because "we always grab from the front."

**Stockouts disrupt consultations.** The vet discovers a critical drug is out of stock mid-consultation 2-3 times per week. This forces the assistant to rush to a nearby pharmacy or call a distributor for emergency delivery, making the pet owner wait 15-20 minutes. Dr. Priya's frustration: "Doctor gets angry when she needs Amoxicillin during a consultation and we're out."

**Want-list creation is manual and error-prone.** To prepare a reorder list, the inventory manager walks through the stockroom, opens every cabinet, counts items by hand, and types quantities into a WhatsApp message to each distributor. This process takes 30-45 minutes and frequently results in forgotten items or miscounts.

**No FIFO enforcement causes waste.** Newer stock gets placed in front, older stock gets pushed to the back. Without a system enforcing first-in-first-out dispensing, older batches expire while newer ones are consumed first, compounding the expired stock problem.

**GST compliance is manual.** Inventory items lack structured HSN/SAC codes and GST rates. When invoices are generated, the vet or their CA must manually look up and apply tax codes, leading to errors and filing delays. This problem cascades into Phase 6 (Invoicing) if not solved at the inventory level.

These problems are interconnected: lack of batch tracking causes FIFO failure, which causes expiry, which causes waste. Lack of par-level tracking causes stockouts, which disrupts consultations. Lack of structured item data (HSN/SAC) causes GST compliance failures downstream. A complete inventory management system solves the chain.

---

## 3. Target Users & Personas

### Primary: Manager Mohan -- Inventory Manager

- **Profile:** 38 years old, D.Pharm background, works at a mid-size clinic in Nagpur. Informally manages all inventory alongside surgery assistance and occasional front desk coverage. Owns a mid-range Android phone (Redmi Note series).
- **Inventory time:** ~60% of his working day, fragmented across 10-minute bursts between other duties.
- **Current tools:** Google Sheets on phone for stock counts (finds it tedious), WhatsApp for supplier coordination (sends want-lists as text messages to 4-5 distributors).
- **Phase 5 role:** Full inventory access -- adds items, receives stock with barcode scanning, manages batches and expiry, runs stock-takes, generates want-lists, sets par levels. Primary power user of every inventory feature.
- **Key workflow:** Morning check of attention alerts (low stock, expiring items) -> receives deliveries with barcode scan -> batch/lot/expiry entry -> weekly stock-take using scan-and-count mode -> generates want-list and shares via WhatsApp.
- **Success signal:** Gets an in-app alert saying "Amoxicillin 250mg: 4 strips remaining, below par level of 10" before the vet asks. Generates a want-list in one tap and shares it to a distributor via WhatsApp. Never finds expired stock on the shelf because the system warned him 30 days before expiry.

### Primary: Dr. Priya -- Admin + Clinician (Solo Vet)

- **Profile:** 34 years old, solo vet in Pune. Sees 20-25 patients/day, almost all walk-ins. One assistant (Rekha) handles front desk. No clinic computer; everything runs on her phone.
- **Phase 5 role:** Dispenses drugs during consultation (Clinician permission), views stock alerts on inventory tab, reviews want-lists. Does not typically manage stock receipts or run stock-takes (Mohan does this in larger clinics; in solo practice, she does everything).
- **Key workflow:** During consultation -> prescribes drug in EMR -> system suggests "Dispense from inventory?" -> confirms with one tap -> FIFO auto-selects oldest batch -> dispensed item auto-added to draft invoice.
- **Success signal:** Never discovers a drug is out of stock mid-consultation. Dispense-from-prescription flow takes one tap, not a manual stock check.

### Secondary: Receptionist Rekha -- Front Desk

- **Profile:** 27 years old, B.Com graduate, front desk at Dr. Priya's clinic. Comfortable with WhatsApp and basic phone apps. No veterinary training.
- **Phase 5 role:** Full inventory access for stock management (viewing, adding items, receiving stock, running stock-takes) but cannot dispense drugs. Stock management is operational; dispensing is a clinical action gated by role.
- **Key workflow:** Receives a delivery at the front desk -> opens barcode scanner -> scans items -> enters batch/lot/expiry -> stocks items. Checks inventory tab when a pet owner asks about drug availability.
- **Success signal:** Can scan and receive a 10-item delivery in under 5 minutes without writing in a register.

---

## 4. Strategic Context

### Market Positioning

Inventory management is one of the top three pain points cited by Indian solo vets (after paperwork burden and record retrieval), yet no competing veterinary PMS in India offers barcode scanning with offline capability, batch-level FIFO dispensing, and GST-ready HSN/SAC codes in a mobile-first package. Existing tools (Pet360, VetPort, VetBuddy) either lack inventory modules entirely, offer desktop-only stock management, or provide basic item lists without batch tracking. India's $2.8B TAM veterinary services market with 40,000+ clinics represents a significant opportunity for a mobile-first solution that addresses this pain point.

### Phase Dependency Chain

```
Phase 1 (Auth/RBAC) --> Phase 2 (Design System) --> Phase 3 (Patient/Queue)
                                                          |
                                                    Phase 4 (EMR)
                                                          |
                                                    Phase 5 (Inventory) <-- THIS PHASE
                                                          |
                                                    Phase 6 (Invoicing)
```

- **Consumes from Phase 1:** RBAC with four roles (Admin, Clinician, Front Desk, Inventory Manager) and per-user permission overrides. Multi-tenant RLS for clinic data isolation.
- **Consumes from Phase 2:** Design system components (Card, Badge, FAB, BottomSheet, SearchBar, FilterChips, Tabs, Modal, Toast, SkeletonLoader). Design tokens for colors, spacing, typography.
- **Consumes from Phase 3:** Search pattern (pg_trgm trigram search with debounce), timeline pattern (visit history reused for stock movement history), optional photo pattern, tabbed profile layout, Prisma RLS Client Extensions.
- **Consumes from Phase 4:** Prescription data triggers dispense suggestion (D-49). Consultation context links dispensed items to EMR records.
- **Provides to Phase 6:** Inventory items with selling prices, HSN/SAC codes, and GST rates flow into invoice line items. Dispensed stock auto-adds to draft invoices (D-50). Stock validation prevents invoicing items that are out of stock.
- **Provides to Phase 7:** Want-list WhatsApp share uses the WhatsApp abstraction layer for formatted text delivery.
- **Provides to Phase 10:** Offline barcode scanning foundation (expo-sqlite cache and pending operations queue) is hardened with full conflict resolution.

### Business Impact

| Metric | Current State (Manual) | With Breeyo Inventory |
|--------|----------------------|----------------------|
| Stock check time | 30-45 min manual walk-through | 2-3 min digital review on phone |
| Expired stock loss | Rs 500-2,000/month undetected | Near-zero with configurable expiry alerts |
| Mid-consultation stockouts | 2-3 per week | Eliminated with par-level alerts |
| Want-list preparation | 30-45 min manual count + WhatsApp typing | 1 tap to generate and share |
| Delivery receiving | 15-20 min manual register entry | 5-8 min with barcode scanning |
| GST compliance | Manual HSN lookup per invoice | Auto-populated from item master |

---

## 5. Solution Overview

### 5.1 Item Catalog Management (INV-01)

| Capability | Details |
|---|---|
| **Add inventory items** | Quick single-item form with name, category, unit, selling price. No bulk import or purchase order flow for Beta (D-01). |
| **Categories** | 7 predefined categories: Medicines, Vaccines, Surgical Supplies, Lab Consumables, Food & Supplements, Equipment, General Supplies. Admin can add custom categories (D-29). |
| **Units** | Predefined list: tablets, capsules, mL, strips, bottles, vials, sachets, kg, grams, pieces. Custom units allowed (D-05). |
| **Pricing** | Purchase price tracked per-batch (costs vary between receipts). Selling price on the item master. Enables margin calculation (D-03). |
| **Persistent catalog** | Items exist permanently even at zero stock (D-08). Zero-stock items are searchable for restocking. No hard delete. |
| **Separate items per dosage** | "Amoxicillin 250mg Tab" and "Amoxicillin 500mg Tab" are two distinct items. No parent/variant model (D-07). |
| **Schedule H tagging** | Items can be tagged as "Schedule H" with a visual badge. Awareness only for Beta -- no special dispensing logic (D-10). |
| **Optional notes and photos** | Free-text notes for storage instructions (D-12). Optional camera/gallery photo for visual identification, same pattern as pet photos in Phase 3 (D-34). |
| **HSN/SAC codes** (INV-09) | Each item carries an HSN (Harmonized System of Nomenclature) or SAC (Services Accounting Code) for GST classification. GST rate (0%, 5%, 12%, 18%, 28%) attached per item. Autocomplete from a predefined HSN code list. Flows through to invoice line items in Phase 6 (D-50). |

### 5.2 Stock Receipts & Batch Tracking (INV-02, INV-04)

| Capability | Details |
|---|---|
| **Stock receipt** | Each receipt creates a new batch entry (D-11). Fields: quantity received (single total-unit field, D-09), batch/lot number, expiry date, purchase price per unit, supplier (optional free-text, D-02), invoice number (optional), notes (optional). |
| **Batch/lot tracking** | Every batch has its own lot number, expiry date, purchase price, supplier, and received timestamp. Multiple batches per item tracked independently. |
| **Expiry date rules** | Mandatory for Medicine, Vaccine, and Consumable categories. Optional for Equipment, Accessories, General Supplies (D-27). |
| **Stock adjustments** | Manual add/remove with required reason from preset list: Damaged, Expired (disposed), Stock count correction, Returned by client, Sample/promo, Other (free text) (D-04). All adjustments logged in audit trail. |

### 5.3 Barcode Scanning (INV-03, INV-08)

| Capability | Details |
|---|---|
| **Full-screen camera scanner** | Camera fills screen with scan region guide and torch toggle (D-17). Scanned item appears as a bottom sheet overlay without leaving camera. |
| **Supported formats** | 1D barcodes only: EAN-13, EAN-8, UPC-A, Code 128, Code 39 (D-15). Covers virtually all pharmaceutical and veterinary product packaging in India. |
| **Quick actions on scan** | Scan resolves to item card showing current stock, batches, expiry. Quick-action buttons: Add Stock, Dispense, View Details (D-13). |
| **Multiple barcodes per item** | An item can have several barcodes linked to it. Handles rebranding and different pack sizes (D-16). |
| **Unknown barcode** | Prompts new item creation with barcode pre-filled: "Item not found. Create new item with this barcode?" (D-14). |
| **Continuous scanning** | Camera stays active after each scan for rapid consecutive scans. Ideal for stock-taking (D-18). |
| **Manual entry** | Numeric input field alongside camera button for damaged barcodes or poor lighting. Number pad auto-opens (D-20). |
| **Offline scanning** | Camera works offline (D-19). Barcodes matched against local item cache (expo-sqlite, synced to device). Stock updates queued locally and synced on reconnect. Yellow "Offline" banner visible. |

### 5.4 FIFO Dispensing (INV-05)

| Capability | Details |
|---|---|
| **Auto-select oldest batch** | System automatically picks the oldest non-expired batch first when dispensing (D-22). Cascades across batches if quantity exceeds single batch. |
| **Manual override** | Vet can override FIFO to select a specific batch (e.g., opened vial takes priority). Smart default with flexibility for reality. |
| **Expired batch blocking** | Expired batches get red "Expired" badge. System blocks dispensing from expired batches (D-25). Must manually dispose via stock adjustment with "expired disposal" reason. |
| **FIFO allocation display** | Dispense screen shows which batches will be consumed and in what quantities before confirmation. |
| **Cross-phase dispensing** | When vet prescribes in EMR (Phase 4), system suggests "Dispense from inventory?" with auto-matched item and FIFO batch (D-49). Dispensed item auto-added to draft invoice with selling price (D-50). |
| **Counter sale** | Dispense without active consultation for OTC sales (pet food, supplements, accessories) (D-52). Creates a "counter sale" record. |
| **Return to stock** | Simple reverse flow restoring quantity to original batch with reverse movement entry (D-51). |

### 5.5 Par-Level Alerts & Want-Lists (INV-06, INV-07)

| Capability | Details |
|---|---|
| **Par-level thresholds** | Per-item threshold ("alert when stock falls below X"). No reorder quantity -- vet decides how much to order (D-06). Settable by Admin and Inventory Manager roles only (D-44). |
| **Attention card** | Combined "Attention Needed" card on inventory list screen with tabs: Low Stock (count), Expiring Soon (count), Expired (count) (D-26). Tap a tab to see affected items. |
| **In-app badge** | Inventory tab shows badge count of alerts (D-23). No push notifications for Beta. |
| **Want-list** | Dedicated screen showing all items below par level with current stock, par level, and suggested order quantity (D-24). |
| **WhatsApp share** | "Share via WhatsApp" button generates plain text in format: "Breeyo Want-List (date)\n1. Amoxicillin 250mg - Current: 5, Par: 50\n2. ..." (D-28). Shared via native share sheet (expo-sharing). Matches Indian business communication patterns. |
| **Expiry alerts** | Configurable lead time: 15, 30 (default), 60, or 90 days before expiry triggers warning (D-21). Admin configurable in clinic settings. |

### 5.6 Stock-Take (D-37 through D-40)

| Capability | Details |
|---|---|
| **Scan + count mode** | Uses continuous scanning (D-18) for fast physical counting. Scan barcode, enter physical count, next item (D-38). |
| **Discrepancy detection** | System calculates difference between physical count and system count. Over/under displayed per item. |
| **Auto-adjustment** | Discrepancies create stock adjustment movements with "stock-take" reason automatically (D-37). Transaction re-reads current stock before calculating diff to handle concurrent operations. |
| **Session summary** | After completing: items counted, discrepancies found (over/under), total value difference (D-40). Saveable as record. No formal PDF export for Beta. |
| **24-hour session persistence** | Stock-take session persists for 24 hours (Zustand + local storage) to accommodate multi-session counts. |
| **No enforcement** | Vet does stock-take whenever they want. No mandatory schedule or reminders (D-39). |

### 5.7 Stock Movement History (D-45 through D-48)

| Capability | Details |
|---|---|
| **Append-only audit log** | Every stock event recorded: received, dispensed, adjusted (with reason), disposed (expired), stock-take correction, returned. Each entry: date, user, type, quantity change, batch reference, running total (D-45). |
| **Chronological timeline** | Newest first, each entry as a row with action icon, quantity (+/-), batch ref, user name, running total. Same pattern as pet visit history from Phase 3 (D-46). |
| **CSV export** | Stock movement history downloadable as CSV from item profile (D-47). UTF-8 BOM for Excel compatibility. Uses papaparse for generation. |
| **Rolling retention** | Last 12 months of movement history retained. Older records archived (D-48). |

### 5.8 Item Browsing & Search (D-29 through D-36)

| Capability | Details |
|---|---|
| **Summary header** | Top of Inventory tab shows summary cards: Total Items, Low Stock count, Expiring Soon count, Total Inventory Value (D-32). |
| **Card list** | Each item as a card showing: name, category icon, current stock (color-coded green/yellow/red), selling price, nearest expiry badge (D-30). Matches Phase 2 balanced density (D-32). |
| **Live search** | Debounced search bar covering item name, barcode number, and category (D-31). Same pg_trgm pattern as patient search in Phase 3. |
| **Category filter chips** | Filter chips below search bar for all categories (D-31). |
| **Sort options** | Name (A-Z, default), Stock level (low first), Recently added, Expiring soon, Category (D-36). |
| **Tabbed item profile** | Top: item name, category, photo, prices, total stock. Tabs: Batches (lot/expiry/qty per batch), History (stock movement timeline), Details (notes, barcodes, unit, supplier, HSN/SAC) (D-33). |

### 5.9 Role Permissions (D-41 through D-44)

| Role | Capabilities |
|---|---|
| **Inventory Manager** | Full inventory access: add items, update stock, scan barcodes, do stock-takes, set par levels, view reports. Cannot access EMR, queue, or billing (D-41). Can dispense (D-43). |
| **Front Desk** | Full stock access (same as Inventory Manager for viewing, adding, receiving, stock-takes). Cannot dispense (D-42, D-43). |
| **Clinician** | Dispensing only. Cannot manage stock, set par levels, or change prices (D-43). |
| **Admin** | Full inventory access plus pricing management. Can override per-user permissions (D-44). |

---

## 6. Success Metrics

| # | Metric | Target | Measurement Method |
|---|---|---|---|
| 1 | **Add items and update stock** | User can create inventory items (name, category, unit, price, HSN/SAC) and update stock quantities manually with required reason codes | Integration tests + manual QA |
| 2 | **Barcode scanning including offline** | User can scan 1D barcodes with phone camera to identify items, with quick actions (Add Stock, Dispense, View Details). Scanning works offline with local cache; operations queue and sync on reconnect | Manual device testing (requires physical camera), unit tests for lookup/queue logic |
| 3 | **Batch/lot + expiry tracking, FIFO dispensing** | User can record batch/lot numbers and expiry dates per stock receipt. System auto-selects oldest non-expired batch for dispensing (FIFO), blocks expired batch dispensing, and allows manual override | Unit tests for FIFO logic (multi-batch, expired blocking, override), integration tests |
| 4 | **Par-level alerts when stock below threshold** | User can set par-level thresholds per item. Inventory tab shows badge count. Attention card shows tabbed breakdown (Low Stock, Expiring Soon, Expired) | Unit tests for alert queries, UI verification |
| 5 | **Want-lists of items below par level** | System generates want-list of all items below par level. User can share via WhatsApp as formatted plain text | Unit tests for want-list generation, manual WhatsApp share test |
| 6 | **HSN/SAC codes flow to invoice line items** | Each item carries HSN/SAC code and GST rate. These values are available to Phase 6 billing module for invoice line item construction | Integration test verifying HSN/GST data availability in billing API |

---

## 7. User Stories & Requirements

### 7.1 Item Catalog Management

#### US-INV-01: Add Inventory Item

**As** Manager Mohan (Inventory Manager),
**I want to** add a new inventory item with its name, category, unit of measure, and selling price,
**so that** I can track it in the system and receive alerts when it runs low.

**Acceptance Criteria:**
- [ ] Item creation form collects: name (required), category (required, from predefined + custom list), unit of measure (required, from predefined + custom list), selling price (required, decimal with 2 places).
- [ ] Optional fields: notes, photo (camera/gallery), Schedule H toggle, par level.
- [ ] Item is created with `isActive = true` and belongs to the current clinic (tenant-scoped via RLS).
- [ ] Newly created item appears in the inventory list immediately.
- [ ] Duplicate item names within the same clinic are allowed (different dosages/forms are separate items per D-07).
- [ ] Form validates all required fields before submission with inline error messages.
- [ ] Item persists in catalog permanently even when stock reaches zero (D-08).

#### US-INV-02: Edit Inventory Item

**As** Manager Mohan,
**I want to** edit an existing inventory item's details (name, category, price, par level, notes),
**so that** I can correct errors or update pricing without creating a new item.

**Acceptance Criteria:**
- [ ] Edit form pre-populates all current item fields.
- [ ] Changes to selling price do not retroactively affect existing stock movements or past invoices.
- [ ] Changes to par level immediately update alert status (item may enter or leave the low-stock alert list).
- [ ] Edit is logged with timestamp and user for audit purposes.
- [ ] Only Admin and Inventory Manager roles can edit prices and par levels (D-44).

#### US-INV-03: Search and Browse Inventory

**As** Dr. Priya (Clinician),
**I want to** search for an inventory item by name or barcode number and filter by category,
**so that** I can quickly find a drug during a consultation.

**Acceptance Criteria:**
- [ ] Debounced search bar at top of inventory list (same pattern as patient search, 200-500ms debounce).
- [ ] Search covers item name (trigram search via pg_trgm) and barcode number.
- [ ] Category filter chips below search bar: All, Medicines, Vaccines, Surgical Supplies, Lab Consumables, Food & Supplements, Equipment, General Supplies, plus any custom categories.
- [ ] Multiple sort options: Name (A-Z, default), Stock level (low first), Recently added, Expiring soon, Category (D-36).
- [ ] Each item displayed as a card showing: name, category icon, current total stock (color-coded green/yellow/red per stock level thresholds), selling price, nearest expiry badge if applicable (D-30).
- [ ] Summary header at top shows: Total Items, Low Stock count, Expiring Soon count, Total Inventory Value (D-32).

#### US-INV-04: View Item Profile

**As** Manager Mohan,
**I want to** view a complete profile for an inventory item including its batches, stock movement history, and details,
**so that** I can understand the full status and history of any item.

**Acceptance Criteria:**
- [ ] Top section shows: item name, category, photo (if set), selling price, total current stock, par level.
- [ ] Tabbed layout below with three tabs: Batches, History, Details (D-33).
- [ ] **Batches tab:** Lists all active batches with lot number, expiry date (with status badge), remaining/initial quantity, purchase price, supplier. Ordered by received date (oldest first for FIFO visibility).
- [ ] **History tab:** Chronological stock movement timeline (newest first). Each row shows: action icon (received/dispensed/adjusted/disposed/returned), quantity (+/-), batch reference, user name, running total, timestamp (D-46).
- [ ] **Details tab:** Full item metadata -- notes, all linked barcodes, unit, HSN/SAC code, GST rate, Schedule H status, creation date, last modified date.
- [ ] "Edit" button in header navigates to edit form.
- [ ] "Dispense" and "Add Stock" action buttons accessible from profile.
- [ ] CSV export button on History tab exports stock movement data (D-47).

### 7.2 Stock Management

#### US-INV-05: Receive Stock with Batch Tracking

**As** Manager Mohan,
**I want to** record a stock receipt with quantity, batch/lot number, expiry date, purchase price, and supplier,
**so that** every unit of incoming stock is tracked from receipt to dispensing.

**Acceptance Criteria:**
- [ ] Stock receipt form collects: quantity received (required, positive integer), batch/lot number (optional), expiry date (required for medicine/vaccine/consumable categories, optional otherwise per D-27), purchase price per unit (optional, decimal), supplier name (optional free-text, D-02), invoice number (optional), notes (optional).
- [ ] Every receipt creates a new batch entry (D-11). No merging with existing batches.
- [ ] Stock movement of type "received" created with positive quantity and running total.
- [ ] Item total stock is updated (sum of all batch current quantities).
- [ ] If item was below par level before receipt, alert status updates accordingly.
- [ ] Receipt form accessible from: item profile, barcode scan quick actions, and inventory list.

#### US-INV-06: Adjust Stock Manually

**As** Manager Mohan,
**I want to** manually adjust stock quantities up or down with a required reason,
**so that** discrepancies are corrected with a clear audit trail for shrinkage patterns.

**Acceptance Criteria:**
- [ ] Adjustment bottom sheet shows: item name, current stock, adjustment type (Add/Remove), quantity stepper, new stock preview, reason picker (required).
- [ ] Reason picker options: Damaged, Expired (disposed), Stock count correction, Returned by client, Sample/promo, Other (with free text input) (D-04).
- [ ] Adjustment without a reason is blocked (form validation).
- [ ] Stock movement of type "adjusted" created with quantity (positive for add, negative for remove), reason, and running total.
- [ ] Adjustment logged with user ID, timestamp, and optional notes.
- [ ] "Remove" adjustment cannot reduce stock below zero.

#### US-INV-07: Return to Stock

**As** Dr. Priya,
**I want to** return previously dispensed items to stock,
**so that** accidental or cancelled dispenses do not permanently reduce inventory.

**Acceptance Criteria:**
- [ ] "Return to stock" action available on dispensing records in the stock movement history.
- [ ] Return restores quantity to the original batch.
- [ ] Stock movement of type "returned" created with positive quantity, referencing the original batch and dispense movement.
- [ ] Item total stock updated accordingly.
- [ ] Return logged with user ID and timestamp.

### 7.3 Barcode Scanning

#### US-INV-08: Scan Barcode to Identify Item

**As** Manager Mohan,
**I want to** scan a product's barcode with my phone camera and immediately see its item details with quick action buttons,
**so that** I can receive stock or dispense items without manual lookup.

**Acceptance Criteria:**
- [ ] Full-screen camera viewfinder with scan region guide (alignment box) and torch toggle (D-17).
- [ ] Supports 1D barcode formats: EAN-13, EAN-8, UPC-A, Code 128, Code 39 (D-15).
- [ ] On successful scan: haptic feedback (medium impact), item card appears in bottom sheet showing: item name, barcode number, current stock, batch summary.
- [ ] Quick action buttons on scan result: "Receive Stock", "Dispense", "View Item" (D-13).
- [ ] Camera stays active after scan for continuous scanning mode (D-18).
- [ ] Scanned items accumulate in a list within the bottom sheet for batch operations.
- [ ] "Enter Manually" button always visible for numeric barcode input (D-20).
- [ ] Duplicate scan of same barcode within 1500ms is debounced (no duplicate haptics or list entries).

#### US-INV-09: Handle Unknown Barcode

**As** Manager Mohan,
**I want** an unknown barcode to prompt me to create a new inventory item with the barcode pre-filled,
**so that** I can quickly catalog new products as I scan them for the first time.

**Acceptance Criteria:**
- [ ] When a scanned barcode does not match any item in the clinic's catalog, a prompt appears: "Item not found. Create new item with this barcode?" (D-14).
- [ ] "Create Item" button navigates to the new item form with barcode pre-filled.
- [ ] "Cancel" dismisses the prompt and re-activates the scanner.
- [ ] If offline, the prompt notes: "You may need to sync when online -- this barcode may already exist on the server."

#### US-INV-10: Link Multiple Barcodes to One Item

**As** Manager Mohan,
**I want** to link multiple barcodes to a single inventory item,
**so that** rebranded products or different pack sizes of the same item all resolve to one catalog entry.

**Acceptance Criteria:**
- [ ] Item profile Details tab shows all linked barcodes.
- [ ] "Add Barcode" action available on item profile (scan or manual entry).
- [ ] Barcode is unique per clinic -- attempting to link a barcode already assigned to another item shows an error with the conflicting item name.
- [ ] All linked barcodes resolve to the same item when scanned (D-16).

#### US-INV-11: Scan Barcodes Offline

**As** Manager Mohan,
**I want to** scan barcodes and queue stock operations even when the stockroom has no WiFi signal,
**so that** I can receive a delivery in the stockroom without walking to the front desk for connectivity.

**Acceptance Criteria:**
- [ ] Yellow "Offline" banner visible at top of scanner screen when device is offline (D-19).
- [ ] Barcode lookup uses local cache (expo-sqlite) synced from server. Cached data includes: barcode-to-item mapping, item name, current batches, and recent stock levels.
- [ ] Stock operations (receive, dispense, adjust) queued locally in expo-sqlite pending_operations table with sequential timestamps.
- [ ] Pending operations badge/count visible on the offline banner.
- [ ] On reconnect: pending operations replayed to server in strict FIFO order (oldest first). Replay stops on first failure for retry (no skipping ahead).
- [ ] Barcode cache syncs incrementally on every app foreground event.
- [ ] "Last synced X minutes ago" timestamp visible in scanner screen.

### 7.4 FIFO Dispensing

#### US-INV-12: Dispense with FIFO Auto-Selection

**As** Dr. Priya,
**I want** the system to automatically select the oldest non-expired batch when I dispense a drug,
**so that** older stock is consumed first and expiry waste is minimized.

**Acceptance Criteria:**
- [ ] Dispense screen shows available batches in FIFO order (oldest first by received date).
- [ ] System auto-selects oldest non-expired batch(es) for the requested quantity (D-22).
- [ ] If quantity exceeds the oldest batch, allocation cascades to the next batch. FIFO allocation breakdown is displayed (e.g., "Batch A: 12 capsules, Batch B: 2 capsules").
- [ ] Quantity stepper with +/- buttons and direct input for quantity selection.
- [ ] Total available stock displayed. Cannot dispense more than available.
- [ ] "Confirm Dispense" button creates stock movement(s) of type "dispensed" with negative quantities.
- [ ] Item total stock updated. If stock falls below par level, alert triggers.

#### US-INV-13: Override FIFO Batch Selection

**As** Dr. Priya,
**I want to** override the auto-selected batch and choose a specific one (e.g., an already-opened vial),
**so that** FIFO is a smart default but doesn't prevent practical dispensing decisions.

**Acceptance Criteria:**
- [ ] Each batch row on the dispense screen is tappable to select it manually.
- [ ] Manual selection overrides FIFO auto-selection for that dispense operation.
- [ ] Override is noted in the stock movement record for audit purposes.
- [ ] System still blocks dispensing from expired batches even with manual override (D-25).

#### US-INV-14: Block Expired Batch Dispensing

**As** a system safety rule,
**the system must** prevent dispensing from expired batches,
**so that** expired medication is never accidentally given to a patient.

**Acceptance Criteria:**
- [ ] Expired batches are visually flagged with red "EXPIRED" badge in the batch list (D-25).
- [ ] Attempting to dispense from an expired batch shows an error: "Cannot dispense from expired batch. Please dispose via stock adjustment."
- [ ] FIFO auto-selection skips expired batches entirely.
- [ ] Expired batches can only be reduced via stock adjustment with "Expired (disposed)" reason.
- [ ] A daily background process marks batches as expired when their expiry date passes.

#### US-INV-15: Dispense from Prescription (Cross-Phase)

**As** Dr. Priya,
**I want** my prescription in EMR to suggest dispensing from inventory with one tap,
**so that** the consultation-to-dispense-to-invoice flow is seamless.

**Acceptance Criteria:**
- [ ] When a prescription is written in EMR (Phase 4), system matches the drug name to an inventory item and suggests "Dispense from inventory?" (D-49).
- [ ] If matched, the dispense screen opens pre-populated with the item, quantity from prescription, and FIFO batch allocation.
- [ ] Dispensing is optional -- vet can prescribe without dispensing.
- [ ] Dispensed item auto-added to the patient's draft invoice with selling price, HSN/SAC code, and GST rate (D-50).
- [ ] Stock movement records the consultation ID for traceability.
- [ ] If item is out of stock, dispense suggestion shows "Out of stock" with current level.

#### US-INV-16: Counter Sale (Standalone Dispense)

**As** Rekha (Front Desk) or Manager Mohan,
**I want to** dispense items without an active consultation for over-the-counter sales,
**so that** pet food, supplements, and accessories can be sold directly.

**Acceptance Criteria:**
- [ ] "Dispense" button on item profile works without linking to a consultation (D-52).
- [ ] Creates a "counter sale" stock movement record.
- [ ] Counter sale can be linked to a quick sale invoice (Phase 6 integration).
- [ ] Dispensing permission required: only Clinician and Inventory Manager roles can dispense (D-43). Front Desk cannot.

### 7.5 Alerts & Want-Lists

#### US-INV-17: View Attention Card with Low Stock, Expiring, and Expired Items

**As** Manager Mohan,
**I want to** see a single dashboard card showing how many items are low on stock, expiring soon, or already expired,
**so that** I can address urgent inventory issues first thing each morning.

**Acceptance Criteria:**
- [ ] "Attention Needed" card appears at top of inventory list (below summary header) when any alerts exist (D-26).
- [ ] Card has three tabs: "Low Stock (N)", "Expiring Soon (N)", "Expired (N)" with counts.
- [ ] **Low Stock tab:** Lists items where current total stock < par level. Shows item name, current stock, par level.
- [ ] **Expiring Soon tab:** Lists batches expiring within the configured lead time (default 30 days, configurable 15/30/60/90 days per D-21). Shows item name, batch number, expiry date, remaining quantity.
- [ ] **Expired tab:** Lists batches past their expiry date with remaining stock > 0. Shows item name, batch number, expiry date, remaining quantity, "Dispose" action.
- [ ] Card collapses when no alerts exist.
- [ ] Inventory tab in bottom navigation shows badge count (total alerts across all three categories, D-23).

#### US-INV-18: Generate and Share Want-List

**As** Manager Mohan,
**I want to** generate a list of all items below par level and share it via WhatsApp to my distributor,
**so that** I can reorder without manually counting and typing a message.

**Acceptance Criteria:**
- [ ] Dedicated want-list screen accessible from inventory list (button or navigation).
- [ ] Lists all items where current stock < par level. Each row shows: item name, current stock ("Have"), par level ("Need"), suggested order quantity (par minus current).
- [ ] Total items count at bottom.
- [ ] "Share via WhatsApp" button generates plain text in format (D-28):
  ```
  Breeyo Want-List (03 Aug 2026)
  Priya Vet Clinic
  ---
  1. Amoxicillin 250mg - Current: 5, Par: 50
  2. Metronidazole 400mg - Current: 3, Par: 15
  3. Disposable Syringes 5ml - Current: 8, Par: 50
  ---
  Generated by Breeyo
  ```
- [ ] Text shared via native share sheet (expo-sharing) so user can pick WhatsApp or any messaging app.
- [ ] "Export CSV" button generates a CSV file with the same data for record-keeping.

### 7.6 Stock-Take

#### US-INV-19: Conduct Physical Stock-Take

**As** Manager Mohan,
**I want to** scan items and enter their physical count during a stock-take, with the system calculating discrepancies automatically,
**so that** I can reconcile my actual stock with the system in 10 minutes instead of 45.

**Acceptance Criteria:**
- [ ] Stock-take screen shows: session start time, items counted / total items, search/scan entry.
- [ ] User scans barcode or searches for item, enters physical count. System shows: system count, physical count, difference (over/under) (D-37, D-38).
- [ ] Uses continuous scanning mode for rapid counting -- scan, count, next item.
- [ ] Items with discrepancies highlighted (red for under, green for over).
- [ ] Session persists for 24 hours (Zustand + local storage) to accommodate multi-session counts.
- [ ] "Finish Stock-Take" button shows summary: items counted, discrepancies found (count), total value difference (D-40).
- [ ] On confirmation, stock adjustment movements created automatically with "stock-take" reason for all discrepancies. Transaction re-reads current stock before calculating adjustment to handle concurrent operations.
- [ ] No enforcement on frequency -- vet does stock-take whenever they want (D-39).

### 7.7 HSN/SAC & GST

#### US-INV-20: Assign HSN/SAC Code and GST Rate to Item

**As** Dr. Priya (Admin),
**I want to** assign an HSN code and GST rate to each inventory item,
**so that** when I generate an invoice, the tax calculation and GST filing data are pre-populated correctly.

**Acceptance Criteria:**
- [ ] Item create/edit form includes: HSN/SAC code field (max 8 chars) with autocomplete from predefined veterinary-relevant HSN code list, GST rate picker (0%, 5%, 12%, 18%, 28%).
- [ ] HSN/SAC code is optional but recommended (warning shown if empty on items in Medicine/Vaccine categories).
- [ ] Default GST rate suggested based on category (e.g., 12% for most medicines).
- [ ] HSN code and GST rate visible on item profile Details tab.
- [ ] When item is dispensed and added to an invoice draft (D-50), HSN/SAC code and GST rate are included in the invoice line item data for Phase 6 consumption.
- [ ] HSN code constants stored in shared package (`@breeyo/validators` or `@breeyo/types`) for reuse across API and mobile.

### 7.8 Role-Based Access

#### US-INV-21: Enforce Inventory Role Permissions

**As** Dr. Priya (Admin),
**I want** inventory actions to be gated by role,
**so that** staff can only perform inventory operations appropriate to their responsibilities.

**Acceptance Criteria:**
- [ ] **View inventory:** Admin, Clinician, Inventory Manager, Front Desk (D-41, D-42).
- [ ] **Manage stock** (add items, receive stock, adjust, stock-take): Admin, Inventory Manager, Front Desk (D-42).
- [ ] **Dispense:** Admin, Clinician, Inventory Manager only. Front Desk cannot dispense (D-43).
- [ ] **Set prices and par levels:** Admin, Inventory Manager only (D-44).
- [ ] **Export data (CSV):** Admin, Inventory Manager only.
- [ ] Per-user permission overrides from Phase 1 (D-16) are respected.
- [ ] Unauthorized actions return 403 from API. UI hides or disables unauthorized actions.

---

## 8. Out of Scope

The following are explicitly excluded from Phase 5:

- **Bulk purchase orders / PO flow.** Individual item add only. Bulk receipt from purchase orders is a future enhancement. Solo vets receive 5-10 items at a time from local distributors (D-01).
- **Supplier directory / entity management.** Supplier is a free-text field on stock receipts, not a managed entity with address, contact, and ordering history (D-02).
- **Reorder quantity / automatic reordering.** Par level triggers an alert only. No auto-generated purchase orders or reorder quantities. The vet decides how much to order (D-06). Indian vet supply chain APIs do not exist.
- **QR code scanning.** 1D barcodes only for Beta. QR codes may be added in a future phase (D-15).
- **Push notifications for inventory alerts.** In-app badge and Attention card only. Push notifications for low stock and expiry are deferred (D-23).
- **Multi-location inventory transfer.** Single clinic scope. Inventory transfer between locations is out of scope.
- **Controlled substance tracking logic.** Schedule H tagging is awareness-only (visual badge). No special dispensing workflows, prescription validation, or regulatory reporting for controlled substances (D-10).
- **Purchase order matching / accounts payable.** No matching of stock receipts to purchase orders or supplier invoices.
- **Inventory valuation reports / COGS.** No weighted average cost, LIFO valuation, or cost of goods sold reporting. Deferred to Phase 9 web dashboard analytics.
- **Barcode label printing.** No barcode generation or label printing from the app.
- **Full offline mode.** Offline barcode scanning and operation queuing are in scope. Full offline CRUD for all inventory operations with conflict resolution is deferred to Phase 10 (Offline Hardening).
- **Web dashboard inventory views.** Web-based inventory management workbench is Phase 9 (09-03-PLAN.md).
- **Parent/variant item model.** Each dosage/form is a separate item. No product hierarchies for Beta (D-07).
- **PDF export of stock-take results.** Summary is viewable and saveable as record, but no formal PDF export for Beta (D-40).
- **Invoice generation and payment processing.** Phase 6 scope. This phase provides dispensed items and prices that feed into invoices.

---

## 9. Dependencies & Risks

### Dependencies

| Dependency | Type | Impact | Status |
|---|---|---|---|
| **Phase 1: Auth & RBAC** | Phase prerequisite | Role-based permission enforcement (Admin, Clinician, Front Desk, Inventory Manager) gates all inventory endpoints. Per-user permission overrides (D-16) used for dispensing flexibility. | Completed |
| **Phase 2: Design System** | Phase prerequisite | All inventory UI components built from Phase 2 atoms/molecules/organisms: Card, Badge, FAB, BottomSheet, SearchBar, FilterChips, Tabs, Toast, SkeletonLoader. Design tokens for colors, spacing, typography. | Completed |
| **Phase 3: Patient/Queue patterns** | Phase prerequisite | Search pattern (pg_trgm trigram), timeline pattern (visit history), optional photo pattern, tabbed profile layout, Prisma RLS Client Extensions -- all reused in inventory screens. | Completed |
| **Phase 4: EMR & Clinical Records** | Phase prerequisite | Prescription data triggers dispense suggestion (D-49). Consultation context links dispensed items to EMR records. Drug database from Phase 4 seed data informs item catalog. | In progress |
| **react-native-vision-camera V5** | External library | Core barcode scanning capability. Requires Expo prebuild (dev client, not Expo Go). New Architecture compatible. | Available |
| **expo-sqlite** | External library | Offline barcode cache and pending operations queue. First-party Expo module, New Architecture compatible. | Available |
| **Physical Android 8+ device** | Hardware | Required for meaningful barcode scanning testing. Camera-based features cannot be fully tested on emulator. | Required |
| **PostgreSQL pg_trgm extension** | Database | Trigram search for inventory item name lookup. Already established in Phase 3 for patient search. | Available |
| **Phase 6 (Invoicing)** | Downstream consumer | Dispensed items with prices, HSN/SAC codes, and GST rates flow into Phase 6 invoice line items. Phase 6 consumes the inventory data model. | Planned |
| **Phase 7 (WhatsApp)** | Downstream consumer | Want-list WhatsApp share uses the WhatsApp abstraction layer for formatted text delivery. | Planned |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **VisionCamera V5 + Expo SDK 52 incompatibility** | Medium | High -- barcode scanning is blocked | Wave 0 spike task validates VisionCamera V5 on physical device with Expo dev client before building full scanner UI. Fallback: expo-camera CameraView (functional but inferior for continuous scanning). |
| **Camera preview black screen on Android** | Medium | Medium -- degrades scanner UX on specific devices | Set `enableDynamicSizing={false}` on BottomSheet. Test on Samsung A-series and Xiaomi Redmi (common mid-range phones in India). Fallback: React Native Modal instead of bottom sheet. |
| **Offline queue replay ordering errors** | Low | High -- incorrect stock calculations after sync | Queue operations with sequential timestamps. Replay strictly in FIFO order. Stop on first failure. Unit tests cover edge cases (dispense before receipt, partial failures). |
| **Concurrent FIFO dispensing race condition** | Low | High -- over-dispensing or negative stock | Server-side FIFO in PostgreSQL transaction with `FOR UPDATE` row locking. Re-check expiry inside transaction. Integration tests with concurrent dispense simulation. |
| **Stock-take concurrent with dispensing** | Medium | Medium -- adjustment calculated on stale data | Stock-take adjustment calculated within a transaction that re-reads current stock before computing diff. Adjustment is a delta, not an absolute set. |
| **Barcode cache staleness creates duplicates** | Medium | Medium -- duplicate items after sync | Sync barcode cache on every app foreground event. Unknown barcode prompt mentions "you may need to sync when online." Deduplication logic on server for same-barcode items. |
| **WhatsApp share format breaks on iOS vs Android** | Low | Low -- garbled want-list text | Use expo-sharing with `mimeType: 'text/plain'`. Test with Hindi characters and special symbols. Keep format simple (numbered list with dashes). |
| **Mid-range Android camera performance** | Medium | Medium -- slow scan response in dimly lit stockroom | MLKit-based detection handles low-light better than pure image processing. Torch toggle always available. Manual entry fallback for damaged/unreadable barcodes. |

---

## 10. Open Questions

| # | Question | Context | Owner | Priority |
|---|---|---|---|---|
| 1 | Does the "inventory manager" role exist as a distinct person in solo/small vet clinics, or does the vet/front desk handle stock? | Persona assumption: Manager Mohan is a dedicated inventory person. In many solo clinics, Dr. Priya does inventory herself. This affects whether the Inventory Manager role is used in practice. | Product | Medium |
| 2 | Is barcode scanning on a mid-range Android phone in a dimly lit stockroom reliable enough to replace manual entry? | Stockrooms often have poor lighting. MLKit handles low-light reasonably well, but real-world validation is needed on target devices (Redmi Note series). | Engineering | High -- validate in Wave 0 spike |
| 3 | Do Indian veterinary distributors accept WhatsApp-formatted want-lists, or do they require orders in a specific format? | The want-list WhatsApp share feature assumes distributors accept plain text want-lists. Some larger distributors may require email, a portal, or a phone call. | Product | Low -- does not block build |
| 4 | Is FIFO enforcement valued by inventory managers, or is it seen as an unnecessary constraint that slows down dispensing? | FIFO is a best practice for expiry management but adds a step to dispensing. If users consistently override FIFO, the auto-selection may cause friction rather than helping. | Product -- validate with pilot clinics | Medium |
| 5 | What is the correct predefined HSN code list for veterinary products in India? | HSN codes are standardized by GST Council. A curated subset of codes relevant to veterinary medicines, vaccines, surgical supplies, and pet food needs to be compiled. | Product + Finance/Compliance | High -- needed for INV-09 implementation |
| 6 | Should offline barcode scanning show cached stock levels or suppress stock data (since it may be stale)? | Showing cached stock levels is helpful but may be inaccurate if other devices have dispensed since last sync. Suppressing data feels incomplete. | Engineering | Medium |
| 7 | What happens when two devices dispense the same item simultaneously while one is offline? | The offline device queues its dispense. On sync, the server may find insufficient stock. Conflict resolution strategy needed: reject with error, or allow negative stock with alert? | Engineering | High -- needed before Phase 10 |
| 8 | Should stock-take sessions be exclusive (only one active session per clinic at a time)? | Two staff members doing stock-take simultaneously could cause conflicting adjustments. Session locking may be needed. | Engineering | Low -- single-staff clinics are primary target |
| 9 | What is the retention policy for completed stock-take summary records? | D-48 specifies 12-month rolling retention for stock movements, but stock-take summaries may need longer retention for audit purposes. | Product | Low |
| 10 | Should the counter sale (D-52) workflow differ from consultation-linked dispensing in any visible way? | Counter sales are OTC transactions without clinical context. The dispensing flow is the same but the record structure and invoice linkage may differ. | Product | Low |

---

*This is a Lightweight PRD for inventory management. Detailed technical design lives in the implementation plans (05-01-PLAN.md through 05-08-PLAN.md) and codebase documentation.*

*Phase: 05-inventory-management*
*PRD generated: 2026-08-03*
*Plans: 8 (05-01-PLAN.md through 05-08-PLAN.md)*
*Requirements: INV-01 through INV-09*
