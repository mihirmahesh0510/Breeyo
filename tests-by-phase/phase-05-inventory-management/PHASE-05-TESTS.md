# Phase 05 — Inventory Management: Test Summary

**20 test files, 471 tests** (263 API + 208 mobile) covering stock receipt, FIFO-based
dispensing, manual adjustments, barcode lookup, par-level (low-stock) alerts, expiry tracking,
offline sync replay, CSV export, and the permission rules that gate every inventory mutation —
plus a **live end-to-end browser test session** that exercised the real running app against a
real database and caught 8 bugs the automated suite could not see. Both are documented below.

## Why this matters (business risk being covered)

Inventory is the part of the product that touches money and medicine directly — errors here
either lose the clinic revenue or put an animal at risk:

- **Dispensing an expired drug.** FIFO dispensing is designed to always pull from the oldest
  batch first, but an oldest-first rule that didn't also check expiry could hand a vet an
  expired vaccine simply because it happened to be the oldest stock on the shelf. Tests confirm
  expired batches are skipped even when they're the oldest, and that dispensing is blocked
  outright (not just warned) if every batch of an item is expired or empty.
- **Selling more stock than the clinic actually has.** Both the quantity clamp on the mobile
  dispense screen and the server-side dispense service are tested against over-selling, with the
  exact insufficient-stock message the UI-SPEC requires — so a vet can't accidentally dispense
  30 units of a drug when only 12 are on the shelf.
- **A stock adjustment with no accountability.** Removing or adding stock outside of a normal
  receipt/dispense (breakage, theft, correction) is required to carry a reason from a fixed
  preset list — tested to reject a missing or made-up reason, so "why did our stock count drop
  by 40 units last month" always has an answer.
- **A clinic never finding out it's about to run out of something critical.** Par-level alerts
  (the "you're running low" warnings) and the nightly expiry-scan job are both tested in
  isolation to confirm they fire at the right thresholds — a silent failure here means a vet
  discovers they're out of a vaccine mid-appointment instead of a day earlier.
- **Anyone with an app login being able to change prices or stock.** Inventory actions are
  gated by role: viewing stock, adjusting stock, dispensing, and setting prices/par-levels are
  four separately-permissioned actions (D-41–D-44), and each role/action combination is tested
  explicitly — including that a permission **override** granted to an individual user (not just
  their role) is honored. This is the same category of bug that, in the live test below, turned
  out to be broken in the actual running app despite passing every one of these unit tests.
- **Offline actions replaying out of order, twice, or with the wrong permission after
  reconnecting.** A vet in a clinic with unreliable internet needs to receive stock, dispense,
  and adjust while offline, then have those actions sync once connectivity returns — in the
  right order, exactly once each, and still permission-checked as if they'd been sent live.
  Tests cover FIFO replay ordering, stopping replay on the first failure rather than silently
  skipping ahead, and a Redis-backed idempotency key so a retried sync request is never applied
  twice.
- **A CSV export a clinic hands to their accountant with garbled numbers or a broken date.**
  Stock-history and want-list exports are tested for their exact column shape, the UTF-8 BOM
  that keeps Excel from mangling the file, and IST date formatting — a wrong sign or a
  malformed date in an export a clinic uses for GST filing is a real compliance problem, not
  just a cosmetic one.
- **A barcode that doesn't match anything, or matches the wrong item.** Barcode lookup and the
  scan-to-item mapping used by the scanner screen are tested for known/unknown codes and for
  correctly computing batch count and nearest expiry from what the scan actually returns.

## How these tests are run

- **Framework:** [Vitest](https://vitest.dev/) — `pnpm --filter @breeyo/api test` for the
  inventory module and the expiry cron job, `pnpm --filter @breeyo/validators test` for the
  shared Zod schemas, and `pnpm --filter @breeyo/mobile test` for the offline queue, FIFO/
  adjustment/receipt/stock-take logic, CSV export, barcode scan mapping, and search debounce.
- **Nature of these tests:** all 20 files are **unit tests**. The API suites mock the Prisma
  repository, Redis client, and permission checks, so what's verified is business logic (FIFO
  ordering, permission-action mapping, sync routing, audit/idempotency behavior) independent of
  a real database. The mobile suites are almost entirely pure-function tests (quantity math,
  form-submission builders, CSV row mapping, debounce timing) plus two lightweight Zustand
  store tests (`scanner.store`, `stock-take.store`) — no component rendering or native module
  involved. Nine additional scaffold files under `apps/api/tests/inventory/` contain only
  `it.todo(...)` placeholders from an earlier planning pass and are not included here since they
  assert nothing.
