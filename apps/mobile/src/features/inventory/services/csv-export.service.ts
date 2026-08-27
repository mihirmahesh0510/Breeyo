/**
 * CSV export (D-47) via papaparse + expo-file-system + expo-sharing, per the
 * exact pattern in 05-RESEARCH.md's "CSV Export" code example. UTF-8 BOM
 * (`'﻿'`) is prepended so Excel on Windows (the common accountant/tax
 * workflow this decision targets) renders non-ASCII correctly instead of
 * mangling the encoding.
 *
 * `date-fns` is not a dependency anywhere in this monorepo (confirmed absent
 * from apps/mobile/package.json) -- following the same native-Intl IST
 * formatting precedent already established by `want-list.service.ts`
 * (queue.repository.ts's `getTodayIST()`), not adding a new dependency for
 * one date format.
 *
 * The row-mapping functions are exported separately from the I/O functions
 * so the mapping logic (column names/values/BOM) is directly unit-testable
 * without mocking expo-file-system/expo-sharing.
 */
import Papa from 'papaparse';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { StockMovement, WantListItem } from '@breeyo/types';

const IST_TIME_ZONE = 'Asia/Kolkata';

/** dd/MM/yyyy HH:mm in Asia/Kolkata, matching the RESEARCH.md example's format string. */
export function formatISTDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';
  const datePart = d.toLocaleDateString('en-GB', {
    timeZone: IST_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const timePart = d.toLocaleTimeString('en-GB', {
    timeZone: IST_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${datePart} ${timePart}`;
}

/** yyyyMMdd, for filenames. */
export function formatDateStamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * WR-7: neutralizes CSV/formula injection. A cell value beginning with `=`,
 * `+`, `-`, or `@` is interpreted as a formula by Excel/Sheets/Numbers when
 * the exported CSV is opened -- prefixing it with `'` forces literal-text
 * treatment. Papaparse's `Papa.unparse` (used below in `toBOMPrefixedCSV`)
 * only performs RFC-4180 quote/comma/newline escaping and does not guard
 * against this, so user-controlled fields (item names, stock-adjustment
 * reasons, user names, categories) must be sanitized before they reach it.
 * Applied only to specific user-controlled fields, not whole rows, so that
 * legitimately "+"-prefixed values (e.g. the Quantity column below) are
 * left untouched.
 */
function sanitizeCsvCell(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

export interface StockMovementCSVRow {
  Date: string;
  Type: string;
  Quantity: string;
  Batch: string;
  Reason: string;
  'Running Total': number;
  User: string;
}

/**
 * Maps `StockMovement` rows into the exact D-47 CSV column shape. Note:
 * `StockMovement` (see packages/types/src/inventory.ts) only carries
 * `batchId`, not a joined `batch.lotNumber` -- the movements/export endpoint
 * (stock-movement.service.ts's `getMovementsForExport`) returns flat rows
 * with no batch relation included, so the "Batch" column uses `batchId`
 * (or '-' when null) rather than a lot number the API doesn't provide.
 */
export function mapMovementsToRows(movements: StockMovement[]): StockMovementCSVRow[] {
  return movements.map((m) => ({
    Date: formatISTDateTime(m.createdAt),
    Type: m.type,
    Quantity: m.quantity > 0 ? `+${m.quantity}` : String(m.quantity),
    Batch: m.batchId ?? '-',
    Reason: m.reason != null ? sanitizeCsvCell(m.reason) : '-',
    'Running Total': m.runningTotal,
    User: sanitizeCsvCell(m.userName),
  }));
}

export interface WantListCSVRow {
  'Item Name': string;
  Category: string;
  Unit: string;
  'Current Stock': number;
  'Par Level': number;
  Deficit: number;
}

export function mapWantListToRows(items: WantListItem[]): WantListCSVRow[] {
  return items.map((item) => ({
    'Item Name': sanitizeCsvCell(item.name),
    Category: sanitizeCsvCell(item.category),
    Unit: item.unit,
    'Current Stock': item.currentStock,
    'Par Level': item.parLevel,
    Deficit: item.deficit,
  }));
}

/** Prepends the UTF-8 BOM Excel needs to detect encoding correctly (D-47). */
export function toBOMPrefixedCSV<T extends object>(rows: T[]): string {
  return '﻿' + Papa.unparse(rows as unknown as Record<string, unknown>[]);
}

export function buildStockHistoryFilename(itemName: string, now: Date = new Date()): string {
  return `${itemName.replace(/\s+/g, '_')}_stock_history_${formatDateStamp(now)}.csv`;
}

export function buildWantListFilename(now: Date = new Date()): string {
  return `want_list_${formatDateStamp(now)}.csv`;
}

/** Writes the CSV to app storage and opens the OS share sheet for it. */
async function writeAndShareCSV(fileName: string, csv: string, dialogTitle: string): Promise<void> {
  const filePath = `${FileSystem.documentDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(filePath, csv, { encoding: FileSystem.EncodingType.UTF8 });
  await Sharing.shareAsync(filePath, { mimeType: 'text/csv', dialogTitle });
}

/**
 * Exports a single item's stock movement history as a CSV and opens the
 * share sheet (D-47). `itemName` is used for both the filename and the
 * share dialog title.
 */
export async function exportStockMovementsCSV(movements: StockMovement[], itemName: string): Promise<void> {
  const csv = toBOMPrefixedCSV(mapMovementsToRows(movements));
  const fileName = buildStockHistoryFilename(itemName);
  await writeAndShareCSV(fileName, csv, `Stock History - ${itemName}`);
}

/**
 * Exports the current want-list as a CSV and opens the share sheet (D-47,
 * complementing the D-24/D-28 WhatsApp text share with a spreadsheet-ready
 * alternative).
 */
export async function exportWantListCSV(items: WantListItem[], clinicName: string): Promise<void> {
  const csv = toBOMPrefixedCSV(mapWantListToRows(items));
  const fileName = buildWantListFilename();
  await writeAndShareCSV(fileName, csv, `Want List - ${clinicName}`);
}
