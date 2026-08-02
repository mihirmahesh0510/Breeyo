import { z } from 'zod';

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  phone: z.string().regex(/^\+91\d{10}$/, 'Must be a valid Indian phone number (+91XXXXXXXXXX)'),
  fullName: z.string().min(2).max(100),
  licenseNumber: z.string().optional(),
  specialization: z.string().optional(),
  clinicName: z.string().min(2).max(200),
  clinicAddress: z.string().min(5).max(500),
  clinicPhone: z.string().regex(/^\+91\d{10}$/, 'Must be a valid Indian phone number'),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  clinicId: z.string().uuid().optional(),
});

export const otpRequestSchema = z.object({
  phone: z.string().regex(/^\+91\d{10}$/),
});

export const otpVerifySchema = z.object({
  phone: z.string().regex(/^\+91\d{10}$/),
  otp: z.string().length(6).regex(/^\d{6}$/),
  clinicId: z.string().uuid().optional(),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type OtpRequestInput = z.infer<typeof otpRequestSchema>;
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;
