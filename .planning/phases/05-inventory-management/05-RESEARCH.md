# Phase 5: Inventory Management - Research

**Researched:** 2026-04-19
**Domain:** Barcode scanning, offline-first inventory, batch/FIFO dispensing, stock management in React Native/Expo
**Confidence:** HIGH (core stack verified against npm registry and official docs)

## Summary

Phase 5 builds a complete inventory management module for Breeyo: item CRUD, stock receipts with batch tracking, barcode scanning (offline-capable), FIFO dispensing, par-level alerts, want-lists, stock-taking, movement audit trail, and cross-phase hooks for EMR and billing.

The most critical technical decision is the barcode scanning library. **expo-camera** is the Expo-blessed solution but has significant limitations for this use case: on Android it uses Google Code Scanner (modal-based), has reported reliability issues with `onBarcodeScanned` not firing in APK builds, and lacks frame processor support for continuous scanning. **react-native-vision-camera V5** (released April 16, 2026) provides true inline camera scanning, frame processors for continuous mode, MLKit-based barcode detection, and superior cross-platform consistency -- but requires Expo prebuild (dev client, not Expo Go). Given Breeyo's requirements for continuous scanning mode, full-screen camera overlay with bottom sheet, and mid-range Android 8+ support, react-native-vision-camera V5 is the correct choice.

