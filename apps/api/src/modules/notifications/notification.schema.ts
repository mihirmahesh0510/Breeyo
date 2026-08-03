import { z } from 'zod';

export const registerDeviceTokenSchema = {
  body: z.object({
    token: z
      .string()
      .min(1)
      .refine((val) => val.startsWith('ExponentPushToken['), {
        message: 'Token must be a valid Expo push token',
      }),
    platform: z.enum(['ios', 'android']),
  }),
};

export const removeDeviceTokenSchema = {
  body: z.object({
    token: z.string().min(1),
  }),
};

export const listNotificationsSchema = {
  querystring: z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    unreadOnly: z
      .enum(['true', 'false'])
      .optional()
      .transform((val) => val === 'true'),
  }),
};

export const markReadSchema = {
  params: z.object({
    id: z.string().uuid(),
  }),
};
