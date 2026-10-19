import { Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';
import { config } from '../config';
import { badRequest, tooMany } from '../common/errors';
import { hmac, safeEqualHex } from '../common/hash';
import { PrismaService } from '../prisma.service';
import { SmsProvider } from './sms.provider';

@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsProvider,
  ) {}

  private hash(phone: string, code: string) {
    return hmac(config.otpSecret, `${phone}:${code}`);
  }

  async send(phone: string, lang: 'ne' | 'en' = 'ne') {
    const { maxPerWindow, windowSeconds, minGapSeconds, ttlSeconds, length } = config.otp;
    const now = Date.now();
    const recent = await this.prisma.otpCode.findMany({
      where: { phone, createdAt: { gte: new Date(now - windowSeconds * 1000) } },
      orderBy: { createdAt: 'desc' },
    });
    if (recent.length >= maxPerWindow) {
      throw tooMany('OTP_TOO_MANY', 'Too many codes requested. Try again later.');
    }
    if (recent[0] && now - recent[0].createdAt.getTime() < minGapSeconds * 1000) {
      throw tooMany('OTP_WAIT', `Wait ${minGapSeconds} seconds before requesting another code.`);
    }

    const code = randomInt(0, 10 ** length).toString().padStart(length, '0');
    // Only the newest code is valid.
    await this.prisma.otpCode.updateMany({
      where: { phone, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    await this.prisma.otpCode.create({
      data: { phone, codeHash: this.hash(phone, code), expiresAt: new Date(now + ttlSeconds * 1000) },
    });

    const text =
      lang === 'en'
        ? `Your KrisiMandi code is ${code}. It expires in 5 minutes.`
        : `तपाईंको कृषिमण्डी कोड ${code} हो। यो ५ मिनेटमा समाप्त हुन्छ।`;
    await this.sms.send(phone, text);
    return { expiresInSeconds: ttlSeconds };
  }

  async verify(phone: string, code: string) {
    const otp = await this.prisma.otpCode.findFirst({
      where: { phone, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp || otp.expiresAt < new Date() || otp.attempts >= config.otp.maxAttempts) {
      throw badRequest('OTP_EXPIRED', 'The code has expired. Request a new one.');
    }
    if (!safeEqualHex(otp.codeHash, this.hash(phone, code))) {
      await this.prisma.otpCode.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      throw badRequest('OTP_INVALID', 'The code is not correct.');
    }
    await this.prisma.otpCode.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
  }
}