For offline inventory, **expo-sqlite** (via Expo's official SQLite module) is recommended over WatermelonDB. WatermelonDB has New Architecture compatibility concerns with Expo SDK 52+, requires a community config plugin, and its last-write-wins sync is problematic for stock quantity operations (additive conflicts). expo-sqlite is first-party, New Architecture compatible, and pairs well with a custom sync queue for the limited offline inventory scope (barcode cache + pending stock operations).

**Primary recommendation:** Use react-native-vision-camera V5 with `@mgcrea/vision-camera-barcode-scanner` for barcode scanning, expo-sqlite for offline barcode cache and pending operations queue, PostgreSQL append-only `stock_movements` table for audit trail, and application-level FIFO with raw SQL for batch dispensing.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Individual item add -- quick single-item form, no bulk receipt/PO flow
- D-02: Basic supplier field -- optional free-text, no supplier directory
- D-03: Purchase + selling price tracked, purchase price per-batch
- D-04: Required adjustment reason from preset list
- D-05: Custom units allowed beyond predefined list
- D-06: Par level only, no reorder quantity
- D-07: Separate items per dosage/form (no parent/variant model)
- D-08: Persistent catalog (items never deleted, even at zero stock)
- D-09: Single quantity field per receipt (total units, no packaging breakdown)
- D-10: Schedule H category tag (visual indicator only, no special logic)
- D-11: Always new batch per receipt (no merging)
- D-12: Optional notes field per item
- D-13: Scan shows item card with quick actions (Add Stock, Dispense, View Details)
- D-14: Unknown barcode prompts new item creation
- D-15: 1D barcodes only (EAN-13, EAN-8, UPC-A, Code 128, Code 39)
- D-16: Multiple barcodes per item
- D-17: Full-screen camera overlay with bottom sheet for scan results
- D-18: Continuous scanning mode for stock-taking
- D-19: Offline scan + queue locally with yellow "Offline" banner
- D-20: Manual barcode entry always available (number pad)
- D-21: Configurable expiry lead time (15/30/60/90 days, default 30)
- D-22: FIFO auto-select oldest batch, manual override allowed
- D-23: Dashboard card + in-app badge for alerts (no push notifications)
- D-24: Want-list + WhatsApp share (plain text format)
- D-25: Expired batch dispensing blocked, requires manual dispose
- D-26: Combined Attention card with tabs (Low Stock, Expiring Soon, Expired)
- D-27: Category-based expiry requirement (mandatory for medicine/vaccine/consumable)
- D-28: Simple text want-list format for WhatsApp
- D-29: 7 predefined categories + custom
- D-30: Card list with stock color coding and expiry indicator
- D-31: Live search + category filter (debounced, pg_trgm)
- D-32: Summary header + item list layout
- D-33: Tabbed item profile (Batches, History, Details)
- D-34: Optional item photos (same pattern as pet photos)
- D-35: Dispense from item profile or barcode scan
- D-36: Multiple sort options (Name, Stock level, Recently added, Expiring soon, Category)
- D-37: Manual count + adjust for stock-taking
- D-38: Scan + count during stock-take (continuous mode)
- D-39: No enforcement on stock-take frequency
- D-40: Summary after stock-take (items counted, discrepancies, value difference)
- D-41: Inventory Manager role -- full inventory access
- D-42: Front Desk role -- full inventory access
- D-43: Dispensing permission -- Clinician + Inventory Manager only
- D-44: Par levels + prices -- Admin + Inventory Manager only
- D-45: All stock movements logged with full audit trail
- D-46: Chronological timeline (newest first, same pattern as visit history)
- D-47: CSV export of stock movement history
- D-48: Rolling 12 months retention
- D-49: Prescribe triggers dispense suggestion (cross-phase EMR hook)
- D-50: Auto-add dispensed items to draft invoice (cross-phase billing hook)
- D-51: Simple return flow (return to stock, reverse movement)
- D-52: Counter sale (standalone dispense without consultation)

### Claude's Discretion
- Exact barcode scanning library choice (expo-camera vs react-native-vision-camera)
- Animation details for scan feedback, stock update confirmations, card transitions
- Search debounce timing (200-500ms range)
- Exact predefined unit of measure list beyond core set
- Stock adjustment reason preset list content
- Color coding thresholds for stock level indicators
- Offline item cache strategy and sync conflict resolution approach
- Sort selector UI pattern (dropdown, bottom sheet, segmented control)
- Item photo compression and storage approach
- Exact "Attention Needed" card layout
- Stock-take session management (start/end markers vs continuous)
- Counter sale record structure and display

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INV-01 | User can add inventory items with name, category, unit, and price | Standard CRUD with Prisma models, zod validation, REST endpoints |
| INV-02 | User can update stock quantities manually (add/remove) | Stock adjustment flow with required reason codes, append-only movement log |
| INV-03 | User can scan barcodes with phone camera to identify and update stock items | react-native-vision-camera V5 with MLKit barcode scanning, 1D format support verified |
| INV-04 | User can record batch/lot numbers and expiry dates for each stock receipt | Separate `stock_batches` table with per-receipt batch creation pattern |
| INV-05 | System enforces FIFO dispensing (oldest batch dispensed first) | Application-level FIFO with raw SQL ordered by `received_at ASC`, override capability |
| INV-06 | User can set par-level thresholds per item; system alerts when stock falls below | Efficient `WHERE current_stock < par_level` query with indexed columns |
| INV-07 | System generates want-lists of items below par level for reordering | Query-based want-list with WhatsApp text share via expo-sharing |
| INV-08 | Barcode scanning works offline and syncs when connectivity returns | expo-sqlite local barcode cache + pending operations queue with background sync |
</phase_requirements>

## Standard Stack

### Core (Phase-Specific)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react-native-vision-camera | 5.0.1 | Camera + barcode scanning | True inline scanning, frame processors for continuous mode, MLKit on Android. expo-camera uses Google Code Scanner modal on Android which breaks continuous scanning UX. V5 released 2026-04-16, supports New Architecture |
| @mgcrea/vision-camera-barcode-scanner | latest | Barcode scanning frame processor plugin | High-performance MLKit-based barcode scanner for VisionCamera V5. Supports format filtering for 1D codes |
| expo-sqlite | 55.0.15 | Offline barcode cache + pending operations | First-party Expo module, New Architecture compatible, no community plugin needed. Simpler than WatermelonDB for this limited offline scope |
| expo-haptics | latest | Scan feedback vibration | Haptic confirmation on successful barcode scan. First-party Expo module |
| expo-file-system | 55.0.16 | CSV file generation | Write CSV content to device filesystem for export |
| expo-sharing | 55.0.18 | Share CSV and want-list exports | Native share sheet for CSV files and WhatsApp text sharing |
| @gorhom/bottom-sheet | 5.2.9 | Scan result bottom sheet overlay | Industry-standard bottom sheet for React Native. Pairs with camera for scan result display |
| react-native-reanimated | 4.3.0 | Bottom sheet + card animations | Required peer dependency for @gorhom/bottom-sheet. Powers scan feedback animations |
| react-native-gesture-handler | 2.31.1 | Touch handling for bottom sheet | Required peer dependency for @gorhom/bottom-sheet |
| papaparse | 5.5.3 | CSV generation from JSON | Lightweight, battle-tested CSV library. `jsonToCSV()` for stock movement export |

### Already in Stack (from prior phases)
| Library | Purpose in Phase 5 |
|---------|---------------------|
| Prisma 6+ | Inventory data models, migrations, RLS tenant isolation |
| zod 3+ | Item form validation, API input validation (shared client/server) |
| React Query (TanStack) 5+ | Inventory data fetching, cache invalidation on stock changes |
| Zustand 5+ | Scanner state, offline queue state, stock-take session state |
| date-fns 4+ | Expiry date calculations, IST timezone formatting, lead time computation |
| Socket.IO 4+ | Real-time stock level updates across devices |
| i18next 24+ | Inventory UI localization (English + Hindi) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| react-native-vision-camera V5 | expo-camera | Simpler setup (no prebuild), but Android uses Google Code Scanner modal -- breaks continuous scanning. Reported `onBarcodeScanned` reliability issues on Android APK builds. No frame processor support |
| expo-sqlite | WatermelonDB (@nozbe/watermelondb 0.28.0) | More mature sync protocol, but: New Architecture untested, requires community plugin for SDK 52+, last-write-wins conflicts dangerous for stock quantities, heavier dependency for limited offline scope |
| expo-sqlite | Turso (libsql) | Bidirectional sync built-in, but automatic conflict resolution not available yet. Adds external service dependency |
| papaparse | react-native-csv (0.2.0) | react-native-csv is based on papaparse anyway. papaparse is more widely used and actively maintained |
| @gorhom/bottom-sheet | React Native built-in Modal | Bottom sheet provides the sliding overlay UX needed for scan results. Modal is full-screen takeover, wrong pattern for camera overlay |

**Installation (phase-specific packages only):**
```bash
npx expo install react-native-vision-camera @gorhom/bottom-sheet react-native-reanimated react-native-gesture-handler expo-haptics expo-file-system expo-sharing expo-sqlite
npm install @mgcrea/vision-camera-barcode-scanner papaparse
npm install -D @types/papaparse
```

**Expo config plugin (app.json):**
```json
{
  "plugins": [
    [
      "react-native-vision-camera",
      {
        "cameraPermissionText": "Breeyo needs camera access to scan barcodes"
      }
    ]
  ]
}
```

**Note:** react-native-vision-camera requires Expo prebuild (dev client). Cannot use Expo Go for barcode scanning features. This is already the expected workflow for Breeyo since other native modules will also require dev client builds.

## Architecture Patterns

### Recommended Module Structure
```
apps/api/src/modules/inventory/
  controllers/
    inventory-item.controller.ts
    stock-receipt.controller.ts
    stock-movement.controller.ts
    barcode.controller.ts
    dispense.controller.ts
    stock-take.controller.ts
    want-list.controller.ts
  services/
    inventory-item.service.ts
    stock-receipt.service.ts
    fifo-dispense.service.ts
    stock-movement.service.ts
    barcode-lookup.service.ts
    stock-take.service.ts
    want-list.service.ts
    par-level-alert.service.ts
  schemas/
    inventory-item.schema.ts    # zod schemas shared with mobile
    stock-receipt.schema.ts
    dispense.schema.ts
    stock-adjustment.schema.ts
    stock-take.schema.ts
  types/
    inventory.types.ts
  middleware/
    inventory-permissions.middleware.ts
  routes/
    inventory.routes.ts

apps/mobile/src/features/inventory/
  screens/
    InventoryListScreen.tsx
    InventoryItemDetailScreen.tsx
    BarcodeScannerScreen.tsx
    StockReceiptScreen.tsx
    DispenseScreen.tsx
    StockTakeScreen.tsx
    WantListScreen.tsx
  components/
    InventoryItemCard.tsx
    SummaryHeader.tsx
    AttentionCard.tsx
    BatchList.tsx
    StockMovementTimeline.tsx
    ScanResultBottomSheet.tsx
    BarcodeOverlay.tsx
    CategoryFilterChips.tsx
    SortSelector.tsx
    ManualBarcodeInput.tsx
  hooks/
    useBarcodeScan.ts
    useInventorySearch.ts
    useOfflineSync.ts
    useStockTakeSession.ts
    useFifoDispense.ts
  stores/
    scanner.store.ts           # Zustand: scanner state, scanned items queue
    offline-queue.store.ts     # Zustand: pending offline operations
    stock-take.store.ts        # Zustand: stock-take session state
  services/
    offline-barcode-cache.ts   # expo-sqlite: local barcode->item mapping
    offline-queue.service.ts   # expo-sqlite: pending operations queue
    csv-export.service.ts      # papaparse + expo-file-system + expo-sharing

packages/shared/src/schemas/
    inventory.schemas.ts       # zod schemas shared between API and mobile
```

### Pattern 1: Database Schema -- Inventory Items + Batches + Movements
**What:** Three-table pattern for inventory: `inventory_items` (catalog), `stock_batches` (per-receipt batch entries), `stock_movements` (append-only audit log)
**When to use:** Always -- this is the core data model for the entire phase

```sql
-- Prisma schema (simplified)
model InventoryItem {
  id            String   @id @default(cuid())
  clinicId      String   -- RLS tenant
  name          String
  category      String   -- 'medicine' | 'vaccine' | 'surgical' | 'lab_consumable' | 'food_supplement' | 'equipment' | 'general' | custom
  unit          String   -- 'tablets' | 'mL' | 'strips' | ... | custom
  sellingPrice  Decimal  @db.Decimal(10, 2)
  parLevel      Int?     -- null = no alert
  scheduleH     Boolean  @default(false)
  notes         String?
  photoUrl      String?  -- S3 presigned URL pattern
  isActive      Boolean  @default(true)  -- soft delete, persistent catalog
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  barcodes      InventoryBarcode[]
  batches       StockBatch[]
  movements     StockMovement[]

  @@index([clinicId, name])
  @@index([clinicId, category])
}

model InventoryBarcode {
  id        String @id @default(cuid())
  code      String -- the barcode value
  format    String -- 'ean13' | 'ean8' | 'upc_a' | 'code128' | 'code39'
  itemId    String
  item      InventoryItem @relation(fields: [itemId], references: [id])

  @@unique([code, clinicId])  -- barcode unique per clinic
  @@index([code])
}

model StockBatch {
  id            String    @id @default(cuid())
  itemId        String
  item          InventoryItem @relation(fields: [itemId], references: [id])
  clinicId      String
  lotNumber     String?
  expiryDate    DateTime?
  purchasePrice Decimal?  @db.Decimal(10, 2)
  supplier      String?   -- free-text
  initialQty    Int
  currentQty    Int       -- decremented on dispense
  receivedAt    DateTime  @default(now())
  isExpired     Boolean   @default(false)

  movements     StockMovement[]

  @@index([itemId, receivedAt])  -- FIFO ordering
  @@index([clinicId, expiryDate])  -- expiry alerts
}

model StockMovement {
  id          String   @id @default(cuid())
  clinicId    String
  itemId      String
  item        InventoryItem @relation(fields: [itemId], references: [id])
  batchId     String?
  batch       StockBatch? @relation(fields: [batchId], references: [id])
  type        String   -- 'received' | 'dispensed' | 'adjusted' | 'disposed' | 'stock_take' | 'returned'
  quantity    Int      -- positive for additions, negative for deductions
  reason      String?  -- required for 'adjusted' type
  runningTotal Int     -- item total after this movement
  userId      String
  consultationId String?  -- link to EMR when dispensing from prescription
  invoiceId   String?     -- link to billing draft
  notes       String?
  createdAt   DateTime @default(now())

  @@index([itemId, createdAt DESC])  -- timeline queries
  @@index([clinicId, createdAt DESC])
}
```

### Pattern 2: FIFO Dispensing (Application-Level)
**What:** Select oldest non-expired batch first, deduct from it, cascade to next batch if quantity exceeds single batch
**When to use:** Every dispense operation (D-22, D-25)

```typescript
// Source: Application-level FIFO pattern
// Prisma doesn't support window functions, use raw SQL for batch selection

async function dispenseFifo(
  prisma: PrismaClient,
  itemId: string,
  clinicId: string,
  quantityToDispense: number,
  overrideBatchId?: string // D-22: manual override
): Promise<DispenseResult> {
  return prisma.$transaction(async (tx) => {
    // Lock and fetch eligible batches, oldest first
    const batches = overrideBatchId
      ? await tx.$queryRaw<StockBatch[]>`
          SELECT * FROM "StockBatch"
          WHERE id = ${overrideBatchId}
            AND "clinicId" = ${clinicId}
            AND "currentQty" > 0
            AND "isExpired" = false
          FOR UPDATE
        `
      : await tx.$queryRaw<StockBatch[]>`
          SELECT * FROM "StockBatch"
          WHERE "itemId" = ${itemId}
            AND "clinicId" = ${clinicId}
            AND "currentQty" > 0
            AND "isExpired" = false
            AND ("expiryDate" IS NULL OR "expiryDate" > NOW())
          ORDER BY "receivedAt" ASC
          FOR UPDATE
        `;

    // Check total available
    const totalAvailable = batches.reduce((sum, b) => sum + b.currentQty, 0);
    if (totalAvailable < quantityToDispense) {
      throw new InsufficientStockError(itemId, quantityToDispense, totalAvailable);
    }

    // Deduct FIFO across batches
    let remaining = quantityToDispense;
    const deductions: BatchDeduction[] = [];

    for (const batch of batches) {
      if (remaining <= 0) break;
      const deduct = Math.min(remaining, batch.currentQty);

      await tx.stockBatch.update({
        where: { id: batch.id },
        data: { currentQty: { decrement: deduct } },
      });

      deductions.push({ batchId: batch.id, quantity: deduct });
      remaining -= deduct;
    }

    // Record stock movement (one per batch deducted)
    const currentTotal = await getCurrentItemTotal(tx, itemId, clinicId);
    for (const d of deductions) {
      await tx.stockMovement.create({
        data: {
          clinicId,
          itemId,
          batchId: d.batchId,
          type: 'dispensed',
          quantity: -d.quantity,
          runningTotal: currentTotal - d.quantity,
          userId: getCurrentUserId(),
        },
      });
    }

    return { deductions, newTotal: currentTotal - quantityToDispense };
  });
}
```

### Pattern 3: Append-Only Stock Movement Audit Trail
**What:** Every stock change creates an immutable `stock_movements` row. No UPDATE or DELETE on movements table.
**When to use:** All stock operations (receive, dispense, adjust, dispose, stock-take, return)

```typescript
// Source: Event sourcing / append-only pattern for inventory
// D-45: All movements logged

// Current stock for an item is derived from sum of movements
// OR maintained as a denormalized field on StockBatch.currentQty
// (both are used: currentQty for fast reads, movements for audit)

async function recordMovement(
  tx: PrismaTransaction,
  data: {
    clinicId: string;
    itemId: string;
    batchId?: string;
    type: 'received' | 'dispensed' | 'adjusted' | 'disposed' | 'stock_take' | 'returned';
    quantity: number;  // positive = add, negative = deduct
    reason?: string;   // required for 'adjusted'
    userId: string;
    consultationId?: string;
    invoiceId?: string;
  }
): Promise<StockMovement> {
  // Calculate running total
  const lastMovement = await tx.stockMovement.findFirst({
    where: { itemId: data.itemId, clinicId: data.clinicId },
    orderBy: { createdAt: 'desc' },
  });
  const runningTotal = (lastMovement?.runningTotal ?? 0) + data.quantity;

  return tx.stockMovement.create({
    data: { ...data, runningTotal },
  });
}
```

### Pattern 4: Offline Barcode Cache + Operation Queue
**What:** Sync a barcode-to-item mapping to the device using expo-sqlite. Queue stock operations offline and sync when connectivity returns.
**When to use:** Offline scanning (D-19, INV-08)

```typescript
// Source: expo-sqlite offline cache pattern
import * as SQLite from 'expo-sqlite';

// Initialize offline database
const db = SQLite.openDatabaseSync('breeyo-inventory-cache');

// Create tables on app launch
db.execSync(`
  CREATE TABLE IF NOT EXISTS barcode_cache (
    code TEXT PRIMARY KEY,
    format TEXT NOT NULL,
    item_id TEXT NOT NULL,
    item_name TEXT NOT NULL,
    item_data TEXT NOT NULL,  -- JSON blob of item + batches
    synced_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS pending_operations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,       -- 'dispense' | 'adjust' | 'receive'
    payload TEXT NOT NULL,    -- JSON of operation data
    created_at INTEGER NOT NULL,
    synced INTEGER DEFAULT 0
  );
`);

// Sync barcode cache from server (incremental)
async function syncBarcodeCache(lastSyncTimestamp: number) {
  const response = await api.get('/inventory/barcode-catalog', {
    params: { updatedSince: lastSyncTimestamp },
  });
  for (const item of response.data.items) {
    for (const barcode of item.barcodes) {
      db.runSync(
        `INSERT OR REPLACE INTO barcode_cache (code, format, item_id, item_name, item_data, synced_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [barcode.code, barcode.format, item.id, item.name, JSON.stringify(item), Date.now()]
      );
    }
  }
}