- **Where it actually runs:** GitHub Actions (`.github/workflows/ci.yml`), alongside a live
  PostgreSQL 16 / Redis 7 setup, as part of the same repo-wide `pnpm test` step every other
  phase runs through.
- **What this suite cannot catch:** unit tests mock the permission-check function itself, so a
  bug in how a route *wires up* that function — rather than in the function's logic — is
  invisible to them. That gap is exactly what the live E2E session below caught. See "Live
  end-to-end testing" for what unit tests alone missed.

## Adding stock (receipt)
`apps/mobile/tests/inventory/stock-receipt-logic.test.ts`
- Medicine, vaccine, and lab-consumable categories require an expiry date; equipment, general
  supplies, and custom categories don't (D-27).
- A blank or whitespace-only quantity is rejected before it ever reaches the server; a past
  expiry date and a non-positive quantity are both rejected via the shared Zod schema.
- Optional fields (lot number, purchase price, supplier) are converted to `null` when left
  blank rather than being sent as empty strings, and are trimmed and passed through correctly
  when filled in.

## Dispensing stock (FIFO)
`apps/api/src/modules/inventory/__tests__/fifo-dispense.test.ts`,
`apps/mobile/tests/inventory/fifo-dispense-logic.test.ts`
- The oldest non-expired batch with remaining stock is auto-selected first; expired batches and
  fully-depleted batches are both skipped even if they're the oldest, and dispensing correctly
  returns "nothing available" when every batch is expired or empty.
- A vet can override which batch to dispense from (D-22) — the submission only includes the
  override field when it actually differs from the auto-selected FIFO batch.
- Dispensing from an expired batch is blocked outright (D-25), with the exact UI-SPEC message
  including the batch's real expiry date (falling back to "unknown date" if missing).
- Requested quantity is clamped to the batch's available stock, handling the zero-stock edge
  case and a cleared/NaN text field without throwing.
- `consultationId` (for a dispense linked to a visit, D-49) and `ownerId` (for a counter-sale
  attributed to a specific owner, D-60) are both passed through when present and default to
  `null` for an anonymous counter sale.

## Manual stock adjustments
`apps/api/src/modules/inventory/__tests__/stock-adjustment.test.ts`,
`apps/mobile/tests/inventory/stock-adjustment-logic.test.ts`
- An "add" adjustment produces a positive quantity delta and a "remove" adjustment a negative
  one, with zero handled without sign confusion.
- A reason is required (D-04) — a blank reason, or one not in the fixed `ADJUSTMENT_REASONS`
  preset list, is rejected with the exact UI-SPEC message; all six preset reasons are accepted,
  and free-text notes are trimmed.

## Counting stock (stock-take)
`apps/mobile/tests/inventory/stock-take-logic.test.ts`, `stock-take.store.test.ts`
- Starting a count session defaults each item's counted quantity to the system's recorded
  quantity, and re-adding an item already counted preserves what was already entered rather
  than resetting it.
- Discrepancy (counted vs. system) and its match/over/under status are computed correctly,
  including a signed `+`/`-` display format.
- A stock-take session expires 24 hours after it started (D-37/D-40) — tested at just under,
  just over, and exactly at the boundary.
- The pre-save summary (match/over/under counts and estimated value difference) is computed
  from selling price when known and zeroed out when it isn't, and returns a correctly zeroed
  summary for an empty session.
- Submitting an empty entry list or a negative counted quantity is rejected by the shared
  schema before it reaches the server.

