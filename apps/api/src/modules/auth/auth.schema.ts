import { z } from 'zod';
import { signupSchema } from '@breeyo/validators';

export const signupBodySchema = signupSchema;

export const verifyEmailQuerySchema = z.object({
  token: z.string().min(1),
});

export const passwordResetRequestSchema = z.object({
  email: z.string().email(),
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

export const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  clinicId: z.string().uuid().optional(),
});

export const otpRequestBodySchema = z.object({
  phone: z.string().regex(/^\+91\d{10}$/),
});

export const otpVerifyBodySchema = z.object({
  phone: z.string().regex(/^\+91\d{10}$/),
  otp: z.string().length(6).regex(/^\d{6}$/),
  clinicId: z.string().uuid().optional(),
});

export const refreshTokenBodySchema = z.object({
  refreshToken: z.string().min(1),
});

export const logoutBodySchema = z.object({
  refreshToken: z.string().min(1),
});

// --- RBAC / Staff management schemas ---

export const inviteStaffBodySchema = z.object({
  phone: z.string().regex(/^\+91\d{10}$/),
  fullName: z.string().min(1).max(255),
  roleName: z.string().min(1),
});

export const updateRolesBodySchema = z.object({
  roleIds: z.array(z.string().uuid()).min(1),
});

export const updatePermissionsBodySchema = z.object({
  overrides: z.array(
    z.object({
      permissionCode: z.string().min(1),
      granted: z.boolean(),
    }),
  ).min(1),
});

export const memberIdParamSchema = z.object({
  memberId: z.string().uuid(),
});

export const changePasswordBodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

export const resendVerificationSchema = z.object({
  email: z.string().email(),
});

export const switchClinicBodySchema = z.object({
  clinicId: z.string().uuid(),
});

export type SignupBody = z.infer<typeof signupBodySchema>;
export type VerifyEmailQuery = z.infer<typeof verifyEmailQuerySchema>;
export type PasswordResetRequestBody = z.infer<typeof passwordResetRequestSchema>;
export type PasswordResetConfirmBody = z.infer<typeof passwordResetConfirmSchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
export type OtpRequestBody = z.infer<typeof otpRequestBodySchema>;
export type OtpVerifyBody = z.infer<typeof otpVerifyBodySchema>;
export type RefreshTokenBody = z.infer<typeof refreshTokenBodySchema>;
export type LogoutBody = z.infer<typeof logoutBodySchema>;
export type InviteStaffBody = z.infer<typeof inviteStaffBodySchema>;
export type UpdateRolesBody = z.infer<typeof updateRolesBodySchema>;
export type UpdatePermissionsBody = z.infer<typeof updatePermissionsBodySchema>;
export type MemberIdParam = z.infer<typeof memberIdParamSchema>;
export type ChangePasswordBody = z.infer<typeof changePasswordBodySchema>;
export type SwitchClinicBody = z.infer<typeof switchClinicBodySchema>;
export type ResendVerificationBody = z.infer<typeof resendVerificationSchema>;
