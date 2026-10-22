import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';

process.env.UPLOAD_DIR = mkdtempSync(join(tmpdir(), 'krisimandi-uploads-'));

// Imported after UPLOAD_DIR is set, since config reads it on load.
import { AppModule } from '../src/app.module';
import { SmsProvider } from '../src/auth/sms.provider';
import { PrismaService } from '../src/prisma.service';
import { configureApp } from '../src/setup';

/** Captures SMS instead of sending, so tests can read the code. */
export class CapturingSms extends SmsProvider {
  sent: { phone: string; text: string }[] = [];
  async send(phone: string, text: string) {
    this.sent.push({ phone, text });
  }
  lastCode(phone: string) {
    const msg = [...this.sent].reverse().find((m) => m.phone === phone);
    return msg?.text.match(/\d{6}/)?.[0];
  }
}

export async function createTestApp() {
  const sms = new CapturingSms();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SmsProvider)
    .useValue(sms)
    .compile();
  const app = configureApp(moduleRef.createNestApplication<NestExpressApplication>());
  await app.init();
  const prisma = app.get(PrismaService);
  return { app, sms, prisma, http: () => request(app.getHttpServer()) };
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;

/** Clears everything users create; keeps seeded locations, crops and units. */
export async function resetData(prisma: PrismaService) {
  await prisma.$executeRawUnsafe(`
    TRUNCATE users, otp_codes, refresh_tokens, verification_docs, listings, listing_photos,
      auctions, bids, offers, conversations, messages, orders, reviews, complaints,
      notifications, saved_listings, crop_alerts, audit_logs CASCADE`);
}

let phoneCounter = 0;
export const nextPhone = () => `98${String(10000000 + ++phoneCounter).slice(-8)}`;

/** Signs up through the real OTP flow and completes the profile. */
export async function signUp(t: TestApp, roles: Role[], extra: { fullName?: string } = {}) {
  const phone = nextPhone();
  await t.http().post('/auth/otp/request').send({ phone }).expect(200);
  const res = await t
    .http()
    .post('/auth/otp/verify')
    .send({ phone, code: t.sms.lastCode(`+977${phone}`) })
    .expect(200);
  const token: string = res.body.accessToken;
  const ward = await t.prisma.ward.findFirstOrThrow({ where: { municipality: { nameEn: 'Lalbandi' }, wardNo: 1 } });
  const userRoles = roles.filter((r) => r !== 'ADMIN');
  await t
    .http()
    .patch('/me')
    .auth(token, { type: 'bearer' })
    .send({ fullName: extra.fullName ?? 'Test User', roles: userRoles, wardId: ward.id, village: 'Nawalpur' })
    .expect(200);
  const user = await t.prisma.user.findUniqueOrThrow({ where: { phone: `+977${phone}` } });
  if (roles.includes('ADMIN')) {
    await t.prisma.user.update({ where: { id: user.id }, data: { roles: [...user.roles, 'ADMIN'] } });
  }
  return { token, user, phone, refreshToken: res.body.refreshToken as string, wardId: ward.id };
}
