export enum NotificationType {
  LOW_STOCK = 'LOW_STOCK',
  EXPIRED_STOCK = 'EXPIRED_STOCK',
  OVERDUE_INVOICE = 'OVERDUE_INVOICE',
  QUEUE_CHANGE = 'QUEUE_CHANGE',
  WHATSAPP_FAILURE = 'WHATSAPP_FAILURE',
  APPOINTMENT_REMINDER = 'APPOINTMENT_REMINDER',
  MOVE_REQUEST = 'MOVE_REQUEST',
  SYSTEM = 'SYSTEM',
}

export enum NotificationModule {
  INVENTORY = 'inventory',
  BILLING = 'billing',
  QUEUE = 'queue',
  WHATSAPP = 'whatsapp',
  SCHEDULING = 'scheduling',
  SYSTEM = 'system',
}

export interface NotificationEvent {
  type: NotificationType;
  module: NotificationModule;
  clinicId: string;
  recipientUserIds: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** Whether to send a push notification. Default true. */
  sendPush?: boolean;
}
