import type { Redis } from 'ioredis';
import { AUTH_ERRORS } from '@breeyo/types';

function throwError(statusCode: number, code: string, message: string): never {
  const error = new Error(message) as any;
  error.statusCode = statusCode;
  error.code = code;
  throw error;
}

export class OtpService {
  constructor(private readonly redis: Redis) {}

  async sendOtp(phone: string): Promise<{ sent: true }> {
    // 1. Rate limit check: max 3 requests per 5 minutes
    const rateKey = `otp_rate:${phone}`;
    const count = await this.redis.incr(rateKey);

    // Set TTL on first increment
    if (count === 1) {
      await this.redis.expire(rateKey, 300);
    }

    if (count > 3) {
      throwError(
        429,
        AUTH_ERRORS.OTP_RATE_LIMITED.code,
        AUTH_ERRORS.OTP_RATE_LIMITED.message,
      );
    }

    // 2. Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // 3. Store in Redis with 5-minute TTL
    const otpKey = `otp:${phone}`;
    await this.redis.set(otpKey, otp, 'EX', 300);

    // 4. Send OTP (dev/test: log to console; production: MSG91)
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) {
      // TODO: Integrate MSG91 SMS API
      console.log(`[OtpService] Production SMS to ${phone}: ${otp}`);
    } else {
      console.log(`[OtpService] OTP for ${phone}: ${otp}`);
    }

    // 5. Return success
    return { sent: true };
  }

  async verifyOtp(phone: string, otp: string): Promise<true> {
    const otpKey = `otp:${phone}`;

    // 1. Get stored OTP
    const storedOtp = await this.redis.get(otpKey);

    // 2. If not found, OTP expired
    if (!storedOtp) {
      throwError(
        401,
        AUTH_ERRORS.OTP_EXPIRED.code,
        AUTH_ERRORS.OTP_EXPIRED.message,
      );
    }

    // 3. If doesn't match, invalid OTP
    if (storedOtp !== otp) {
      throwError(
        401,
        AUTH_ERRORS.OTP_INVALID.code,
        AUTH_ERRORS.OTP_INVALID.message,
      );
    }

    // 4. Delete the Redis key (one-time use)
    await this.redis.del(otpKey);

    // 5. Return success
    return true;
  }
}