// Lookup barcode offline
function lookupBarcodeOffline(code: string): CachedItem | null {
  const row = db.getFirstSync(
    'SELECT * FROM barcode_cache WHERE code = ?',
    [code]
  );
  return row ? { ...row, item_data: JSON.parse(row.item_data) } : null;
}

// Queue operation for later sync
function queueOfflineOperation(type: string, payload: object) {
  db.runSync(
    'INSERT INTO pending_operations (type, payload, created_at) VALUES (?, ?, ?)',
    [type, JSON.stringify(payload), Date.now()]
  );
}

// Sync pending operations when online
async function syncPendingOperations() {
  const pending = db.getAllSync(
    'SELECT * FROM pending_operations WHERE synced = 0 ORDER BY created_at ASC'
  );
  for (const op of pending) {
    try {
      await api.post(`/inventory/sync-operation`, {
        type: op.type,
        payload: JSON.parse(op.payload),
      });
      db.runSync('UPDATE pending_operations SET synced = 1 WHERE id = ?', [op.id]);
    } catch (err) {
      break; // Stop on first failure, retry later
    }
  }
}
```

### Pattern 5: Camera Overlay with Bottom Sheet
**What:** Full-screen VisionCamera with scan region guide, torch toggle, and @gorhom/bottom-sheet for scan results
**When to use:** Barcode scanner screen (D-17, D-18)

```typescript
// Source: react-native-vision-camera V5 + @gorhom/bottom-sheet pattern
import { Camera, useCameraDevice } from 'react-native-vision-camera';
import { useBarcodeScanner } from '@mgcrea/vision-camera-barcode-scanner';
import BottomSheet from '@gorhom/bottom-sheet';
import * as Haptics from 'expo-haptics';

