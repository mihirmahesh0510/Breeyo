'use client';

import { useState } from 'react';
import type { InventoryStockRow } from '../hooks/useInventoryWorkbench';
import styles from './InventoryActionTable.module.css';

export interface InventoryActionTableProps {
  rows: InventoryStockRow[];
  /** D-18: sourced from the workbench payload's `writeAllowed` flag. */
  writeAllowed: boolean;
  onAddStock: (itemId: string, quantity: number, reason: string) => Promise<void>;
  onRequestRemoveStock: (row: InventoryStockRow) => void;
}

/**
 * D-30, D-33: dense stock-and-batch table with inline safe actions for
 * normal work. D-18/D-20: when `writeAllowed` is false, the entire Actions
 * column -- header and cells -- is omitted from the render tree rather than
 * rendered-but-disabled, so a Front Desk caller without an inventory-write
 * grant sees a genuinely read-only table, not a table full of greyed-out
 * buttons.
 */
export function InventoryActionTable({ rows, writeAllowed, onAddStock, onRequestRemoveStock }: InventoryActionTableProps) {
  const [addingItemId, setAddingItemId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const startAdd = (itemId: string) => {
    setAddingItemId(itemId);
    setQuantity('');
  };

  const confirmAdd = async (row: InventoryStockRow) => {
    const parsedQuantity = Number(quantity);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      return;
    }
    setIsSubmitting(true);
    try {
      await onAddStock(row.itemId, parsedQuantity, 'correction');
      setAddingItemId(null);
      setQuantity('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <table className={styles.table} aria-label="Stock and batches">
      <thead>
        <tr>
          <th>Item</th>
          <th>Category</th>
          <th>Unit</th>
          <th>Stock</th>
          <th>Par Level</th>
          <th>Next Expiry</th>
          <th>Batches</th>
          {writeAllowed ? <th>Actions</th> : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.itemId} data-testid={`stock-row-${row.itemId}`} className={row.isLowStock ? styles.lowStockRow : undefined}>
            <td>{row.name}</td>
            <td>{row.category}</td>
            <td>{row.unit}</td>
            <td>{row.currentStock}</td>
            <td>{row.parLevel ?? '—'}</td>
            <td>{row.nextExpiry ? new Date(row.nextExpiry).toLocaleDateString() : '—'}</td>
            <td>{row.batches.length > 0 ? row.batches.map((batch) => batch.lotNumber ?? batch.batchId).join(', ') : '—'}</td>
            {writeAllowed ? (
              <td>
                {addingItemId === row.itemId ? (
                  <span className={styles.inlineForm}>
                    <input
                      aria-label={`Add stock quantity for ${row.name}`}
                      className={styles.quantityInput}
                      value={quantity}
                      inputMode="numeric"
                      onChange={(event) => setQuantity(event.target.value)}
                    />
                    <button
                      type="button"
                      className={styles.actionButton}
                      disabled={isSubmitting}
                      onClick={() => confirmAdd(row)}
                    >
                      Confirm Add
                    </button>
                    <button type="button" className={styles.actionButton} onClick={() => setAddingItemId(null)}>
                      Cancel
                    </button>
                  </span>
                ) : (
                  <span className={styles.inlineForm}>
                    <button type="button" className={styles.actionButton} onClick={() => startAdd(row.itemId)}>
                      Add Stock
                    </button>
                    <button type="button" className={styles.actionButton} onClick={() => onRequestRemoveStock(row)}>
                      Remove Stock
                    </button>
                  </span>
                )}
              </td>
            ) : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
