import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AuthService } from './auth.service.js';
import type { OtpService } from './otp.service.js';
import type { TokenService } from './token.service.js';
import type { PermissionService } from './permission.service.js';
import {
  signupBodySchema,
  verifyEmailQuerySchema,
  passwordResetRequestSchema,
  passwordResetConfirmSchema,
  loginBodySchema,
  otpRequestBodySchema,
  otpVerifyBodySchema,
  refreshTokenBodySchema,
  logoutBodySchema,
  inviteStaffBodySchema,
  updateRolesBodySchema,
  updatePermissionsBodySchema,
  memberIdParamSchema,
  changePasswordBodySchema,
  switchClinicBodySchema,
  resendVerificationSchema,
} from './auth.schema.js';

function validationError(reply: FastifyReply, issues: { message: string }[]) {
  return reply.status(400).send({
    error: {
      code: 'VALIDATION_ERROR',
      message: issues.map((i) => i.message).join(', '),
    },
  });
}

export function createAuthController(
  authService: AuthService,
  otpService: OtpService,
  tokenService: TokenService,
  permissionService?: PermissionService,
) {
  return {
    async signupHandler(request: FastifyRequest, reply: FastifyReply) {
      const result = signupBodySchema.safeParse(request.body);
      if (!result.success) {
        return validationError(reply, result.error.errors);
      }

      const data = await authService.signup(
        result.data,
        request.ip,
        request.headers['user-agent'] || 'unknown',
      );

      return reply.status(201).send({ data });
    },

    async verifyEmailHandler(request: FastifyRequest, reply: FastifyReply) {
      const result = verifyEmailQuerySchema.safeParse(request.query);
      if (!result.success) {
        return validationError(reply, result.error.errors);
      }

      const data = await authService.verifyEmail(result.data.token);

      return reply.status(200).send({ data });
    },

    async requestPasswordResetHandler(
      request: FastifyRequest,
      reply: FastifyReply,
    ) {
      const result = passwordResetRequestSchema.safeParse(request.body);
      if (!result.success) {
        return validationError(reply, result.error.errors);
      }

      const data = await authService.requestPasswordReset(result.data.email);

      return reply.status(200).send({ data });
    },

    async resetPasswordHandler(request: FastifyRequest, reply: FastifyReply) {
      const result = passwordResetConfirmSchema.safeParse(request.body);
      if (!result.success) {
        return validationError(reply, result.error.errors);
      }

      const data = await authService.resetPassword(
        result.data.token,
        result.data.newPassword,
      );

      return reply.status(200).send({ data });
    },

    async loginHandler(request: FastifyRequest, reply: FastifyReply) {
      const result = loginBodySchema.safeParse(request.body);
      if (!result.success) {
        return validationError(reply, result.error.errors);
      }

      const data = await authService.login(
        result.data.email,
        result.data.password,
        result.data.clinicId,
        request.ip,
        request.headers['user-agent'] || 'unknown',
      );

      return reply.status(200).send({ data });
    },

    async otpRequestHandler(request: FastifyRequest, reply: FastifyReply) {
      const result = otpRequestBodySchema.safeParse(request.body);
      if (!result.success) {
        return validationError(reply, result.error.errors);
      }

      const data = await otpService.sendOtp(result.data.phone);

      return reply.status(200).send({ data });
    },

    async otpVerifyHandler(request: FastifyRequest, reply: FastifyReply) {
      const result = otpVerifyBodySchema.safeParse(request.body);
      if (!result.success) {
        return validationError(reply, result.error.errors);
      }

      const data = await authService.otpLogin(
        result.data.phone,
        result.data.otp,
        result.data.clinicId,
        request.ip,
        request.headers['user-agent'] || 'unknown',
      );

      return reply.status(200).send({ data });
    },

    async refreshTokenHandler(request: FastifyRequest, reply: FastifyReply) {
      const result = refreshTokenBodySchema.safeParse(request.body);
      if (!result.success) {
        return validationError(reply, result.error.errors);
      }

      const data = await tokenService.refreshTokens(
        result.data.refreshToken,
        request.ip,
        request.headers['user-agent'] || 'unknown',
      );

      return reply.status(200).send({ data });
    },

    async logoutHandler(request: FastifyRequest, reply: FastifyReply) {
      const result = logoutBodySchema.safeParse(request.body);
      if (!result.success) {
        return validationError(reply, result.error.errors);
      }

      const data = await authService.logout(
        request.user.id,
        result.data.refreshToken,
        request.ip,
        request.headers['user-agent'] || 'unknown',
      );

      return reply.status(200).send({ data });
    },

    // --- RBAC / Staff management handlers ---

    async getPermissionsHandler(request: FastifyRequest, reply: FastifyReply) {
      if (!permissionService) {
        throw new Error('PermissionService not initialized');
      }

      const permissions = await permissionService.getUserPermissions(
        request.user.id,
        request.user.activeClinicId,
      );

      return reply.status(200).send({ data: { permissions } });
    },

    async inviteStaffHandler(request: FastifyRequest, reply: FastifyReply) {
      const result = inviteStaffBodySchema.safeParse(request.body);
      if (!result.success) {
        return validationError(reply, result.error.errors);
      }

      const data = await authService.inviteStaff(
        result.data,
        request.user.activeClinicId,
        request.user.id,
        request.ip,
        request.headers['user-agent'] || 'unknown',
      );

      return reply.status(201).send({ data });
    },

    async updateRolesHandler(request: FastifyRequest, reply: FastifyReply) {
      const paramResult = memberIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return validationError(reply, paramResult.error.errors);
      }

      const bodyResult = updateRolesBodySchema.safeParse(request.body);
      if (!bodyResult.success) {
        return validationError(reply, bodyResult.error.errors);
      }

      const data = await authService.updateMemberRoles(
        paramResult.data.memberId,
        bodyResult.data.roleIds,
        request.user.activeClinicId,
        request.user.id,
        request.ip,
        request.headers['user-agent'] || 'unknown',
      );

      return reply.status(200).send({ data });
    },

    async updatePermissionsHandler(request: FastifyRequest, reply: FastifyReply) {
      const paramResult = memberIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return validationError(reply, paramResult.error.errors);
      }

      const bodyResult = updatePermissionsBodySchema.safeParse(request.body);
      if (!bodyResult.success) {
        return validationError(reply, bodyResult.error.errors);
      }

      const data = await authService.updateMemberPermissions(
        paramResult.data.memberId,
        bodyResult.data.overrides,
        request.user.activeClinicId,
        request.user.id,
        request.ip,
        request.headers['user-agent'] || 'unknown',
      );

      return reply.status(200).send({ data });
    },

    async deactivateMemberHandler(request: FastifyRequest, reply: FastifyReply) {
      const paramResult = memberIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return validationError(reply, paramResult.error.errors);
      }

      const data = await authService.deactivateMember(
        paramResult.data.memberId,
        request.user.activeClinicId,
        request.user.id,
        request.ip,
        request.headers['user-agent'] || 'unknown',
      );

      return reply.status(200).send({ data });
    },

    async changePasswordHandler(request: FastifyRequest, reply: FastifyReply) {
      const result = changePasswordBodySchema.safeParse(request.body);
      if (!result.success) {
        return validationError(reply, result.error.errors);
      }

      const data = await authService.changePassword(
        request.user.id,
        result.data.currentPassword,
        result.data.newPassword,
        request.ip,
        request.headers['user-agent'] || 'unknown',
      );

      return reply.status(200).send({ data });
    },

    async listClinicsHandler(request: FastifyRequest, reply: FastifyReply) {
      const data = await authService.listClinics(request.user.id);

      return reply.status(200).send({ data });
    },

    async switchActiveClinicHandler(request: FastifyRequest, reply: FastifyReply) {
      const result = switchClinicBodySchema.safeParse(request.body);
      if (!result.success) {
        return validationError(reply, result.error.errors);
      }

      const data = await authService.switchActiveClinic(
        request.user.id,
        result.data.clinicId,
        request.ip,
        request.headers['user-agent'] || 'unknown',
      );

      return reply.status(200).send({ data });
    },

    async resendVerificationHandler(request: FastifyRequest, reply: FastifyReply) {
      const result = resendVerificationSchema.safeParse(request.body);
      if (!result.success) {
        return validationError(reply, result.error.errors);
      }

      const data = await authService.resendVerificationEmail(result.data.email);

      return reply.status(200).send({ data });
    },

    async reactivateMemberHandler(request: FastifyRequest, reply: FastifyReply) {
      const paramResult = memberIdParamSchema.safeParse(request.params);
      if (!paramResult.success) {
        return validationError(reply, paramResult.error.errors);
      }

      const data = await authService.reactivateMember(
        paramResult.data.memberId,
        request.user.activeClinicId,
        request.user.id,
        request.ip,
        request.headers['user-agent'] || 'unknown',
      );

      return reply.status(200).send({ data });
    },
  };
}