function BarcodeScannerScreen() {
  const device = useCameraDevice('back');
  const bottomSheetRef = useRef<BottomSheet>(null);
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
  const [torchOn, setTorchOn] = useState(false);
  const lastScannedRef = useRef<string>('');

  const { props: scannerProps } = useBarcodeScanner({
    barcodeTypes: ['ean-13', 'ean-8', 'upc-a', 'code-128', 'code-39'],
    onBarcodeScanned: (barcodes) => {
      const code = barcodes[0]?.value;
      if (!code || code === lastScannedRef.current) return;

      lastScannedRef.current = code;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Lookup in offline cache or online
      const item = lookupBarcode(code);
      if (item) {
        setScannedItems(prev => [item, ...prev]);
        bottomSheetRef.current?.expand();
      } else {
        // D-14: Unknown barcode, prompt new item creation
        navigateToNewItem({ barcode: code });
      }

      // Reset after debounce for continuous scanning (D-18)
      setTimeout(() => { lastScannedRef.current = ''; }, 1500);
    },
  });

  if (!device) return <NoCameraView />;

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        torch={torchOn ? 'on' : 'off'}
        {...scannerProps}
      />
      {/* Scan region guide overlay */}
      <ScanRegionOverlay />
      {/* Torch toggle */}
      <TorchButton onPress={() => setTorchOn(!torchOn)} />
      {/* Manual entry button (D-20) */}
      <ManualEntryButton />
      {/* Offline banner (D-19) */}
      {isOffline && <OfflineBanner />}
      {/* Results bottom sheet */}
      <BottomSheet
        ref={bottomSheetRef}
        snapPoints={['30%', '60%']}
        index={-1}
        enablePanDownToClose
      >
        <ScanResultList
          items={scannedItems}
          onAddStock={(item) => navigateToReceipt(item)}
          onDispense={(item) => navigateToDispense(item)}
          onViewDetails={(item) => navigateToDetails(item)}
        />
      </BottomSheet>
    </View>
  );
}
```

### Pattern 6: Par-Level Alerts Query
**What:** Efficient query for items below par level with expiry alerts
**When to use:** Dashboard Attention card (D-23, D-26), want-list generation (D-24)

```typescript
// Low stock items (INV-06, INV-07)
const lowStockItems = await prisma.$queryRaw`
  SELECT
    i.id, i.name, i.category, i."sellingPrice", i."parLevel",
    COALESCE(SUM(b."currentQty"), 0) as current_stock
  FROM "InventoryItem" i
  LEFT JOIN "StockBatch" b ON b."itemId" = i.id AND b."isExpired" = false
  WHERE i."clinicId" = ${clinicId}
    AND i."parLevel" IS NOT NULL
    AND i."isActive" = true
  GROUP BY i.id
  HAVING COALESCE(SUM(b."currentQty"), 0) < i."parLevel"
  ORDER BY (COALESCE(SUM(b."currentQty"), 0)::float / i."parLevel") ASC
`;

