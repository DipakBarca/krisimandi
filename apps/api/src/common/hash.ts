import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export const hmac = (secret: string, value: string) =>
  createHmac('sha256', secret).update(value).digest('hex');

export const randomToken = (bytes = 48) => randomBytes(bytes).toString('base64url');

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
