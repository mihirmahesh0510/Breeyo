import type { DbClient } from './prisma-rls.js';

export enum AuditEvent {
  SIGNUP = 'SIGNUP',
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILED = 'LOGIN_FAILED',
  LOGOUT = 'LOGOUT',
  TOKEN_REFRESH = 'TOKEN_REFRESH',
  TOKEN_REUSE_DETECTED = 'TOKEN_REUSE_DETECTED',
  PASSWORD_RESET_REQUEST = 'PASSWORD_RESET_REQUEST',
  PASSWORD_RESET_COMPLETE = 'PASSWORD_RESET_COMPLETE',
  PASSWORD_CHANGE = 'PASSWORD_CHANGE',
  EMAIL_VERIFIED = 'EMAIL_VERIFIED',
  OTP_SENT = 'OTP_SENT',
  OTP_VERIFIED = 'OTP_VERIFIED',
  OTP_FAILED = 'OTP_FAILED',
  ROLE_ASSIGNED = 'ROLE_ASSIGNED',
  ROLE_REMOVED = 'ROLE_REMOVED',
  PERMISSION_OVERRIDE = 'PERMISSION_OVERRIDE',
  USER_INVITED = 'USER_INVITED',
  USER_DEACTIVATED = 'USER_DEACTIVATED',
  USER_REACTIVATED = 'USER_REACTIVATED',
  SESSION_REVOKED = 'SESSION_REVOKED',
  ACTIVE_CLINIC_SWITCH = 'ACTIVE_CLINIC_SWITCH',
  // EMR & Clinical Records (Phase 4) — EMR-07 / D-62
  CONSULTATION_FINALIZED = 'CONSULTATION_FINALIZED',
  ADDENDUM_ADDED = 'ADDENDUM_ADDED',
  PRESCRIPTION_DOSAGE_OVERRIDDEN = 'PRESCRIPTION_DOSAGE_OVERRIDDEN',
  VACCINATION_RECORDED = 'VACCINATION_RECORDED',
  DEWORMING_RECORDED = 'DEWORMING_RECORDED',
  ATTACHMENT_UPLOADED = 'ATTACHMENT_UPLOADED',
  ATTACHMENT_DELETED = 'ATTACHMENT_DELETED',
  // WhatsApp Communication (Phase 7) — WHA-02/WHA-05 / D-11, D-12, D-13
  WHATSAPP_CONSENT_GRANTED = 'WHATSAPP_CONSENT_GRANTED',
  WHATSAPP_CONSENT_WITHDRAWN = 'WHATSAPP_CONSENT_WITHDRAWN',
  WHATSAPP_SENT_WITHOUT_CONSENT = 'WHATSAPP_SENT_WITHOUT_CONSENT',
  WHATSAPP_OPT_OUT = 'WHATSAPP_OPT_OUT',
  WHATSAPP_OPT_IN = 'WHATSAPP_OPT_IN',
  WHATSAPP_NUMBER_MARKED_INVALID = 'WHATSAPP_NUMBER_MARKED_INVALID',
  WHATSAPP_BOOKING_CANCELLED = 'WHATSAPP_BOOKING_CANCELLED',
  WHATSAPP_BOOKING_MOVED = 'WHATSAPP_BOOKING_MOVED',
  // Scheduling & Calendar (Phase 8) — SCH-01 / SCH-02
  APPOINTMENT_CREATED = 'APPOINTMENT_CREATED',
  APPOINTMENT_RESCHEDULED = 'APPOINTMENT_RESCHEDULED',
  APPOINTMENT_CANCELLED = 'APPOINTMENT_CANCELLED',
  APPOINTMENT_CHECKED_IN = 'APPOINTMENT_CHECKED_IN',
  APPOINTMENT_COMPLETED = 'APPOINTMENT_COMPLETED',
  APPOINTMENT_NO_SHOW = 'APPOINTMENT_NO_SHOW',
  AVAILABILITY_UPDATED = 'AVAILABILITY_UPDATED',
  BLOCKED_PERIOD_ADDED = 'BLOCKED_PERIOD_ADDED',
  BLOCKED_PERIOD_REMOVED = 'BLOCKED_PERIOD_REMOVED',
  // Scheduling & Calendar (Phase 8, plan 08-10) — SCH-05 / D-15, D-16
  WHATSAPP_OWNER_ACTION_REFUSED = 'WHATSAPP_OWNER_ACTION_REFUSED',
}

export interface AuditLogData {
  userId?: string;
  clinicId?: string;
  targetUserId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export async function writeAuditLog(
  // Accepts either handle: the auth module writes through the admin client
  // (it runs before a clinic is selected), while the clinic-scoped modules
  // write through the tenant handle. The auth_audit_log insert policy admits
  // rows whose clinic_id matches the bound clinic or is NULL.
  prisma: DbClient,
  event: AuditEvent,
  data: AuditLogData,
): Promise<void> {
  await prisma.authAuditLog.create({
    data: {
      userId: data.userId,
      clinicId: data.clinicId,
      event,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      metadata: {
        ...(data.metadata || {}),
        ...(data.targetUserId ? { targetUserId: data.targetUserId } : {}),
      },
    },
  });
}