// Expiring soon items (D-21 configurable lead time)
const expiringSoonItems = await prisma.stockBatch.findMany({
  where: {
    clinicId,
    currentQty: { gt: 0 },
    isExpired: false,
    expiryDate: {
      lte: addDays(new Date(), expiryLeadDays), // date-fns
      gt: new Date(),
    },
  },
  include: { item: true },
  orderBy: { expiryDate: 'asc' },
});

// Expired items (D-25)
const expiredItems = await prisma.stockBatch.findMany({
  where: {
    clinicId,
    currentQty: { gt: 0 },
    expiryDate: { lte: new Date() },
  },
  include: { item: true },
  orderBy: { expiryDate: 'asc' },
});
```

### Anti-Patterns to Avoid
- **Storing current stock only without movements:** Loses audit trail. Always use append-only movements as source of truth, with `currentQty` on batch as denormalized cache.
- **Merging batches on receipt:** Destroys FIFO ordering and per-batch expiry tracking. Always create new batch per receipt (D-11).
- **Client-side FIFO calculation:** Race conditions if multiple devices dispense simultaneously. FIFO batch selection MUST happen server-side inside a database transaction with row locking (`FOR UPDATE`).
- **Syncing full inventory to device:** Memory and bandwidth waste. Only sync barcode-to-item mapping (lightweight cache), not full stock levels.
- **Using WatermelonDB's default sync for stock quantities:** Last-write-wins is dangerous for additive operations. Two devices dispensing 5 units each would resolve to -5 instead of -10.
- **Bottom sheet with camera lifecycle conflicts:** Known issue where @gorhom/bottom-sheet can cause camera preview to go black. Use `enableDynamicSizing={false}` and manage camera `isActive` state based on sheet position.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Barcode decoding | Custom barcode parser | react-native-vision-camera V5 + MLKit | EAN/UPC/Code128 decoding has edge cases (check digits, encoding variants). MLKit handles all 1D formats reliably |
| CSV generation | String concatenation | papaparse `jsonToCSV()` | Handles escaping (commas in fields, quotes, newlines), UTF-8 BOM for Excel compatibility |
| Bottom sheet UI | Custom animated overlay | @gorhom/bottom-sheet | Gesture handling, snap points, backdrop, keyboard avoidance are deceptively complex |
| Haptic feedback | Vibration API directly | expo-haptics | Cross-platform API, handles iOS Taptic Engine vs Android Vibrator cleanly |
| File sharing | Platform-specific share code | expo-sharing `shareAsync()` | Native share sheet on both platforms with correct MIME types |
| Offline database | AsyncStorage or custom file-based cache | expo-sqlite | Indexed queries, transactions, proper SQLite. AsyncStorage is key-value only, too slow for barcode lookups |
| Debounced search | Manual setTimeout/clearTimeout | useDeferredValue or custom hook with useRef | Memory leaks from unmounted component timeouts. Use established pattern from Phase 3 |
| FIFO across batches | Application-level loop without transactions | PostgreSQL transaction with FOR UPDATE row lock | Concurrent dispenses without locking cause race conditions and over-dispensing |

**Key insight:** Stock quantity operations are inherently concurrency-sensitive. The combination of append-only audit log + transactional FIFO with row locking + server-side authority over stock levels prevents the entire class of "two people dispensed at the same time and stock went negative" bugs.

## Common Pitfalls

### Pitfall 1: Camera Preview Goes Black When Bottom Sheet Opens
**What goes wrong:** @gorhom/bottom-sheet's gesture handler can conflict with VisionCamera's preview, causing the preview to render as a black screen on certain Android devices.
**Why it happens:** Both components compete for the native view layer and gesture handling.
**How to avoid:** Set `enableDynamicSizing={false}` on BottomSheet. Use `detached` mode or manage camera `isActive` based on bottom sheet state. Test on actual mid-range Android devices.
**Warning signs:** Black preview on Samsung/Xiaomi mid-range phones during testing.

### Pitfall 2: onBarcodeScanned Fires Multiple Times Per Scan
**What goes wrong:** A single barcode in the camera view triggers the callback repeatedly (5-30 times per second), causing duplicate stock operations.
**Why it happens:** Frame processor runs on every camera frame. Same barcode is visible across many frames.
**How to avoid:** Implement debounce with `lastScannedRef` -- ignore same barcode within 1500ms window. Also debounce the haptic feedback.
**Warning signs:** Duplicate entries in scan list, multiple stock movements for one scan.

### Pitfall 3: Offline Queue Replay Ordering
**What goes wrong:** Pending offline operations replayed out of order cause incorrect stock calculations (e.g., dispense replayed before the receipt that created the batch).
**Why it happens:** Network retries, partial failures, out-of-order HTTP responses.
**How to avoid:** Queue operations with sequential timestamps. Replay strictly in FIFO order. Stop on first failure -- don't skip ahead.
**Warning signs:** Negative stock after sync, "batch not found" errors on dispense replay.

### Pitfall 4: Expired Batch Race Condition
**What goes wrong:** Batch expires between FIFO selection and dispense confirmation. User dispenses from now-expired batch.
**Why it happens:** Expiry check at selection time but commit happens seconds later.
**How to avoid:** Re-check expiry inside the transaction (the `FOR UPDATE` query in Pattern 2 includes `AND "expiryDate" > NOW()`). Run a daily cron to mark batches as expired.
**Warning signs:** Stock movements with type 'dispensed' from batches where expiryDate < movement createdAt.

### Pitfall 5: Stock-Take Session Concurrency
**What goes wrong:** Vet does stock-take while front desk is dispensing items. Stock-take records "actual count = 50" but between count and save, 3 items were dispensed. Adjustment is now wrong.
**Why it happens:** Stock-take is a point-in-time snapshot but operations continue.
**How to avoid:** Stock-take creates adjustment movements, not absolute-set movements. The adjustment is calculated as (physical_count - system_count_at_time_of_save). Use a transaction that re-reads current stock before calculating diff.
**Warning signs:** Post-stock-take stock levels that don't match physical count.

### Pitfall 6: Barcode Cache Staleness
**What goes wrong:** New item added on web dashboard, vet tries to scan it on mobile offline, "unknown barcode" prompts new item creation -- creating a duplicate.
**Why it happens:** Offline barcode cache not synced recently.
**How to avoid:** Sync barcode cache on every app foreground event (AppState listener). Show "last synced X minutes ago" indicator. When offline, unknown barcode prompt should mention "you may need to sync when online".
**Warning signs:** Duplicate items with same barcode after sync.

### Pitfall 7: WhatsApp Share Intent Format
**What goes wrong:** Want-list text shared to WhatsApp renders with broken formatting (newlines not preserved, special characters mangled).
**Why it happens:** WhatsApp handles plain text sharing differently on iOS vs Android. Unicode characters in drug names can cause issues.
**How to avoid:** Use expo-sharing with `mimeType: 'text/plain'`. Test with Hindi characters and special symbols. Keep format simple (D-28: numbered list with dashes).
**Warning signs:** Garbled text in WhatsApp message, missing line breaks.

### Pitfall 8: VisionCamera Requires Dev Client
**What goes wrong:** Developer tries to test barcode scanning in Expo Go, gets "NativeModule not found" error.
**Why it happens:** react-native-vision-camera is a native module that requires prebuild. Expo Go only includes Expo-blessed native modules.
**How to avoid:** Document clearly that barcode scanning requires `npx expo run:android` or EAS development build. Set up development builds early in the phase.
**Warning signs:** "Invariant Violation: TurboModuleRegistry" errors.

## Code Examples

### CSV Export from Mobile (D-47)
```typescript
// Source: papaparse + expo-file-system + expo-sharing pattern
import Papa from 'papaparse';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

