import type { Redis } from 'ioredis';
import { AUTH_ERRORS } from '@breeyo/types';

// A 6-digit numeric OTP has only 1,000,000 possible values -- with no
// per-phone attempt limit, verifyOtp was brute-forceable by an attacker
// spraying guesses (the only protection was a per-IP route rate limit,
// trivially bypassed by rotating source IPs). Locking out after this many
// wrong guesses, scoped per phone like sendOtp's own rate limit already is,
// closes that gap the same way a login password lockout would.
const MAX_VERIFY_ATTEMPTS = 5;

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

    // A fresh OTP means a fresh set of verify attempts -- otherwise a phone
    // that already burned through attempts against an old (expired) OTP
    // would stay locked out even though the user never got 5 real tries
    // against the code they were just sent.
    await this.redis.del(`otp_attempts:${phone}`);

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
    const attemptsKey = `otp_attempts:${phone}`;

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

    // 3. Already locked out from a previous request in this cycle -- checked
    // BEFORE comparing the guess so a correct code submitted after the limit
    // was hit still can't slip through; only a fresh OTP request clears this.
    const existingAttempts = await this.redis.get(attemptsKey);
    if (existingAttempts && Number(existingAttempts) >= MAX_VERIFY_ATTEMPTS) {
      await this.redis.del(otpKey, attemptsKey);
      throwError(
        401,
        AUTH_ERRORS.OTP_LOCKED.code,
        AUTH_ERRORS.OTP_LOCKED.message,
      );
    }

    // 4. If doesn't match, invalid OTP -- count the attempt. Once this reaches
    // the limit, the NEXT attempt (whatever it guesses) is caught by the
    // check above instead of being compared.
    if (storedOtp !== otp) {
      const attempts = await this.redis.incr(attemptsKey);
      if (attempts === 1) {
        await this.redis.expire(attemptsKey, 300);
      }

      throwError(
        401,
        AUTH_ERRORS.OTP_INVALID.code,
        AUTH_ERRORS.OTP_INVALID.message,
      );
    }

    // 5. Delete the Redis key (one-time use)
    await this.redis.del(otpKey, attemptsKey);

    // 6. Return success
    return true;
  }
}
