# Phase 5: Inventory Management - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-04-19
**Phase:** 05-inventory-management
**Areas discussed:** Stock entry & receipts, Barcode scanning workflow, Expiry & alerts, Item organization & browsing, Stock-taking & audit, Role permissions, Stock movement history, Dispensing integration

---

## Stock Entry & Receipts

| Option | Description | Selected |
|--------|-------------|----------|
| Individual item add | Quick single-item form: name, qty, price, batch/expiry. Fast for small clinics | ✓ |
| Bulk receipt / purchase order | Multi-item receipt document, optionally linked to supplier | |
| Both modes | Quick add + bulk receipt | |

**User's choice:** Individual item add
**Notes:** Recommended option. Solo vets receive 5-10 items at a time.

| Option | Description | Selected |
|--------|-------------|----------|
| No suppliers for Beta | Just track items, quantities, batches | |
| Basic supplier field | Optional text field (distributor name only) | ✓ |
| Full supplier directory | Manage suppliers as entities with GSTIN | |

**User's choice:** Basic supplier field
**Notes:** Diverged from recommended. User wants at least a note for reference.

| Option | Description | Selected |
|--------|-------------|----------|
| Selling price only | Single price used in invoices | |
| Purchase + selling price | Both tracked, per-batch purchase cost | ✓ |
| You decide | Claude picks | |

**User's choice:** Purchase + selling price
**Notes:** Diverged from recommended. User wants margin visibility.

| Option | Description | Selected |
|--------|-------------|----------|
| Required reason from preset list | Must select reason for adjustments | ✓ |
| Optional reason | Available but not mandatory | |
| No reason needed | Just adjust the number | |

**User's choice:** Required reason from preset list

| Option | Description | Selected |
|--------|-------------|----------|
| Predefined units | Fixed list covering 95%+ items | |
| Custom units allowed | Predefined + ability to add custom | ✓ |
| Free text only | User types any unit | |

**User's choice:** Custom units allowed
**Notes:** Diverged from recommended. User accepts inconsistency risk for flexibility.

| Option | Description | Selected |
|--------|-------------|----------|
| Par level only | Just alert threshold | ✓ |
| Par level + reorder quantity | Both threshold and order amount | |
| You decide | Claude picks | |

**User's choice:** Par level only

| Option | Description | Selected |
|--------|-------------|----------|
| Separate items | Each dosage/form is distinct | ✓ |
| Item with variants | Parent item with variant rows | |
| You decide | Claude picks | |

**User's choice:** Separate items

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, persistent catalog | Items stay even at zero stock | ✓ |
| Auto-hide zero-stock | Hidden from main view, retrievable | |
| Delete when empty | Archive/delete at zero stock | |

**User's choice:** Persistent catalog

| Option | Description | Selected |
|--------|-------------|----------|
| Single quantity field | Enter total units received | ✓ |
| Packaging breakdown | Packs x units calculation | |
| Both with smart default | Toggle between modes | |

**User's choice:** Single quantity field

| Option | Description | Selected |
|--------|-------------|----------|
| Category tag only | Visual indicator, no special logic | ✓ |
| Controlled substance tracking | Separate register, dispensing log | |
| No distinction | All items treated equally | |

**User's choice:** Schedule H category tag only

| Option | Description | Selected |
|--------|-------------|----------|
| Always new batch | Every receipt = new batch entry | ✓ |
| Merge if same batch/lot | Add to existing if lot matches | |
| You decide | Claude picks | |

**User's choice:** Always new batch

| Option | Description | Selected |
|--------|-------------|----------|
| Optional notes field | Free text for storage/warnings | ✓ |
| Notes + file attachments | Notes + PDFs | |
| No notes | Structured fields only | |

**User's choice:** Optional notes field

---

## Barcode Scanning Workflow

| Option | Description | Selected |
|--------|-------------|----------|
| Show item + quick actions | Item card + Add Stock/Dispense/View buttons | ✓ |
| Context-dependent action | Behavior varies by screen context | |
| Always opens item detail | Full profile page on every scan | |

**User's choice:** Show item + quick actions

| Option | Description | Selected |
|--------|-------------|----------|
| Prompt to create new item | "Create new?" with barcode pre-filled | ✓ |
| Show error + manual search | Error message + search fallback | |
| Auto-link to existing item | "Link to existing?" search flow | |

**User's choice:** Prompt to create new item

| Option | Description | Selected |
|--------|-------------|----------|
| 1D barcodes only | EAN-13, EAN-8, UPC-A, Code 128, Code 39 | ✓ |
| 1D + QR codes | All 1D + QR support | |
| You decide | Claude picks | |

**User's choice:** 1D barcodes only

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, multiple barcodes per item | Several barcodes resolve to same item | ✓ |
| One barcode per item | Strict 1:1 mapping | |
| You decide | Claude picks | |

**User's choice:** Multiple barcodes per item