async function exportStockMovementsCSV(
  movements: StockMovement[],
  itemName: string
) {
  const csvData = movements.map(m => ({
    Date: format(m.createdAt, 'dd/MM/yyyy HH:mm', { timeZone: 'Asia/Kolkata' }),
    Type: m.type,
    Quantity: m.quantity > 0 ? `+${m.quantity}` : String(m.quantity),
    Batch: m.batch?.lotNumber ?? '-',
    Reason: m.reason ?? '-',
    'Running Total': m.runningTotal,
    User: m.userName,
  }));

  const csv = Papa.unparse(csvData);
  // Add UTF-8 BOM for Excel compatibility
  const csvWithBom = '\uFEFF' + csv;

  const fileName = `${itemName.replace(/\s+/g, '_')}_stock_history_${format(new Date(), 'yyyyMMdd')}.csv`;
  const filePath = `${FileSystem.documentDirectory}${fileName}`;

  await FileSystem.writeAsStringAsync(filePath, csvWithBom, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  await Sharing.shareAsync(filePath, {
    mimeType: 'text/csv',
    dialogTitle: `Stock History - ${itemName}`,
  });
}
```

### Want-List WhatsApp Share (D-24, D-28)
```typescript
// Source: expo-sharing for WhatsApp text sharing
import * as Sharing from 'expo-sharing';

function generateWantListText(items: LowStockItem[], clinicName: string): string {
  const date = format(new Date(), 'dd MMM yyyy');
  const header = `Breeyo Want-List (${date})\n${clinicName}\n${'─'.repeat(30)}\n`;
  const lines = items.map((item, i) =>
    `${i + 1}. ${item.name} - Current: ${item.currentStock}, Par: ${item.parLevel}`
  );
  return header + lines.join('\n') + `\n${'─'.repeat(30)}\nGenerated by Breeyo`;
}

async function shareWantListViaWhatsApp(items: LowStockItem[], clinicName: string) {
  const text = generateWantListText(items, clinicName);
  const filePath = `${FileSystem.documentDirectory}want-list.txt`;
  await FileSystem.writeAsStringAsync(filePath, text);
  await Sharing.shareAsync(filePath, { mimeType: 'text/plain' });
}
```

### Stock Color Coding (Claude's Discretion)
```typescript
// Recommended thresholds for stock level indicators (D-30)
function getStockLevelColor(currentStock: number, parLevel: number | null): StockLevel {
  if (parLevel === null) return 'neutral';  // no par level set
  if (currentStock === 0) return 'critical'; // red - out of stock
  const ratio = currentStock / parLevel;
  if (ratio <= 0.25) return 'critical';    // red - critical low
  if (ratio <= 0.75) return 'warning';     // yellow/amber - getting low
  return 'healthy';                         // green - adequate stock
}
```

### Role Permission Check (D-41 through D-44)
```typescript
// Inventory permission middleware
const INVENTORY_PERMISSIONS = {
  viewInventory: ['admin', 'clinician', 'inventory_manager', 'front_desk'],
  manageStock: ['admin', 'inventory_manager', 'front_desk'],
  dispense: ['admin', 'clinician', 'inventory_manager'],
  setPricesAndParLevels: ['admin', 'inventory_manager'],
  exportData: ['admin', 'inventory_manager'],
} as const;

// Middleware for Fastify
function requireInventoryPermission(action: keyof typeof INVENTORY_PERMISSIONS) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const userRole = request.user.role;
    const customPerms = request.user.customPermissions; // Phase 1, D-16
    if (!INVENTORY_PERMISSIONS[action].includes(userRole) && !customPerms?.[action]) {
      throw new ForbiddenError(`Permission denied: ${action}`);
    }
  };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| expo-barcode-scanner | expo-camera CameraView | Expo SDK 50 (deprecated) / SDK 52 (removed) | Must use expo-camera or react-native-vision-camera |