## Barcode scanning
`apps/api/src/modules/inventory/__tests__/barcode-lookup.test.ts`,
`apps/mobile/tests/inventory/scanner.store.test.ts`, `useBarcodeScan.test.ts`
- A known barcode resolves to its item; an unknown one returns a clean "not found" rather than
  an error, and the offline catalog sync correctly supports incremental (`updatedSince`) pulls.
- The same code scanned twice within 1500ms is treated as a duplicate and suppressed; scanning
  it again after 1500ms, or scanning a *different* code within the window, is not — the exact
  debounce window the continuous-scan UX depends on.
- Mapping a scanned item to what the scan-result screen displays is correct for both an
  online lookup and a cached offline item (with a reduced field set), and the "nearest expiry"
  shown is computed correctly across multiple batches, including when no batch has one at all.

## Running low: par-level alerts and expiry
`apps/api/src/modules/inventory/__tests__/par-level-alert.test.ts`,
`apps/api/src/jobs/__tests__/expiry-cron.test.ts`
- Items below their configured par level are correctly flagged as low-stock, and items at or
  above it are not — the logic backing the "Attention" card vets see on the inventory home
  screen.
- The nightly expiry-scan job correctly identifies batches that are already expired vs.
  expiring soon vs. not yet due for a warning, on the schedule the job is configured to run.

## Who's allowed to do what
`apps/api/src/modules/inventory/__tests__/inventory-permissions.middleware.test.ts`
- Every one of the four D-41–D-44 inventory actions (view, manage stock, dispense, set prices
  & par-levels) has its own permission code, tested to allow the roles that should have it and
  deny the ones that shouldn't — e.g. Front Desk can manage stock but not set prices; a
  Clinician can view and dispense but not manage raw stock.
- A permission granted to an individual user as an **override** — separate from what their role
  normally grants — is honored, not just role-level permissions.

## Offline queue and sync replay
`apps/mobile/tests/inventory/offline-queue.service.test.ts`,
`apps/api/src/modules/inventory/__tests__/sync-operation.test.ts`
- Each queued offline action gets its own `clientOperationId` and is persisted with its data
  JSON-serialized; pending-count only counts unsynced entries.
- On reconnect, queued actions replay in the order they were originally created (not the order
  they happen to be read back), and syncing stops at the first failed operation rather than
  skipping ahead and applying later ones out of order.
- A connectivity failure (fetch itself failing) is distinguished from a structured API error
  returned by the server, so the UI can tell "you're offline" apart from "the server rejected
  this."
- The server-side sync dispatcher routes each operation type (`receipt`/`dispense`/`adjustment`)
  to its correct service, enforces the same permission each type would require if done online,
  and rejects an unrecognized or missing operation type with a structured error.
- **D-59 idempotency:** replaying the same `clientOperationId` returns the cached result with
  `alreadyApplied: true` instead of re-running the mutation a second time; an operation sent
  without a `clientOperationId` is re-executed every time (no key to dedupe on), and idempotency
  degrades gracefully — best-effort, not required — when Redis isn't available.

## Exporting data
`apps/mobile/tests/inventory/csv-export.service.test.ts`
- Stock-movement and want-list rows map to the exact column shape defined in the UI-SPEC (D-47),
  with negative quantities formatted without a double negative sign and missing batch/reason
  fields falling back to `-`.
- Exported CSV content is prefixed with the UTF-8 BOM character Excel needs to render it
  correctly, and dates are formatted in IST (`dd/MM/yyyy HH:mm`), including from an ISO string
  input and returning `-` for an invalid date rather than crashing.
- Filenames for both export types correctly embed the item name/date stamp.

## Search and photo upload
`apps/mobile/tests/inventory/useInventorySearch.test.ts`, `useItemPhotoUpload.test.ts`
- Inventory search only activates once the debounced query reaches the 2-character minimum
  (D-31), correctly distinguishes "still debouncing" from "done debouncing," and respects a
  custom minimum-character override.
- Uploading a picked item photo requests a presigned URL scoped to that item, then PUTs the
  asset to it, reporting progress milestones along the way; defaults to `image/jpeg` when the
  picker doesn't supply a MIME type, and correctly surfaces a failure from either step (URL
  request or the actual upload) without masking one as the other.

