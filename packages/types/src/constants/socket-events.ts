export const SOCKET_EVENTS = {
  PATIENT_CHECKED_IN: 'patient:checked-in',
  QUEUE_UPDATED: 'queue:updated',
  QUEUE_ARCHIVED: 'queue:archived',
  PATIENT_REGISTERED: 'patient:registered',
  PATIENT_UPDATED: 'patient:updated',
  // Phase 6 billing. INVOICE_UPDATED carries any lifecycle change (finalize,
  // void, status recompute); PAYMENT_RECEIVED fires when a payment is captured,
  // including from a Razorpay webhook, so an open InvoiceDetail screen reflects
  // a QR scan without polling.
  INVOICE_UPDATED: 'invoice:updated',
  PAYMENT_RECEIVED: 'payment:received',
} as const;
