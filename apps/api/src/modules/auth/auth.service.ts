import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import * as argon2 from 'argon2';
import crypto from 'node:crypto';
import type { SignupInput } from '@breeyo/validators';
import { AUTH_ERRORS } from '@breeyo/types';
import { writeAuditLog, AuditEvent } from '../../lib/audit-log.js';
import type { EmailService } from './email.service.js';
import type { TokenService } from './token.service.js';
import type { OtpService } from './otp.service.js';
import type { PermissionService } from './permission.service.js';

function throwError(
  statusCode: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): never {
  const error = new Error(message) as any;
  error.statusCode = statusCode;
  error.code = code;
  if (details) {
    error.details = details;
  }
  throw error;
}

export class AuthService {
  private tokenService?: TokenService;
  private otpService?: OtpService;
  private permissionService?: PermissionService;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
    private readonly emailService: EmailService,
  ) {}

  setTokenService(tokenService: TokenService): void {
    this.tokenService = tokenService;
  }

  setOtpService(otpService: OtpService): void {
    this.otpService = otpService;
  }

  setPermissionService(permissionService: PermissionService): void {
    this.permissionService = permissionService;
  }

  async signup(
    input: SignupInput,
    ipAddress: string,
    userAgent: string,
  ): Promise<{
    user: { id: string; email: string; fullName: string };
    clinic: { id: string; name: string };
  }> {
    // 1. Check for existing user by email (case-insensitive)
    const existingUser = await this.prisma.user.findFirst({
      where: { email: { equals: input.email, mode: 'insensitive' } },
    });

    if (existingUser) {
      const error = new Error('A user with this email already exists');
      (error as any).statusCode = 409;
      (error as any).code = 'CONFLICT';
      throw error;
    }

    // 2. Hash password
    const passwordHash = await argon2.hash(input.password);

    // 3. Generate email verification token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // 4. Create user, clinic, clinic member, and assign admin role in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Create user
      const user = await tx.user.create({
        data: {
          email: input.email.toLowerCase(),
          phone: input.phone,
          fullName: input.fullName,
          passwordHash,
          licenseNumber: input.licenseNumber || null,
          specialization: input.specialization || null,
          isEmailVerified: false,
          emailVerificationToken: tokenHash,
          emailVerificationExpiry: tokenExpiry,
        },
      });

      // Create clinic with user as owner
      const clinic = await tx.clinic.create({
        data: {
          name: input.clinicName,
          address: input.clinicAddress,
          contactPhone: input.clinicPhone,
          ownerId: user.id,
        },
      });

      // Create ClinicMember linking user to clinic
      const clinicMember = await tx.clinicMember.create({
        data: {
          userId: user.id,
          clinicId: clinic.id,
          isActive: true,
        },
      });

      // Find the Admin role and assign it
      const adminRole = await tx.role.findUnique({
        where: { name: 'Admin' },
      });

      if (adminRole) {
        await tx.clinicMemberRole.create({
          data: {
            clinicMemberId: clinicMember.id,
            roleId: adminRole.id,
          },
        });
      }

      return { user, clinic };
    });

    // 5. Send verification email
    await this.emailService.sendVerificationEmail(result.user.email, rawToken);

    // 6. Write audit event
    await writeAuditLog(this.prisma, AuditEvent.SIGNUP, {
      userId: result.user.id,
      clinicId: result.clinic.id,
      ipAddress,
      userAgent,
    });

    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        fullName: result.user.fullName,
      },
      clinic: {
        id: result.clinic.id,
        name: result.clinic.name,
      },
    };
  }

  async verifyEmail(token: string): Promise<{ message: string }> {
    // 1. Hash the raw token
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // 2. Find user by token hash where expiry > now
    const user = await this.prisma.user.findFirst({
      where: {
        emailVerificationToken: tokenHash,
        emailVerificationExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      const error = new Error('Invalid or expired verification token');
      (error as any).statusCode = 400;
      (error as any).code = 'INVALID_OR_EXPIRED_TOKEN';
      throw error;
    }

    // 3. Update user
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpiry: null,
      },
    });

    // 4. Write audit event
    await writeAuditLog(this.prisma, AuditEvent.EMAIL_VERIFIED, {
      userId: user.id,
    });

    return { message: 'Email verified successfully' };
  }

  async requestPasswordReset(email: string): Promise<{ message: string }> {
    // 1. Find user by email (case-insensitive)
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });

    // 2. If not found, return success (don't leak existence)
    if (!user) {
      return { message: 'If the email exists, a reset link has been sent' };
    }

    // 3. Generate reset token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const tokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // 4. Save token hash and expiry on user
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: tokenHash,
        passwordResetExpiry: tokenExpiry,
      },
    });

    // 5. Send password reset email
    await this.emailService.sendPasswordResetEmail(user.email, rawToken);

    // 6. Write audit event
    await writeAuditLog(this.prisma, AuditEvent.PASSWORD_RESET_REQUEST, {
      userId: user.id,
    });

    return { message: 'If the email exists, a reset link has been sent' };
  }

  async resetPassword(
    token: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    // 1. Hash the raw token
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // 2. Find user by token hash where expiry > now
    const user = await this.prisma.user.findFirst({
      where: {
        passwordResetToken: tokenHash,
        passwordResetExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      const error = new Error('Invalid or expired reset token');
      (error as any).statusCode = 400;
      (error as any).code = 'INVALID_OR_EXPIRED_TOKEN';
      throw error;
    }

    // 3. Hash new password
    const passwordHash = await argon2.hash(newPassword);

    // 4. Update user password and clear reset token
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpiry: null,
      },
    });

    // 5. Write audit event
    await writeAuditLog(this.prisma, AuditEvent.PASSWORD_RESET_COMPLETE, {
      userId: user.id,
    });

    return { message: 'Password reset successfully' };
  }

  // --- New methods for login, OTP login, and logout ---

  async login(
    email: string,
    password: string,
    clinicId: string | undefined,
    ipAddress: string,
    userAgent: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    user: { id: string; email: string; fullName: string };
    clinic: { id: string; name: string };
  }> {
    if (!this.tokenService) {
      throw new Error('TokenService not initialized');
    }

    // 1. Find user by email (case-insensitive)
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });

    // 2. If not found or not active, throw INVALID_CREDENTIALS
    if (!user || !user.isActive) {
      throwError(
        401,
        AUTH_ERRORS.INVALID_CREDENTIALS.code,
        AUTH_ERRORS.INVALID_CREDENTIALS.message,
      );
    }

    // 3. Verify password
    const isPasswordValid = await argon2.verify(user.passwordHash, password);
    if (!isPasswordValid) {
      // Write LOGIN_FAILED audit
      await writeAuditLog(this.prisma, AuditEvent.LOGIN_FAILED, {
        userId: user.id,
        ipAddress,
        userAgent,
        metadata: { reason: 'invalid_password' },
      });

      throwError(
        401,
        AUTH_ERRORS.INVALID_CREDENTIALS.code,
        AUTH_ERRORS.INVALID_CREDENTIALS.message,
      );
    }

    // 4. Check email verified
    if (!user.isEmailVerified) {
      throwError(
        401,
        AUTH_ERRORS.EMAIL_NOT_VERIFIED.code,
        AUTH_ERRORS.EMAIL_NOT_VERIFIED.message,
      );
    }

    // 5. Resolve clinic
    const resolvedClinic = await this.resolveClinic(user.id, clinicId);

    // 6. Generate token pair
    const tokens = await this.tokenService.generateTokenPair(
      user.id,
      resolvedClinic.id,
      { ipAddress, userAgent },
    );

    // 7. Write LOGIN_SUCCESS audit
    await writeAuditLog(this.prisma, AuditEvent.LOGIN_SUCCESS, {
      userId: user.id,
      clinicId: resolvedClinic.id,
      ipAddress,
      userAgent,
      metadata: { method: 'password' },
    });

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
      },
      clinic: {
        id: resolvedClinic.id,
        name: resolvedClinic.name,
      },
    };
  }

  async otpLogin(
    phone: string,
    otp: string,
    clinicId: string | undefined,
    ipAddress: string,
    userAgent: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    user: { id: string; email: string; fullName: string };
    clinic: { id: string; name: string };
  }> {
    if (!this.tokenService || !this.otpService) {
      throw new Error('TokenService or OtpService not initialized');
    }

    // 1. Verify OTP
    await this.otpService.verifyOtp(phone, otp);

    // 2. Find user by phone
    const user = await this.prisma.user.findFirst({
      where: { phone },
    });

    // 3. If not found or not active, throw INVALID_CREDENTIALS
    if (!user || !user.isActive) {
      throwError(
        401,
        AUTH_ERRORS.INVALID_CREDENTIALS.code,
        AUTH_ERRORS.INVALID_CREDENTIALS.message,
      );
    }

    // 4. If phone not verified, set isPhoneVerified = true (first OTP login verifies phone)
    if (!user.isPhoneVerified) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { isPhoneVerified: true },
      });
    }

    // 5. Resolve clinic
    const resolvedClinic = await this.resolveClinic(user.id, clinicId);

    // 6. Generate token pair
    const tokens = await this.tokenService.generateTokenPair(
      user.id,
      resolvedClinic.id,
      { ipAddress, userAgent },
    );

    // 7. Write LOGIN_SUCCESS audit with method: 'otp'
    await writeAuditLog(this.prisma, AuditEvent.LOGIN_SUCCESS, {
      userId: user.id,
      clinicId: resolvedClinic.id,
      ipAddress,
      userAgent,
      metadata: { method: 'otp' },
    });

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
      },
      clinic: {
        id: resolvedClinic.id,
        name: resolvedClinic.name,
      },
    };
  }

  async logout(
    userId: string,
    refreshToken: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<{ message: string }> {
    // 1. Hash the refresh token
    const tokenHash = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');

    // 2. Find RefreshToken by tokenHash where userId matches
    const token = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, userId },
    });

    // 3. If found and not revoked, revoke it
    if (token && !token.revokedAt) {
      await this.prisma.refreshToken.update({
        where: { id: token.id },
        data: { revokedAt: new Date() },
      });
    }

    // 4. Write LOGOUT audit event
    await writeAuditLog(this.prisma, AuditEvent.LOGOUT, {
      userId,
      ipAddress,
      userAgent,
    });

    return { message: 'Logged out successfully' };
  }

  // --- Staff management ---

  async inviteStaff(
    input: { phone: string; fullName: string; roleName: string },
    clinicId: string,
    inviterId: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<{
    member: { id: string; userId: string; clinicId: string; role: string };
  }> {
    // 1. Find or create user by phone
    let user = await this.prisma.user.findFirst({
      where: { phone: input.phone },
    });

    if (!user) {
      // Create user with random password
      const randomPassword = crypto.randomBytes(16).toString('hex');
      const passwordHash = await argon2.hash(randomPassword);

      user = await this.prisma.user.create({
        data: {
          email: `${input.phone.replace('+', '')}@placeholder.breeyo.in`,
          phone: input.phone,
          fullName: input.fullName,
          passwordHash,
          isActive: true,
          isEmailVerified: false,
        },
      });
    }

    // 2. Look up Role by name
    const role = await this.prisma.role.findUnique({
      where: { name: input.roleName },
    });

    if (!role) {
      throwError(400, 'INVALID_ROLE', `Role '${input.roleName}' does not exist`);
    }

    // 3. Find or create ClinicMember
    let member = await this.prisma.clinicMember.findUnique({
      where: {
        userId_clinicId: {
          userId: user.id,
          clinicId,
        },
      },
    });

    if (!member) {
      member = await this.prisma.clinicMember.create({
        data: {
          userId: user.id,
          clinicId,
          isActive: true,
        },
      });
    }

    // 4. Create ClinicMemberRole if not exists
    const existingMemberRole = await this.prisma.clinicMemberRole.findUnique({
      where: {
        clinicMemberId_roleId: {
          clinicMemberId: member.id,
          roleId: role.id,
        },
      },
    });

    if (!existingMemberRole) {
      await this.prisma.clinicMemberRole.create({
        data: {
          clinicMemberId: member.id,
          roleId: role.id,
        },
      });
    }

    // 5. Write audit
    await writeAuditLog(this.prisma, AuditEvent.USER_INVITED, {
      userId: inviterId,
      clinicId,
      targetUserId: user.id,
      ipAddress,
      userAgent,
      metadata: { roleName: input.roleName, phone: input.phone },
    });

    // 6. Send invite SMS
    const clinic = await this.prisma.clinic.findUnique({ where: { id: clinicId } });
    const inviteMsg = `You've been invited to ${clinic?.name ?? 'a clinic'} on Breeyo. Log in with: ${input.phone}`;
    if (process.env.NODE_ENV === 'production' && process.env.MSG91_AUTH_KEY) {
      // MSG91 send in production
      console.log(`[SMS] Staff invite to ${input.phone}: ${inviteMsg}`);
    } else {
      console.log(`[SMS] Staff invite to ${input.phone}: ${inviteMsg}`);
    }

    return {
      member: {
        id: member.id,
        userId: user.id,
        clinicId,
        role: input.roleName,
      },
    };
  }

  async updateMemberRoles(
    memberId: string,
    roleIds: string[],
    clinicId: string,
    adminId: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<{ message: string }> {
    // Verify member belongs to clinic
    const member = await this.prisma.clinicMember.findFirst({
      where: { id: memberId, clinicId },
    });

    if (!member) {
      throwError(404, 'NOT_FOUND', 'Member not found in this clinic');
    }

    // Delete existing roles and create new ones
    await this.prisma.$transaction(async (tx) => {
      await tx.clinicMemberRole.deleteMany({
        where: { clinicMemberId: memberId },
      });

      await tx.clinicMemberRole.createMany({
        data: roleIds.map((roleId) => ({
          clinicMemberId: memberId,
          roleId,
        })),
      });
    });

    // Invalidate permission cache
    if (this.permissionService) {
      await this.permissionService.invalidateCache(member.userId, clinicId);
    }

    // Write audit
    await writeAuditLog(this.prisma, AuditEvent.ROLE_ASSIGNED, {
      userId: adminId,
      clinicId,
      targetUserId: member.userId,
      ipAddress,
      userAgent,
      metadata: { memberId, roleIds },
    });

    return { message: 'Roles updated successfully' };
  }

  async updateMemberPermissions(
    memberId: string,
    overrides: Array<{ permissionCode: string; granted: boolean }>,
    clinicId: string,
    adminId: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<{ message: string }> {
    // Find member, verify clinicId
    const member = await this.prisma.clinicMember.findFirst({
      where: { id: memberId, clinicId },
    });

    if (!member) {
      throwError(404, 'NOT_FOUND', 'Member not found in this clinic');
    }

    // For each override: find Permission by code, upsert UserPermissionOverride
    for (const override of overrides) {
      const permission = await this.prisma.permission.findUnique({
        where: { code: override.permissionCode },
      });

      if (!permission) {
        throwError(400, 'INVALID_PERMISSION', `Permission '${override.permissionCode}' does not exist`);
      }

      await this.prisma.userPermissionOverride.upsert({
        where: {
          clinicMemberId_permissionId: {
            clinicMemberId: memberId,
            permissionId: permission.id,
          },
        },
        update: { granted: override.granted },
        create: {
          clinicMemberId: memberId,
          permissionId: permission.id,
          granted: override.granted,
        },
      });
    }

    // Invalidate permission cache
    if (this.permissionService) {
      await this.permissionService.invalidateCache(member.userId, clinicId);
    }

    // Write audit
    await writeAuditLog(this.prisma, AuditEvent.PERMISSION_OVERRIDE, {
      userId: adminId,
      clinicId,
      targetUserId: member.userId,
      ipAddress,
      userAgent,
      metadata: { memberId, overrides },
    });

    return { message: 'Permission overrides updated successfully' };
  }

  async deactivateMember(
    memberId: string,
    clinicId: string,
    adminId: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<{ message: string }> {
    // Find member, verify clinicId
    const member = await this.prisma.clinicMember.findFirst({
      where: { id: memberId, clinicId },
    });

    if (!member) {
      throwError(404, 'NOT_FOUND', 'Member not found in this clinic');
    }

    // Sole-admin guard: check if target has Admin role and is the only active admin
    const targetRoles = await this.prisma.clinicMemberRole.findMany({
      where: { clinicMemberId: memberId },
      include: { role: true },
    });

    const isTargetAdmin = targetRoles.some((r) => r.role.name === 'Admin');

    if (isTargetAdmin) {
      // Count active admins in this clinic
      const activeAdminCount = await this.prisma.clinicMemberRole.count({
        where: {
          role: { name: 'Admin' },
          clinicMember: {
            clinicId,
            isActive: true,
          },
        },
      });

      if (activeAdminCount <= 1) {
        throwError(
          409,
          'SOLE_ADMIN',
          'Assign another admin before deactivating yourself',
        );
      }
    }

    // Set isActive = false
    await this.prisma.clinicMember.update({
      where: { id: memberId },
      data: { isActive: false },
    });

    // Invalidate permission cache
    if (this.permissionService) {
      await this.permissionService.invalidateCache(member.userId, clinicId);
    }

    // Write audit
    await writeAuditLog(this.prisma, AuditEvent.USER_DEACTIVATED, {
      userId: adminId,
      clinicId,
      targetUserId: member.userId,
      ipAddress,
      userAgent,
      metadata: { memberId },
    });

    return { message: 'Member deactivated successfully' };
  }

  async resendVerificationEmail(
    email: string,
  ): Promise<{ message: string }> {
    const normalizedEmail = email.toLowerCase();

    // 1. Check Redis rate limit
    const redisKey = `email_resend:${normalizedEmail}`;
    const currentCount = await this.redis.get(redisKey);

    if (currentCount && parseInt(currentCount, 10) >= 3) {
      throwError(
        429,
        'RATE_LIMIT_EXCEEDED',
        'Too many verification email requests. Please try again later.',
      );
    }

    // 2. Find user by email (case-insensitive)
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });

    // If not found, return generic message (don't leak existence)
    if (!user) {
      return { message: 'If the email exists, a verification link has been sent' };
    }

    // 3. If already verified, return early
    if (user.isEmailVerified) {
      return { message: 'Email already verified' };
    }

    // 4. Generate new verification token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // 5. Update user with new token
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationToken: tokenHash,
        emailVerificationExpiry: tokenExpiry,
      },
    });

    // 6. Send verification email
    await this.emailService.sendVerificationEmail(user.email, rawToken);

    // 7. Increment Redis counter with 1-hour expiry
    await this.redis.incr(redisKey);
    await this.redis.expire(redisKey, 3600);

    return { message: 'If the email exists, a verification link has been sent' };
  }

  async reactivateMember(
    memberId: string,
    clinicId: string,
    adminId: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<{
    member: {
      id: string;
      userId: string;
      clinicId: string;
      isActive: boolean;
      roles: string[];
    };
  }> {
    // 1. Find ClinicMember by memberId + clinicId
    const member = await this.prisma.clinicMember.findFirst({
      where: { id: memberId, clinicId },
      include: {
        roles: {
          include: { role: true },
        },
      },
    });

    if (!member) {
      throwError(404, 'NOT_FOUND', 'Member not found in this clinic');
    }

    // 2. If already active, throw 409
    if (member.isActive) {
      throwError(409, 'ALREADY_ACTIVE', 'Member is already active');
    }

    // 3. Reactivate clinic member
    await this.prisma.clinicMember.update({
      where: { id: memberId },
      data: { isActive: true },
    });

    // 4. Also reactivate the linked user
    await this.prisma.user.update({
      where: { id: member.userId },
      data: { isActive: true },
    });

    // 5. Invalidate permission cache
    if (this.permissionService) {
      await this.permissionService.invalidateCache(member.userId, clinicId);
    }

    // 6. Write audit event
    await writeAuditLog(this.prisma, AuditEvent.USER_REACTIVATED, {
      userId: adminId,
      clinicId,
      targetUserId: member.userId,
      ipAddress,
      userAgent,
      metadata: { memberId },
    });

    // 7. Return the reactivated member with roles
    return {
      member: {
        id: member.id,
        userId: member.userId,
        clinicId,
        isActive: true,
        roles: member.roles.map((r) => r.role.name),
      },
    };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<{ message: string }> {
    if (!this.tokenService) {
      throw new Error('TokenService not initialized');
    }

    // 1. Get user
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throwError(404, 'NOT_FOUND', 'User not found');
    }

    // 2. Verify current password
    const isValid = await argon2.verify(user.passwordHash, currentPassword);
    if (!isValid) {
      throwError(
        401,
        AUTH_ERRORS.INVALID_CREDENTIALS.code,
        AUTH_ERRORS.INVALID_CREDENTIALS.message,
      );
    }

    // 3. Hash new password and update
    const passwordHash = await argon2.hash(newPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    // 4. Revoke all tokens per D-21
    await this.tokenService.revokeAllUserTokens(userId);

    // 5. Write audit events
    await writeAuditLog(this.prisma, AuditEvent.PASSWORD_CHANGE, {
      userId,
      ipAddress,
      userAgent,
    });

    await writeAuditLog(this.prisma, AuditEvent.SESSION_REVOKED, {
      userId,
      ipAddress,
      userAgent,
      metadata: { reason: 'password_change' },
    });

    return { message: 'Password changed successfully. Please log in again.' };
  }

  async listClinics(
    userId: string,
  ): Promise<{
    clinics: Array<{
      id: string;
      name: string;
      address: string;
      roles: string[];
    }>;
  }> {
    const memberships = await this.prisma.clinicMember.findMany({
      where: { userId, isActive: true },
      include: {
        clinic: true,
        roles: {
          include: { role: true },
        },
      },
    });

    return {
      clinics: memberships.map((m) => ({
        id: m.clinic.id,
        name: m.clinic.name,
        address: m.clinic.address,
        roles: m.roles.map((r) => r.role.name),
      })),
    };
  }

  async switchActiveClinic(
    userId: string,
    clinicId: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    clinic: { id: string; name: string };
  }> {
    if (!this.tokenService) {
      throw new Error('TokenService not initialized');
    }

    // Verify active membership
    const membership = await this.prisma.clinicMember.findFirst({
      where: { userId, clinicId, isActive: true },
      include: { clinic: true },
    });

    if (!membership) {
      throwError(
        403,
        AUTH_ERRORS.FORBIDDEN.code,
        AUTH_ERRORS.FORBIDDEN.message,
      );
    }

    // Generate new token pair scoped to this clinic
    const tokens = await this.tokenService.generateTokenPair(
      userId,
      clinicId,
      { ipAddress, userAgent },
    );

    // Write audit
    await writeAuditLog(this.prisma, AuditEvent.ACTIVE_CLINIC_SWITCH, {
      userId,
      clinicId,
      ipAddress,
      userAgent,
    });

    return {
      ...tokens,
      clinic: {
        id: membership.clinic.id,
        name: membership.clinic.name,
      },
    };
  }

  // --- Private helper: resolve clinic from user memberships ---

  private async resolveClinic(
    userId: string,
    clinicId: string | undefined,
  ): Promise<{ id: string; name: string }> {
    // Check for active clinic memberships
    const memberships = await this.prisma.clinicMember.findMany({
      where: { userId, isActive: true },
      include: { clinic: true },
    });

    if (memberships.length === 0) {
      throwError(
        401,
        AUTH_ERRORS.ACCOUNT_DEACTIVATED.code,
        AUTH_ERRORS.ACCOUNT_DEACTIVATED.message,
      );
    }

    if (clinicId) {
      // Verify user has active membership in specified clinic
      const membership = memberships.find((m) => m.clinicId === clinicId);
      if (!membership) {
        throwError(
          403,
          AUTH_ERRORS.FORBIDDEN.code,
          AUTH_ERRORS.FORBIDDEN.message,
        );
      }
      return { id: membership.clinic.id, name: membership.clinic.name };
    }

    // No clinicId provided
    if (memberships.length === 1) {
      return {
        id: memberships[0].clinic.id,
        name: memberships[0].clinic.name,
      };
    }

    // Multiple clinics -- require selection
    const clinics = memberships.map((m) => ({
      id: m.clinic.id,
      name: m.clinic.name,
    }));

    const error = new Error(AUTH_ERRORS.CLINIC_SELECTION_REQUIRED.message) as any;
    error.statusCode = 400;
    error.code = AUTH_ERRORS.CLINIC_SELECTION_REQUIRED.code;
    error.clinics = clinics;
    throw error;
  }
}
