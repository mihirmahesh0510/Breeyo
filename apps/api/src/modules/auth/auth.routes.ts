import type { FastifyInstance } from 'fastify';
import { AuthService } from './auth.service.js';
import { EmailService } from './email.service.js';
import { OtpService } from './otp.service.js';
import { TokenService } from './token.service.js';
import { PermissionService } from './permission.service.js';
import { createAuthController } from './auth.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { tenantContext } from '../../middleware/tenant-context.js';
import { requirePermission } from '../../middleware/authorize.js';

export default async function authRoutes(fastify: FastifyInstance) {
  const emailService = new EmailService();
  const otpService = new OtpService(fastify.redis);
  // Admin client by design: runs before tenantContext (D-30 exemption).
  //
  // The whole auth module is pre-tenant. Login, OTP verification and token
  // refresh all execute before a clinic has been selected, so `request.db` does
  // not exist yet and `app.clinic_id` cannot be bound. These three services read
  // `users`, `refresh_tokens`, `roles`, `permissions` and `clinic_member_roles`
  // — global reference tables plan 06-00 deliberately left without RLS policies
  // because they are the tables that *establish* which clinic the caller is in.
  // `scripts/check-tenant-client.sh` hardcodes this file as exempt.
  const tokenService = new TokenService(fastify.prisma, fastify.jwt);
  const authService = new AuthService(fastify.prisma, fastify.redis, emailService);
  const permissionService = new PermissionService(fastify.prisma, fastify.redis);

  // Wire up cross-service dependencies
  authService.setTokenService(tokenService);
  authService.setOtpService(otpService);
  authService.setPermissionService(permissionService);

  // Decorate permissionService on fastify for the authorize middleware
  if (!fastify.hasDecorator('permissionService')) {
    fastify.decorate('permissionService', permissionService);
  }

  const controller = createAuthController(authService, otpService, tokenService, permissionService);

  // Existing routes
  fastify.post('/auth/signup', controller.signupHandler);
  fastify.get('/auth/verify-email', controller.verifyEmailHandler);
  fastify.post('/auth/password-reset/request', controller.requestPasswordResetHandler);
  fastify.post('/auth/password-reset/confirm', controller.resetPasswordHandler);

  // Login / session routes
  fastify.post('/auth/login', controller.loginHandler);
  fastify.post('/auth/otp/request', controller.otpRequestHandler);
  fastify.post('/auth/otp/verify', controller.otpVerifyHandler);
  fastify.post('/auth/token/refresh', controller.refreshTokenHandler);
  fastify.post('/auth/logout', {
    preHandler: [authenticate],
    handler: controller.logoutHandler,
  });

  // --- RBAC / Staff management routes ---

  fastify.get('/auth/permissions', {
    preHandler: [authenticate, tenantContext],
    handler: controller.getPermissionsHandler,
  });

  fastify.post('/auth/staff/invite', {
    preHandler: [authenticate, tenantContext, requirePermission('MANAGE_USERS')],
    handler: controller.inviteStaffHandler,
  });

  fastify.put('/auth/staff/:memberId/roles', {
    preHandler: [authenticate, tenantContext, requirePermission('MANAGE_ROLES')],
    handler: controller.updateRolesHandler,
  });

  fastify.put('/auth/staff/:memberId/permissions', {
    preHandler: [authenticate, tenantContext, requirePermission('MANAGE_ROLES')],
    handler: controller.updatePermissionsHandler,
  });

  fastify.put('/auth/staff/:memberId/deactivate', {
    preHandler: [authenticate, tenantContext, requirePermission('MANAGE_USERS')],
    handler: controller.deactivateMemberHandler,
  });

  fastify.post('/auth/password/change', {
    preHandler: [authenticate],
    handler: controller.changePasswordHandler,
  });

  fastify.get('/auth/clinics', {
    preHandler: [authenticate],
    handler: controller.listClinicsHandler,
  });

  fastify.post('/auth/active-clinic', {
    preHandler: [authenticate],
    handler: controller.switchActiveClinicHandler,
  });

  // Email verification resend (no auth required)
  fastify.post('/auth/verify-email/resend', controller.resendVerificationHandler);

  // Staff reactivation
  fastify.put('/auth/staff/:memberId/reactivate', {
    preHandler: [authenticate, tenantContext, requirePermission('MANAGE_USERS')],
    handler: controller.reactivateMemberHandler,
  });
}