| Option | Description | Selected |
|--------|-------------|----------|
| Full-screen camera overlay | Camera fills screen, bottom sheet for results | ✓ |
| Half-screen split | Camera top, results bottom | |
| You decide | Claude picks | |

**User's choice:** Full-screen camera overlay

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, continuous mode | Camera stays active, items queue in list | ✓ |
| Single scan only | Re-enter scanner for each scan | |
| You decide | Claude picks | |

**User's choice:** Continuous scanning mode

| Option | Description | Selected |
|--------|-------------|----------|
| Scan + queue locally | Match against local cache, queue updates | ✓ |
| Scan + save for later | Capture barcodes, process after online | |
| You decide | Claude picks | |

**User's choice:** Scan + queue locally

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, always available | Numeric input alongside camera | ✓ |
| Only as fallback | Appears after failed scan | |
| No manual entry | Camera only | |

**User's choice:** Manual entry always available

---

## Expiry & Alerts

| Option | Description | Selected |
|--------|-------------|----------|
| Configurable per clinic | Default 30d, admin sets 15/30/60/90 | ✓ |
| Fixed 30-day warning | Simple single rule | |
| Multi-tier warnings | Yellow 60d, orange 30d, red 7d | |

**User's choice:** Configurable per clinic

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-select oldest batch | FIFO auto-pick, manual override | ✓ |
| Advisory only | Suggest oldest, user picks | |
| Strict enforcement | Always oldest, no override | |

**User's choice:** Auto-select oldest batch with override

| Option | Description | Selected |
|--------|-------------|----------|
| Dashboard card + in-app badge | Badge + Attention Needed card, no push | ✓ |
| Push notifications | Daily push summary + badges | |
| In-app only | Visible only in Inventory tab | |

**User's choice:** Dashboard card + in-app badge

| Option | Description | Selected |
|--------|-------------|----------|
| In-app list + WhatsApp share | Want-list screen + WhatsApp text share | ✓ |
| In-app list + PDF export | Want-list + PDF download | |
| In-app list only | View only, no export | |

**User's choice:** Want-list + WhatsApp share

| Option | Description | Selected |
|--------|-------------|----------|
| Flag + block dispensing | Red badge, block dispense, manual dispose | ✓ |
| Flag only | Red badge, dispensing still allowed | |
| Auto-dispose | Auto-zero at midnight | |

**User's choice:** Flag + block dispensing

| Option | Description | Selected |
|--------|-------------|----------|
| Combined card with tabs | Single card: Low Stock/Expiring/Expired tabs | ✓ |
| Separate cards | Three separate dashboard cards | |
| You decide | Claude picks | |

**User's choice:** Combined card with tabs

| Option | Description | Selected |
|--------|-------------|----------|
| Required for medicines, optional for others | Category-based requirement | ✓ |
| Always required | Every batch needs expiry | |
| Always optional | Never required | |

**User's choice:** Category-based expiry requirement

| Option | Description | Selected |
|--------|-------------|----------|
| Simple text list | Plain text for WhatsApp | ✓ |
| Structured with emojis | Formatted with emoji sections | |
| You decide | Claude picks | |

**User's choice:** Simple text list

---

## Item Organization & Browsing

| Option | Description | Selected |
|--------|-------------|----------|
| Predefined + custom | 7 base categories + admin custom | ✓ |
| Predefined only | Fixed list, no custom | |
| Tags instead of categories | Multiple tags per item | |

**User's choice:** Predefined + custom categories

| Option | Description | Selected |
|--------|-------------|----------|
| Card list with key info | Cards: name, icon, stock, price, expiry | ✓ |
| Compact table view | Spreadsheet-like rows | |
| You decide | Claude picks | |

**User's choice:** Card list with key info

| Option | Description | Selected |
|--------|-------------|----------|
| Live search + category filter | Debounced search + filter chips | ✓ |
| Search only | Just search bar | |
| Category tabs + search | Tab per category + search | |

**User's choice:** Live search + category filter

| Option | Description | Selected |
|--------|-------------|----------|
| Summary header + item list | Summary cards + filterable list | ✓ |
| Separate dashboard tab | Two sub-tabs: Items + Dashboard | |
| No dashboard | Just item list | |

**User's choice:** Summary header + item list

| Option | Description | Selected |
|--------|-------------|----------|
| Sections with tabs | Header + Batches/History/Details tabs | ✓ |
| Single scrollable page | All info on one page | |
| You decide | Claude picks | |

**User's choice:** Tabbed item profile

| Option | Description | Selected |
|--------|-------------|----------|
| Optional photo | Camera/gallery, not required | ✓ |
| No photos | Name/barcode only | |
| You decide | Claude picks | |

**User's choice:** Optional photo

| Option | Description | Selected |
|--------|-------------|----------|
| Dispense from item or scan | Available from profile + scan quick actions | ✓ |
| Dispense only from EMR | Inventory tab = stock management only | |
| You decide | Claude picks | |

**User's choice:** Dispense from item or scan

