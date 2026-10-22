import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { config } from '../config';
import { badRequest } from '../common/errors';
import { randomToken, sha256 } from '../common/hash';
import { normalizeNepaliMobile } from '../common/phone';
import { PrismaService } from '../prisma.service';
import { OtpService } from './otp.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly jwt: JwtService,
  ) {}

  private phoneOrThrow(input: string) {
    const phone = normalizeNepaliMobile(input);
    if (!phone) throw badRequest('PHONE_INVALID', 'Enter a 10-digit Nepali mobile number.');
    return phone;
  }

  requestOtp(phoneInput: string, lang?: 'ne' | 'en') {
    return this.otp.send(this.phoneOrThrow(phoneInput), lang);
  }

  async verifyOtp(phoneInput: string, code: string) {
    const phone = this.phoneOrThrow(phoneInput);
    await this.otp.verify(phone, code);

    let user = await this.prisma.user.findUnique({ where: { phone } });
    const isNewUser = !user;
    // New accounts finish their profile (name, roles, ward) on the next screen.
    user ??= await this.prisma.user.create({ data: { phone, fullName: '', roles: [] } });
    if (user.isSuspended) throw badRequest('ACCOUNT_SUSPENDED', 'This account is suspended.');

    return { ...(await this.issueTokens(user.id)), isNewUser };
  }

  async refresh(refreshToken: string) {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
    });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException();
    }
    // Rotate: each refresh token works once.
    await this.prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
    return this.issueTokens(stored.userId);
  }

  async logout(refreshToken: string) {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokens(userId: string) {
    const accessToken = await this.jwt.signAsync(
      { sub: userId },
      { secret: config.jwtSecret, expiresIn: config.accessTokenTtlSeconds },
    );
    const refreshToken = randomToken();
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + config.refreshTokenTtlDays * 864e5),
      },
    });
    return { accessToken, refreshToken, expiresInSeconds: config.accessTokenTtlSeconds };
  }
}