## Data validation (shared schemas)
`packages/validators/src/__tests__/inventory.validators.test.ts`
- Item creation, stock receipt, dispense, adjustment, and stock-take submissions all enforce
  their required fields and value ranges (positive quantities, valid categories, non-empty
  reasons) at the schema level — the same rules both the API and the mobile forms rely on, kept
  in one shared place so they can't drift apart between client and server.

---

## Live end-to-end testing

Automated unit tests mock the pieces around the code they're testing — the database, the
permission check, the auth response. That's exactly why they can pass 100% while the real,
wired-together app is broken: a bug in how two correctly-tested pieces are *connected* is
invisible to either piece's own test suite. This phase's build included a live end-to-end pass
against the actual running application — API on a real Postgres/Redis, mobile app running in a
browser via React Native Web — specifically to catch that category of bug.

**What this found:** 8 real bugs across Phases 1–5, none caught by any of the 471 unit tests
above:

1. **Every inventory API endpoint returning 500.** `inventory.routes.ts` and
   `dispense.routes.ts` never decorated `permissionService` onto the Fastify instance in their
   own plugin scope, so `requireInventoryPermission` crashed reading `request.server
   .permissionService` — undefined. Invisible to unit tests because they mock the permission
   check itself, not the plugin wiring that's supposed to supply it. Fixed by decorating it
   locally in both files, matching the working pattern already used in `clinic.routes.ts`.
2. **Every authenticated write in the entire app writing `"undefined"` as the active clinic
   ID.** The mobile `AuthProvider` expected a `clinicId` field directly on the login response
   that the real API has never sent — the real shape is `clinic: { id, name }`. Every login
   silently stored the literal string `"undefined"` as the tenant context. A Phase 1 bug,
   surfaced here because Phase 5's inventory screens were the first to make it visually obvious
   (categories/prices coming back empty).
3. **CORS silently blocking PUT/PATCH/DELETE from the browser.** `@fastify/cors` was registered
   without an explicit `methods` list and its defaults weren't taking effect in practice
   (confirmed via a manual OPTIONS preflight check) — invisible to native-app testing, which
   doesn't send CORS preflight requests at all, but a hard block for any browser-based client.
   Fixed by explicitly listing all methods the API needs to accept.
4–8. Five design-system components (`BottomSheet`, `Card`, `StatusBadge`, `QueueCard`,
   `BottomTabBar`, `NavigationBar`, `WizardStepper`, `Modal`) crashed on web when
   `useAppTheme()` resolved to Paper's bare default theme instead of Breeyo's custom theme,
   because they read `theme.borderRadius.lg` / `theme.spacing.md` without a fallback. Given
   defensive fallback constants; the underlying reason the theme sometimes resolves to the bare
   Paper theme on web was not root-caused and is worth a follow-up investigation.

**What was verified working, end-to-end, with real screenshots:**
- Adding a new inventory item through the full form, including HSN-code autocomplete and the
  resulting GST rate auto-selecting correctly (INV-01).
- The par-level "Attention" card correctly surfacing a low-stock item on the inventory home
  screen (INV-06).

**What remains unverified** (this environment has no Xcode Simulator, no Android SDK, and no
real camera/SQLite/WhatsApp hardware, so these could not be exercised live):
- Barcode scanning (needs a real camera).
- Offline sync replay under an actual network drop (needs real SQLite; the web mock is a
  no-op).
- WhatsApp share of a low-stock/want-list report.
- Stock receipt, dispense, adjustment, stock-take, and CSV export flows were not walked
  through live in the browser this session, though the infrastructure they all depend on
  (permissions, tenant context, CORS) is now proven working end-to-end by the fixes above.

**Environment note:** during this live session, the shared development database lost all
`users`/`clinics` rows twice with no corresponding action taken — most likely another
concurrent session sharing the same Postgres container. See `.planning/STATE.md` → Blockers/
Concerns for the open investigation item.

---
**How to run these for real:** `pnpm --filter @breeyo/api test src/modules/inventory src/jobs/__tests__/expiry-cron.test.ts && pnpm --filter @breeyo/validators test && pnpm --filter @breeyo/mobile test tests/inventory` from the project root.
