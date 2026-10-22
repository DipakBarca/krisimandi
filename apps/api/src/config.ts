import { join } from 'path';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

const isProduction = process.env.NODE_ENV === 'production';

export const config = {
  isProduction,
  port: Number(process.env.PORT ?? 4000),
  // Secrets must be set in production; dev and test get throwaway defaults.
  jwtSecret: required('JWT_SECRET', isProduction ? undefined : 'dev-only-jwt-secret'),
  otpSecret: required('OTP_SECRET', isProduction ? undefined : 'dev-only-otp-secret'),
  accessTokenTtlSeconds: 15 * 60,
  refreshTokenTtlDays: 30,
  otp: {
    length: 6,
    ttlSeconds: 5 * 60,
    maxAttempts: 5,
    maxPerWindow: 3,
    windowSeconds: 10 * 60,
    minGapSeconds: 60,
  },
  sms: {
    provider: process.env.SMS_PROVIDER ?? 'console', // console | sparrow
    sparrowToken: process.env.SPARROW_SMS_TOKEN,
    sparrowFrom: process.env.SPARROW_SMS_FROM ?? 'KrisiMandi',
  },
  uploadDir: process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads'),
  maxListingPhotos: 6,
  maxUploadBytes: 8 * 1024 * 1024,
};
