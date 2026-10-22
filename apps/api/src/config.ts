import { join } from 'path';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

const isProduction = process.env.NODE_ENV === 'production';

/** Production must send real SMS; console codes would lock everyone out. */
function smsProvider() {
  const provider = process.env.SMS_PROVIDER ?? 'console';
  if (!['console', 'sparrow'].includes(provider)) throw new Error(`Unknown SMS_PROVIDER ${provider}`);
  if (provider === 'sparrow' && !process.env.SPARROW_SMS_TOKEN) throw new Error('SMS_PROVIDER=sparrow needs SPARROW_SMS_TOKEN');
  if (isProduction && provider === 'console' && process.env.ALLOW_CONSOLE_SMS !== 'true') {
    throw new Error('Production needs SMS_PROVIDER=sparrow (or ALLOW_CONSOLE_SMS=true for a private test server)');
  }
  return provider as 'console' | 'sparrow';
}

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
    provider: smsProvider(),
    sparrowToken: process.env.SPARROW_SMS_TOKEN,
    sparrowFrom: process.env.SPARROW_SMS_FROM ?? 'KrisiMandi',
  },
  uploadDir: process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads'),
  /** Slack or Discord incoming webhook for production problems. Optional. */
  alertWebhookUrl: process.env.ALERT_WEBHOOK_URL || undefined,
  /** Shown in alerts, e.g. "pilot". */
  siteName: process.env.SITE_NAME || undefined,
  maxListingPhotos: 6,
  maxUploadBytes: 8 * 1024 * 1024,
};
