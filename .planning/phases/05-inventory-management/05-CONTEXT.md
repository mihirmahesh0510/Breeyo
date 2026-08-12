# Phase 5: Inventory Management - Context

**Gathered:** 2026-04-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Stock tracking with barcode scanning, batch/lot/expiry management, par-level alerts, and offline scanning capability. Inventory managers, clinicians, and front desk staff can add inventory items, receive stock (with batch tracking), scan barcodes to identify and update items, dispense stock (with FIFO enforcement), set par-level thresholds, view want-lists, and do physical stock-takes. Offline barcode scanning queues updates locally and syncs on reconnect. This phase delivers the inventory foundation that Billing (Phase 6) consumes for invoice line items and EMR (Phase 4) references for prescription dispensing.

</domain>

<decisions>
## Implementation Decisions

### Stock Entry & Receipts
- **D-01:** Individual item add — quick single-item form for adding new inventory items. No bulk receipt/purchase order flow for Beta. Solo vets receive 5-10 items at a time from local distributors
- **D-02:** Basic supplier field — optional free-text distributor name on stock receipt. No supplier directory or entity management. Solo vets know their 2-3 distributors by heart
- **D-03:** Purchase + selling price — both tracked per item. Purchase price recorded per-batch since costs vary between receipts. Enables margin calculation for admin reporting
- **D-04:** Required adjustment reason — when adjusting stock (add/remove manually), user must select from preset list: damage, theft, correction, expired disposal, stock-take, other. Creates audit trail for shrinkage patterns
- **D-05:** Custom units allowed — predefined list (tablets, capsules, mL, strips, bottles, vials, sachets, kg, grams, pieces) plus ability to add custom units. Risk of inconsistency accepted for flexibility
- **D-06:** Par level only — alert threshold per item ("alert when below X"). No reorder quantity. Want-list shows what's low, vet decides how much to order
- **D-07:** Separate items per dosage/form — "Amoxicillin 250mg Tab" and "Amoxicillin 500mg Tab" are two distinct items. No parent/variant model. Simple, clear stock counts per SKU
- **D-08:** Persistent catalog — items exist permanently in the catalog even when stock hits zero. Prevents re-entering item details on restock. Zero-stock items still searchable
- **D-09:** Single quantity field — enter total units received (e.g., "100 tablets"). No packaging breakdown (packs x units). Fast entry for solo vets
- **D-10:** Schedule H category tag — items can be tagged as "Schedule H" or "Controlled" via category. Visual indicator on item card (badge/icon). No special dispensing logic for Beta — awareness only
- **D-11:** Always new batch — every stock receipt creates a new batch entry with its own expiry date and lot number. No merging of batches. Clean audit trail, FIFO works naturally across batches
- **D-12:** Optional notes field — free text on each item for storage instructions, handling warnings, special information. Not required

### Barcode Scanning
- **D-13:** Show item + quick actions on scan — scan resolves to item card showing current stock, batches, expiry. Quick action buttons: "Add Stock", "Dispense", "View Details". One scan, multiple workflows
- **D-14:** Unknown barcode prompts new item creation — "Item not found. Create new item with this barcode?" opens quick add form with barcode pre-filled. Turns unknown scans into catalog entries
- **D-15:** 1D barcodes only — EAN-13, EAN-8, UPC-A, Code 128, Code 39. Covers virtually all pharmaceutical and veterinary product packaging in India. No QR code support for Beta
- **D-16:** Multiple barcodes per item — an item can have several barcodes linked to it. Handles rebranding, different pack sizes with same product. Each barcode resolves to the same item
- **D-17:** Full-screen camera overlay — camera fills screen with scan region guide and torch toggle. Scanned item appears as bottom sheet overlay without leaving camera for rapid consecutive scans
- **D-18:** Continuous scanning mode — after scanning one item, camera stays active for next scan. Scanned items queue in a list. Perfect for stock-taking: scan 20 items, review and update quantities in one go
- **D-19:** Offline scan + queue locally — camera works offline. Scanned barcodes matched against local item cache (synced to device). Stock updates queued and synced when connectivity returns. Yellow "Offline" banner visible
- **D-20:** Manual barcode entry always available — numeric input field alongside camera button. For damaged barcodes, poor lighting, or when camera struggles. Number pad auto-opens

