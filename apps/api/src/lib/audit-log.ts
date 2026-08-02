import type { PrismaClient } from '@prisma/client';

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
  prisma: PrismaClient,
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
