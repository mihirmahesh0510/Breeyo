// Stock movement types per D-45
export const STOCK_MOVEMENT_TYPES = [
  { value: 'received', label: 'Received', icon: 'package-down', color: 'primary' },
  { value: 'dispensed', label: 'Dispensed', icon: 'package-up', color: 'onSurfaceVariant' },
  { value: 'adjusted', label: 'Adjusted', icon: 'pencil-circle', color: 'onSurfaceVariant' },
  { value: 'disposed', label: 'Disposed', icon: 'delete-circle', color: 'error' },
  { value: 'stock_take', label: 'Stock-Take', icon: 'clipboard-check', color: 'onSurfaceVariant' },
  { value: 'returned', label: 'Returned', icon: 'undo', color: 'primary' },
] as const;

export const MOVEMENT_TYPE_VALUES = STOCK_MOVEMENT_TYPES.map((t) => t.value);
export type StockMovementTypeValue = (typeof STOCK_MOVEMENT_TYPES)[number]['value'];