### Expiry Management & FIFO
- **D-21:** Configurable expiry lead time — default 30 days before expiry triggers warning. Admin can change to 15, 30, 60, or 90 days in clinic settings. Different stock types have different shelf lives
- **D-22:** Auto-select oldest batch (FIFO) — when dispensing, system automatically picks the oldest non-expired batch first. Vet can override if needed (e.g., opened vial takes priority). Smart default, manual override
- **D-23:** Dashboard card + in-app badge — Inventory tab shows badge count of alerts. Dashboard has "Attention Needed" card with low stock + expiring items summary. No push notifications for Beta
- **D-24:** Want-list + WhatsApp share — dedicated want-list screen showing all items below par level. "Share via WhatsApp" button generates simple formatted text list to send to distributor. Matches Indian business communication patterns
- **D-25:** Flag + block expired dispensing — expired batches get red "Expired" badge. System blocks dispensing from expired batch. Vet must manually dispose via stock adjustment with "expired disposal" reason. Safety-first approach
- **D-26:** Combined Attention card with tabs — single "Attention Needed" card with tabs: Low Stock (count), Expiring Soon (count), Expired (count). Tap a tab to see items. Compact, one-glance overview
- **D-27:** Category-based expiry requirement — expiry date mandatory when item category is medicine, vaccine, or consumable. Optional for equipment, accessories, general supplies. Matches real world: syringes expire, stethoscopes don't
- **D-28:** Simple text want-list format — plain text for WhatsApp: "Breeyo Want-List (date)\n1. Amoxicillin 250mg - Current: 5, Par: 50\n2. ..." Professional, readable on any phone

### Item Organization & Browsing
- **D-29:** Predefined + custom categories — 7 base categories: Medicines, Vaccines, Surgical Supplies, Lab Consumables, Food & Supplements, Equipment, General Supplies. Admin can add custom categories for their clinic's needs
- **D-30:** Card list with key info — each item as a card showing: name, category icon, current stock (color-coded green/yellow/red), selling price, expiry indicator (nearest expiry badge). Matches Phase 2 balanced density (D-32). Tap for full details
- **D-31:** Live search + category filter — debounced search bar at top (same pattern as patient search, Phase 3). Filter chips below for categories. Search covers item name, barcode number, and category
- **D-32:** Summary header + item list — top of Inventory tab shows summary cards: Total Items, Low Stock count, Expiring Soon count, Total Value. Below: the filterable/sortable item list. One-screen overview
- **D-33:** Tabbed item profile — top section: item name, category, photo (optional), selling price, purchase price, total stock. Below: tabs for "Batches" (lot/expiry/qty per batch), "History" (stock movements timeline), "Details" (notes, barcodes, unit, supplier)
- **D-34:** Optional item photos — camera/gallery option on item form, not required. Helps identify products visually, especially for staff who can't read English packaging. Same pattern as pet photos (Phase 3, D-09)
- **D-35:** Dispense from item or scan — "Dispense" button on item profile opens dispense flow (quantity + FIFO batch selection). Also accessible via barcode scan quick actions (D-13). Links to consultation record when called from EMR (Phase 4)
- **D-36:** Multiple sort options — sort by: Name (A-Z), Stock level (low first), Recently added, Expiring soon, Category. Default: Name A-Z. Sort selector at top of list

### Stock-taking & Audit
- **D-37:** Manual count + adjust — vet scans or selects item, enters actual physical count. System calculates difference. Adjustment created automatically with "stock-take" reason. Simple, no dedicated audit module
- **D-38:** Scan + count during stock-take — uses continuous scanning mode (D-18) for fast physical counting. Scan barcode, enter count, next item. Much faster than scrolling through list
- **D-39:** No enforcement on stock-take frequency — vet does stock-take whenever they want. No mandatory schedule or reminders. Solo vets know their clinic rhythm. System just provides the tool
- **D-40:** Summary after stock-take — after completing, show summary: items counted, discrepancies found (over/under), total value difference. Saveable as record. No formal PDF export for Beta

