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
