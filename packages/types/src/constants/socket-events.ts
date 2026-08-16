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
  // Phase 7 WhatsApp communication (WHA-05). Realtime inbox/thread updates
  // into the clinic:{id} room, mirroring the queue realtime pattern above.
  WHATSAPP_MESSAGE_CREATED: 'whatsapp:message-created',
  WHATSAPP_MESSAGE_STATUS_CHANGED: 'whatsapp:message-status-changed',
  WHATSAPP_THREAD_UPDATED: 'whatsapp:thread-updated',
  // Phase 8 scheduling & calendar. Mirrors the queue realtime pattern above for
  // appointment lifecycle changes and availability edits.
  APPOINTMENT_CREATED: 'appointment:created',
  APPOINTMENT_UPDATED: 'appointment:updated',
  APPOINTMENT_CANCELLED: 'appointment:cancelled',
  AVAILABILITY_UPDATED: 'availability:updated',
} as const;