### Role Permissions
- **D-41:** Inventory Manager role — full inventory access by default: add items, update stock, scan barcodes, do stock-takes, set par levels, view reports. Cannot access EMR, queue, or billing
- **D-42:** Front Desk role — full inventory access (same capabilities as Inventory Manager). Allows front desk staff to manage stock alongside their primary role
- **D-43:** Dispensing permission — Clinician + Inventory Manager roles only. Front Desk can manage stock but cannot dispense. Admin can override per-user (Phase 1, D-16 customizable permissions)
- **D-44:** Par levels + prices — Admin + Inventory Manager roles only. Clinicians and Front Desk cannot change prices or par levels. Prevents accidental pricing changes

### Stock Movement History
- **D-45:** All movements logged — every stock event recorded: received, dispensed, adjusted (with reason), disposed (expired), stock-take correction, return to stock. Each entry: date, user, type, quantity change, batch reference, running total
- **D-46:** Chronological timeline — newest first, each entry as a row with action icon (received/dispensed/adjusted), quantity (+/-), batch ref, user name, running total. Same timeline pattern as pet visit history (Phase 3)
- **D-47:** CSV export — stock movement history downloadable as CSV from item profile. Useful for tax/accounting purposes
- **D-48:** Rolling 12 months retention — keep last 12 months of stock movement history. Older records archived. Keeps database lean

### Dispensing Integration (Cross-Phase)
- **D-49:** Prescribe triggers dispense suggestion — when vet writes prescription in EMR (Phase 4), system suggests "Dispense from inventory?" with auto-matched item + FIFO batch. Vet confirms with one tap. Optional — can prescribe without dispensing
- **D-50:** Auto-add to draft invoice — when stock is dispensed during consultation, item auto-added to patient's draft invoice with selling price. Vet reviews and finalizes in billing (Phase 6). Seamless flow
- **D-51:** Simple return flow — "Return to stock" action on dispensing record. Restores quantity to original batch. Creates reverse stock movement entry. Rare but needed for corrections
- **D-52:** Standalone dispense (counter sale) — dispense button on item profile works without active consultation. Creates a "counter sale" record. Covers OTC sales (pet food, supplements, accessories) that don't need a consultation

### Phase 5 Plan Review Decisions (2026-08-04)
- **D-53:** Generic sync dispatcher — single `POST /api/v1/inventory/sync-operation` endpoint that inspects the operation type field and routes to the correct service (receipt, dispense, adjustment, etc.). Offline queue replays through this one endpoint rather than calling individual routes
- **D-54:** Soft-delete + CSV archive for retention — monthly cron soft-deletes stock movements older than 12 months after auto-generating a CSV export stored in clinic file storage. Vet can download past archives from a settings screen. Satisfies D-48 rolling retention
- **D-55:** Expiry lead time config via inventory list — gear icon next to the "Expiring Soon" attention card on the inventory list screen. Tapping opens a quick picker (15/30/60/90 days) that persists to clinic settings via API. No separate settings screen needed
- **D-56:** Daily expiry cron in Phase 5 — BullMQ repeatable job runs daily at midnight IST, marks newly-expired batches (isExpired = true on StockBatch where expiryDate < now), and triggers push notifications for any newly-expired items. Ensures Inventory List "Expired" count is always accurate
- **D-57:** Return-to-stock via timeline entry — "Return" icon button on each DISPENSE movement row in StockMovementTimeline. Tapping opens a confirmation bottom sheet showing batch, quantity, and reason field. Only visible for movements within the last 24 hours. Implements D-51 UX
- **D-58:** Fuzzy search dropdown for drug matching — when vet types a drug name in EMR prescription, show a dropdown of matching inventory items (fuzzy text search). Vet picks the correct item, linking PrescriptionItem.inventoryItemId. If no match, prescription saved without inventory link. Implements D-49 matching logic
- **D-59:** Toast + retry banner for sync failures — error toast shown immediately on sync failure ("Sync failed: Batch already exists"). Persistent banner at top of inventory screen: "N operations pending — Tap to review." Tapping opens pending queue where vet can retry or discard each failed operation