| react-native-vision-camera V4 | V5.0.1 | April 2026 | New API, margelo.com docs, V4 archived |
| WatermelonDB as default offline DB | expo-sqlite + local-first architecture | 2025-2026 | Expo officially recommends expo-sqlite + sync layer over WatermelonDB |
| Manual barcode parsing | MLKit (Android) / Vision Kit (iOS) | 2024+ | Platform-native ML models handle all formats reliably |
| Prisma window functions | Still requires $queryRaw | Ongoing (Issue #7039) | FIFO queries must use raw SQL for window functions and FOR UPDATE |

**Deprecated/outdated:**
- **expo-barcode-scanner:** Removed in SDK 52. Do not use.
- **react-native-vision-camera V4:** Archived. Use V5.
- **rodgomesc/vision-camera-code-scanner:** Designed for VisionCamera V2/V3. Use @mgcrea/vision-camera-barcode-scanner for V4/V5.

## Open Questions

1. **VisionCamera V5 + Expo SDK 52 stability**
   - What we know: V5.0.1 released 2026-04-16, supports New Architecture. npm shows compatibility with recent React Native.
   - What's unclear: Exact compatibility matrix with Expo SDK 52's New Architecture. Community reports for V5 are very recent.
   - Recommendation: Include a Wave 0 spike task to validate VisionCamera V5 barcode scanning on a mid-range Android device with Expo dev client before building full scanner UI. Fallback: expo-camera CameraView (less ideal for continuous scanning but functional).

2. **@mgcrea/vision-camera-barcode-scanner V5 compatibility**
   - What we know: It's designed for VisionCamera, uses MLKit.
   - What's unclear: Whether the latest version explicitly supports VisionCamera V5. The plugin ecosystem is fragmented.
   - Recommendation: Validate in the same Wave 0 spike. Alternative plugin: react-native-vision-camera-mlkit (newer, covers barcode + more).

3. **Bottom sheet + camera interaction on specific Android devices**
   - What we know: Reported black screen issues exist between @gorhom/bottom-sheet and camera views.
   - What's unclear: Whether VisionCamera V5 resolves this or if the issue persists with specific devices.
   - Recommendation: Test on Samsung A-series and Xiaomi Redmi (common mid-range phones in India). Have fallback of using React Native Modal instead of bottom sheet if issues persist.

## Environment Availability

> Phase 5 depends on camera hardware for barcode scanning -- environment audit focuses on build tooling.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | API server, build tools | Verify at execution | 22 LTS expected | -- |
| PostgreSQL | Database | Verify at execution | 16+ expected | Docker container |
| Redis | Caching, real-time | Verify at execution | 7+ expected | Docker container |
| Expo CLI | Mobile builds | Verify at execution | Latest expected | npx expo |
| EAS CLI | Dev client builds | Verify at execution | Latest expected | npx eas |
| Physical Android device | Barcode scan testing | Required | Android 8+ | Android emulator (limited camera) |
| Docker | Local dev environment | Verify at execution | -- | Direct install of PG/Redis |

**Missing dependencies with no fallback:**
- Physical Android 8+ device required for meaningful barcode scanning testing

**Missing dependencies with fallback:**
- If PostgreSQL not installed locally: use Docker container
- If Redis not installed locally: use Docker container

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (from project stack) |
| Config file | `vitest.config.ts` (verify exists -- see Wave 0) |
| Quick run command | `npx vitest run --reporter=verbose src/modules/inventory` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INV-01 | Add inventory item with name, category, unit, price | unit | `npx vitest run tests/inventory/item-crud.test.ts -t "create item"` | Wave 0 |
| INV-02 | Update stock quantities manually with reason | unit | `npx vitest run tests/inventory/stock-adjustment.test.ts` | Wave 0 |
| INV-03 | Scan barcode to identify and update stock | integration | Manual on device (camera required). Unit test for barcode lookup logic only | Wave 0 (lookup only) |
| INV-04 | Record batch/lot numbers and expiry dates | unit | `npx vitest run tests/inventory/stock-receipt.test.ts` | Wave 0 |
| INV-05 | FIFO dispensing enforcement | unit | `npx vitest run tests/inventory/fifo-dispense.test.ts` | Wave 0 |
| INV-06 | Par-level threshold alerts | unit | `npx vitest run tests/inventory/par-level-alerts.test.ts` | Wave 0 |
| INV-07 | Generate want-list of items below par | unit | `npx vitest run tests/inventory/want-list.test.ts` | Wave 0 |
| INV-08 | Offline barcode scanning with sync | integration | Manual on device (requires airplane mode). Unit test for queue logic only | Wave 0 (queue only) |

### Sampling Rate
- **Per task commit:** `npx vitest run src/modules/inventory --reporter=verbose`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/inventory/item-crud.test.ts` -- covers INV-01
- [ ] `tests/inventory/stock-adjustment.test.ts` -- covers INV-02
- [ ] `tests/inventory/stock-receipt.test.ts` -- covers INV-04
- [ ] `tests/inventory/fifo-dispense.test.ts` -- covers INV-05 (critical: multi-batch FIFO, expired batch blocking, override)
- [ ] `tests/inventory/par-level-alerts.test.ts` -- covers INV-06
- [ ] `tests/inventory/want-list.test.ts` -- covers INV-07
- [ ] `tests/inventory/offline-queue.test.ts` -- covers INV-08 queue logic (not camera)
- [ ] `tests/inventory/barcode-lookup.test.ts` -- covers INV-03 lookup logic (not camera)
- [ ] `tests/inventory/stock-movement.test.ts` -- covers D-45, D-46 audit trail
- [ ] Test fixtures: shared Prisma mock setup for inventory module
- [ ] VisionCamera V5 + barcode scanning spike on physical device (manual, not automated)

## Project Constraints (from CLAUDE.md)

- Follow Domain-Driven Design with bounded contexts -- inventory is a bounded context under `apps/api/src/modules/inventory/`
- Keep files under 500 lines -- split controllers/services per entity
- Use typed interfaces for all public APIs -- all inventory API types in `types/inventory.types.ts`
- Prefer TDD London School (mock-first) -- write tests before implementation for FIFO logic, stock adjustments
- Use event sourcing for state changes -- stock_movements table IS the event log; currentQty is derived/cached state
- Ensure input validation at system boundaries -- zod schemas validate all API inputs and mobile form data
- NEVER save to root folder -- all inventory code in `apps/`, `packages/`, or `tests/` directories
- ALWAYS run tests after making code changes
- ALWAYS verify build succeeds before committing
- NEVER hardcode API keys, secrets, or credentials

## Sources

### Primary (HIGH confidence)
- [Expo Camera SDK documentation](https://docs.expo.dev/versions/latest/sdk/camera/) -- CameraView API, barcode types, platform differences
- [Expo barcode-scanner migration guide](https://github.com/expo/fyi/blob/main/barcode-scanner-to-expo-camera.md) -- Migration from deprecated expo-barcode-scanner
- [Expo local-first architecture guide](https://docs.expo.dev/guides/local-first/) -- Official offline/local-first recommendations
- [VisionCamera V5 docs](https://visioncamera.margelo.com/docs/guides/code-scanning) -- Code scanning API, barcode formats
- [WatermelonDB sync limitations](https://watermelondb.dev/docs/Sync/Limitations) -- Push conflict handling, full record transmission
- npm registry (verified 2026-04-19): react-native-vision-camera 5.0.1, expo-camera 55.0.15, expo-sqlite 55.0.15, @gorhom/bottom-sheet 5.2.9, @nozbe/watermelondb 0.28.0, papaparse 5.5.3

### Secondary (MEDIUM confidence)
- [Scanbot: react-native-vision-camera vs expo-camera comparison](https://scanbot.io/blog/react-native-vision-camera-vs-expo-camera/) -- Feature comparison, Android performance differences
- [WatermelonDB Expo SDK 52 plugin](https://github.com/LovesWorking/watermelondb-expo-plugin-sdk-52-plus) -- Community plugin for New Architecture compatibility
- [WatermelonDB sync implementation details](https://watermelondb.dev/docs/Implementation/SyncImpl) -- Per-column client-wins conflict resolution
- [PostgreSQL materialized views documentation](https://www.postgresql.org/docs/current/rules-materializedviews.html) -- Performance optimization for alert queries
- [Expo SDK 52 changelog](https://expo.dev/changelog/2024-11-12-sdk-52) -- New Architecture defaults, camera changes
- [Supabase + WatermelonDB guide](https://supabase.com/blog/react-native-offline-first-watermelon-db) -- Offline-first patterns with WatermelonDB

### Tertiary (LOW confidence)
- [GitHub issue #44491: SDK 55 barcode scanning disabled](https://github.com/expo/expo/issues/44491) -- iOS-specific issue in SDK 55, may indicate ongoing instability in expo-camera barcode scanning
- [GitHub issue #1319: BottomSheet + Camera conflicts](https://github.com/gorhom/react-native-bottom-sheet/issues/1319) -- Camera preview black screen with bottom sheet
- [Expo SDK 55 launchScanner issue #40880](https://github.com/expo/expo/issues/40880) -- Android launchScanner stopped working
- Community reports on expo-camera onBarcodeScanned reliability on Android (multiple GitHub issues) -- pattern of intermittent failures

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All versions verified against npm registry on 2026-04-19. VisionCamera V5 is very new (3 days old) but is the successor to the well-established V4.
- Architecture: HIGH -- Database patterns (append-only log, FIFO with row locking, batch tracking) are well-established in pharmaceutical/inventory systems.
- Pitfalls: HIGH -- Identified from multiple sources including GitHub issues, community reports, and architectural analysis of concurrency scenarios.
- Barcode library choice: MEDIUM -- VisionCamera V5 is the right architecture but needs validation spike due to being 3 days old. Fallback to expo-camera is viable but inferior for continuous scanning.
- Offline sync: MEDIUM -- expo-sqlite approach is simpler and more maintainable than WatermelonDB for this scope, but custom sync queue requires careful implementation.

**Research date:** 2026-04-19
**Valid until:** 2026-05-19 (30 days -- VisionCamera V5 ecosystem is evolving rapidly, revalidate barcode scanning library before execution if delayed)