| Option | Description | Selected |
|--------|-------------|----------|
| Multiple sort options | Name, Stock, Recent, Expiry, Category | ✓ |
| Fixed sort (name only) | Always alphabetical | |
| You decide | Claude picks | |

**User's choice:** Multiple sort options

---

## Stock-taking & Audit

| Option | Description | Selected |
|--------|-------------|----------|
| Manual count + adjust | Scan/select, enter count, auto-adjust | ✓ |
| Dedicated stock-take mode | Lock inventory, walk through items | |
| No stock-take feature | Use manual adjustments only | |

**User's choice:** Manual count + adjust

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, scan + count | Continuous scan for fast counting | ✓ |
| List-based only | Scroll and tap to count | |
| You decide | Claude picks | |

**User's choice:** Scan + count

| Option | Description | Selected |
|--------|-------------|----------|
| No system enforcement | Vet chooses when to stock-take | ✓ |
| Configurable reminder | Admin sets frequency, system nudges | |
| You decide | Claude picks | |

**User's choice:** No enforcement

| Option | Description | Selected |
|--------|-------------|----------|
| Summary after stock-take | Discrepancy summary, saveable | ✓ |
| Detailed report + export | Full report with PDF/CSV | |
| No report | Silent adjustments | |

**User's choice:** Summary after stock-take

---

## Role Permissions

| Option | Description | Selected |
|--------|-------------|----------|
| Full inventory access | Add, update, scan, stock-take, par levels | ✓ |
| View + update only | Update stock but not add/change prices | |
| You decide | Claude picks | |

**User's choice:** Full inventory access for Inventory Manager

| Option | Description | Selected |
|--------|-------------|----------|
| View-only by default | See items/stock, cannot modify | |
| No access | Inventory tab hidden | |
| Full access | Same as Inventory Manager | ✓ |

**User's choice:** Full access for Front Desk
**Notes:** Diverged from recommended (view-only). User wants front desk staff to manage stock.

| Option | Description | Selected |
|--------|-------------|----------|
| Clinician + Inventory Manager | Only clinical/stock roles can dispense | ✓ |
| Any authenticated user | Anyone can dispense | |
| Clinician only | Tied to prescriptions | |

**User's choice:** Clinician + Inventory Manager

| Option | Description | Selected |
|--------|-------------|----------|
| Admin + Inventory Manager | Management actions only | ✓ |
| Admin only | Most restrictive | |
| You decide | Claude picks | |

**User's choice:** Admin + Inventory Manager for par levels + prices

---

## Stock Movement History

| Option | Description | Selected |
|--------|-------------|----------|
| All movements | Every event logged with full details | ✓ |
| Receipts + dispensing only | Incoming/outgoing only | |
| You decide | Claude picks | |

**User's choice:** All movements logged

| Option | Description | Selected |
|--------|-------------|----------|
| Chronological timeline | Newest first, same as Phase 3 visit history | ✓ |
| Grouped by type | Sections per event type | |
| You decide | Claude picks | |

**User's choice:** Chronological timeline

| Option | Description | Selected |
|--------|-------------|----------|
| No export for Beta | View in-app only, defer to Phase 9 | |
| CSV export | Download as CSV | ✓ |
| You decide | Claude picks | |

**User's choice:** CSV export
**Notes:** Diverged from recommended. User wants export for tax/accounting.

| Option | Description | Selected |
|--------|-------------|----------|
| Unlimited retention | All history kept forever | |
| Rolling 12 months | Keep last year, archive older | ✓ |
| You decide | Claude picks | |

**User's choice:** Rolling 12 months
**Notes:** Diverged from recommended (unlimited). User prioritizes database performance.

---

## Dispensing Integration

| Option | Description | Selected |
|--------|-------------|----------|
| Prescribe triggers dispense suggestion | Auto-match + one-tap confirm | ✓ |
| Auto-dispense on prescribe | Automatic deduction, no confirm | |
| Separate manual dispense | Independent actions | |

**User's choice:** Prescribe triggers dispense suggestion

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-add to draft invoice | Dispensed items auto-added with price | ✓ |
| Manual add to invoice | Noted in history, manual billing pull | |
| You decide | Claude picks | |

**User's choice:** Auto-add to draft invoice

| Option | Description | Selected |
|--------|-------------|----------|
| Simple return flow | Return to stock, reverse movement | ✓ |
| No returns for Beta | Once dispensed, stock gone | |
| You decide | Claude picks | |

**User's choice:** Simple return flow

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, standalone dispense | Counter sale without consultation | ✓ |
| Only during consultation | All dispensing through EMR | |
| You decide | Claude picks | |

**User's choice:** Standalone dispense (counter sale)

---

## Claude's Discretion

- Barcode scanning library choice
- Animation/transition details
- Search debounce timing
- Exact predefined unit list
- Stock adjustment reason preset list
- Stock level color thresholds
- Offline sync strategy
- Sort selector UI pattern
- Item photo handling
- Counter sale record structure

## Deferred Ideas

None -- all discussion stayed within phase scope.