### Phase 5 Plan Review Decisions (2026-08-12)
- **D-60:** Counter sale flows into Billing via tagged dispense records (implements the "auto-create draft invoice" answer within Phase 5's actual scope) — Standalone dispense with no consultation (counter sale, D-52) is not cash-only/untracked. Since the Invoice model doesn't exist until Phase 6, Phase 5's job is to make counter sales invoice-ready: every dispensed StockMovement snapshots `unitPrice` (item.sellingPrice at dispense time) and accepts an optional `ownerId` when the vet attaches a pet owner to the sale. Phase 6 is expected to query `StockMovement WHERE type='dispensed' AND invoiceId IS NULL` (both consultation-linked per D-50 and counter-sale per D-52) to assemble draft invoices — this is the literal mechanism behind "auto-creates a draft invoice." Mobile dispense screen offers an optional "Attach to owner" picker for counter sales so the future invoice has someone to bill
- **D-61:** Custom categories/units persisted clinic-wide — When a user types a custom category or unit on the item form (D-05, D-29), it is saved as a reusable clinic-level option, not one-off free text on that single item. It appears in the picker for all future items at that clinic, preventing inconsistent naming (e.g., "Dewormer" vs "De-wormer") as the catalog grows. Requires a lightweight per-clinic category/unit list in the schema and the item form fetching/appending to that list instead of storing ad hoc text
- **D-62:** HSN/SAC and GST rate remain fully optional (confirmed) — HSN/SAC code and GST rate (INV-09) are optional on every item regardless of category, with no enforcement at item-save time even for medicine/vaccine/surgical categories. Unlike expiry date (D-27), there is no category-based requirement. Vets can add HSN/GST anytime; Phase 6 invoicing is responsible for handling items with missing GST info at invoice time (e.g., falling back to clinic default rate)
- **D-63:** Barcode-already-linked-to-different-item shows existing item, no relink — When a scanned barcode matches an InventoryBarcode already linked to a different item than the vet expected (e.g., distributor reused a barcode, wrong product grabbed), the bottom sheet shows "This barcode is linked to [Item Name]" with a link to view/edit that item. No inline relinking flow in Beta — if the barcode was genuinely misassigned, the vet corrects it manually via each item's edit form (remove from wrong item, add to right item)
- **D-64:** Item photo upload scope gap closed via Plan 05-04 — D-34 (optional item photos) requires an actual upload implementation (image picker + presigned URL + S3, reusing the Phase 3 pet-photo pattern), which was missing from all 8 Phase 5 plans as originally written. A task implementing this must be added to Plan 05-04 (item creation/edit form) before build begins

### Claude's Discretion
- Exact barcode scanning library choice (expo-camera vs react-native-vision-camera)
- Animation details for scan feedback, stock update confirmations, card transitions
- Search debounce timing (200-500ms range)
- Exact predefined unit of measure list beyond the core set named
- Stock adjustment reason preset list content (beyond the named examples)
- Color coding thresholds for stock level indicators (what % of par = green/yellow/red)
- Offline item cache strategy and sync conflict resolution approach
- Sort selector UI pattern (dropdown, bottom sheet, segmented control)
- Item photo compression and storage approach
- Exact "Attention Needed" card layout within Phase 2 component library
- Stock-take session management (start/end markers vs continuous)
- Counter sale record structure and display in history

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Context
- `.planning/PROJECT.md` -- Core value (mobile-first for solo vets), constraints (mid-range Android 8+, offline support, price sensitivity), key decisions
- `.planning/REQUIREMENTS.md` -- INV-01 through INV-08 are the requirements for this phase
- `.planning/ROADMAP.md` -- Phase 5 goal, success criteria, dependency on Phase 4

### Prior Phase Context
- `.planning/phases/01-foundation-authentication/01-CONTEXT.md` -- Auth system, RBAC with customizable per-user permissions (D-16), multi-tenant RLS (D-22-D-26), API conventions `/api/v1/{resource}` (D-27-D-30), audit trail patterns (D-34-D-36, immutable append-only logs)
- `.planning/phases/02-ui-ux-design-design-system/02-CONTEXT.md` -- Design system: Material Design 3 (D-01), warm colors (D-02), 7-level typography (D-03), 8px spacing (D-04), bottom tab bar with Inventory tab (D-25), FABs for primary actions (D-30), step-by-step wizards for data-heavy workflows (D-11), balanced information density for inventory (D-32), progressive disclosure (D-35), WCAG AA (D-06)
- `.planning/phases/03-patient-registration-walk-in-queue/03-CONTEXT.md` -- Patient search pattern with pg_trgm (D-25), live search with debounce (D-25), pet profile with tabbed layout, optional photo pattern (D-09), visit history timeline (D-31), zod schema validation pattern, Prisma RLS Client Extensions

### Technology Stack
- `.planning/research/STACK.md` -- React Native/Expo, Node.js/Fastify, PostgreSQL, Redis, Prisma, TypeScript, Zustand, React Query, zod, expo-camera for barcode scanning

No additional external specs or ADRs -- requirements fully captured in decisions above and REQUIREMENTS.md.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None yet -- Phases 1-4 create the foundation. Phase 5 is the first phase consuming the full stack (auth, design system, patient data, EMR context) for inventory

### Established Patterns
- Monorepo structure from Phase 1 -- inventory module follows bounded context pattern (`apps/api/src/modules/inventory/`)
- PostgreSQL RLS multi-tenancy from Phase 1 -- all inventory data scoped to clinic tenant
- Auth middleware from Phase 1 -- all API endpoints require authentication with role-based access
- Design system from Phase 2 -- cards, badges, FAB, bottom sheet, search bar, filter chips, tabs all from component library
- API conventions from Phase 1 (D-27-D-30) -- REST endpoints follow `/api/v1/inventory/*` pattern
- Live search pattern from Phase 3 -- debounced search with pg_trgm, same approach for inventory search
- Optional photo pattern from Phase 3 -- pet photos, reused for item photos
- Timeline pattern from Phase 3 -- visit history timeline, reused for stock movement history
- Zod schema validation from Phase 3 -- shared client/server validation, same pattern for inventory schemas
- Prisma Client Extensions for RLS from Phase 3 -- same tenant isolation approach

### Integration Points
- Auth system (Phase 1) -- role-based permissions gate inventory actions (Inventory Manager, Clinician, Front Desk, Admin)
- Design system (Phase 2) -- inventory cards, Attention Needed dashboard card, barcode scanner overlay, item profile tabs, sort selector, filter chips
- Patient/Queue (Phase 3) -- no direct dependency, but search and timeline patterns reused
- EMR (Phase 4) -- prescription dispensing triggers inventory stock deduction suggestion
- Billing (Phase 6) -- dispensed items auto-added to draft invoice with selling price
- WhatsApp (Phase 7) -- want-list sharing via WhatsApp (text format) uses the WhatsApp abstraction layer
- Offline (Phase 10) -- barcode scanning works offline from Phase 5, full offline hardening in Phase 10

</code_context>

<specifics>
## Specific Ideas

- Barcode scanner should feel instant and responsive -- vet is holding an animal, needs to scan with one hand
- Continuous scanning mode for stock-taking turns a 30-minute chore into a 10-minute task -- scan, count, next
- Want-list WhatsApp share matches how Indian businesses communicate with suppliers -- no one emails, everyone WhatsApps
- Counter sale (standalone dispense) is a real workflow -- pet owners buy food and supplements without a consultation
- FIFO auto-select with override is the pragmatic middle ground -- compliance by default, flexibility for reality (opened vials, specific batch preferences)
- Rolling 12 months for stock history keeps the mobile app fast -- historical data for auditing can live in web dashboard later
- Schedule H tag is awareness-only for Beta -- full controlled substance tracking is a regulatory rabbit hole best deferred

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope (stock entry, barcode scanning, expiry management, item organization, stock-taking, role permissions, history, dispensing integration). No feature suggestions or scope creep encountered.

</deferred>

---

*Phase: 05-inventory-management*
*Context gathered: 2026-04-19*
