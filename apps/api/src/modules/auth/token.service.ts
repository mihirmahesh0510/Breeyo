import type { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';
import { AUTH_ERRORS } from '@breeyo/types';
import { writeAuditLog, AuditEvent } from '../../lib/audit-log.js';

function throwError(statusCode: number, code: string, message: string): never {
  const error = new Error(message) as any;
  error.statusCode = statusCode;
  error.code = code;
  throw error;
}

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export interface JwtSigner {
  sign(payload: Record<string, unknown>, options?: { expiresIn: string }): string;
}

export class TokenService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly jwt: JwtSigner,
  ) {}

  async generateTokenPair(
    userId: string,
    clinicId: string,
    options?: {
      familyId?: string;
      ipAddress?: string;
      userAgent?: string;
    },
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    const familyId = options?.familyId || crypto.randomUUID();

    // 1. Generate access token
    const accessToken = this.jwt.sign(
      { sub: userId, clinicId, type: 'access' },
      { expiresIn: '15m' },
    );

    // 2. Generate refresh token raw value
    const rawRefreshToken = crypto.randomBytes(32).toString('hex');

    // 3. Hash refresh token
    const tokenHash = hashToken(rawRefreshToken);

    // 4. Store in RefreshToken table (30-day expiry)
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        familyId,
        clinicId,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        ipAddress: options?.ipAddress || null,
        userAgent: options?.userAgent || null,
      },
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: 900, // 15 minutes in seconds
    };
  }

  async refreshTokens(
    rawRefreshToken: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    const tokenHash = hashToken(rawRefreshToken);

    // 1. Find valid (non-revoked, non-expired) RefreshToken
    const existingToken = await this.prisma.refreshToken.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!existingToken) {
      // 2. Check if a REVOKED token exists with this hash (token replay detection)
      const revokedToken = await this.prisma.refreshToken.findFirst({
        where: {
          tokenHash,
          revokedAt: { not: null },
        },
      });

      if (revokedToken) {
        // Token replay detected! Invalidate entire family.
        await this.revokeFamily(revokedToken.familyId);

        // Write audit event
        await writeAuditLog(this.prisma, AuditEvent.TOKEN_REUSE_DETECTED, {
          userId: revokedToken.userId,
          clinicId: revokedToken.clinicId,
          ipAddress,
          userAgent,
          metadata: { familyId: revokedToken.familyId },
        });

        throwError(
          401,
          AUTH_ERRORS.TOKEN_REUSE_DETECTED.code,
          AUTH_ERRORS.TOKEN_REUSE_DETECTED.message,
        );
      }

      // Token not found at all -- expired or never existed
      throwError(
        401,
        AUTH_ERRORS.SESSION_EXPIRED.code,
        AUTH_ERRORS.SESSION_EXPIRED.message,
      );
    }

    // 3. Revoke the current token
    await this.prisma.refreshToken.update({
      where: { id: existingToken.id },
      data: { revokedAt: new Date() },
    });

    // 4. Generate new token pair with SAME familyId
    const newPair = await this.generateTokenPair(
      existingToken.userId,
      existingToken.clinicId,
      {
        familyId: existingToken.familyId,
        ipAddress,
        userAgent,
      },
    );

    // 5. Write audit event
    await writeAuditLog(this.prisma, AuditEvent.TOKEN_REFRESH, {
      userId: existingToken.userId,
      clinicId: existingToken.clinicId,
      ipAddress,
      userAgent,
    });

    return newPair;
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: {
        familyId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }
}
