import { createTestApp, nextPhone, resetData, signUp, TestApp } from './helpers';

describe('auth', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await resetData(t.prisma);
  });
  afterAll(() => t.app.close());

  it('rejects numbers that are not Nepali mobiles', async () => {
    const res = await t.http().post('/auth/otp/request').send({ phone: '12345' }).expect(400);
    expect(res.body.code).toBe('PHONE_INVALID');
  });

  it('signs up a new user with an SMS code, in Nepali by default', async () => {
    const phone = nextPhone();
    await t.http().post('/auth/otp/request').send({ phone }).expect(200);
    const sms = t.sms.sent.at(-1)!;
    expect(sms.phone).toBe(`+977${phone}`);
    expect(sms.text).toContain('कृषिमण्डी');

    const res = await t
      .http()
      .post('/auth/otp/verify')
      .send({ phone: `+977 ${phone}`, code: t.sms.lastCode(`+977${phone}`) })
      .expect(200);
    expect(res.body.isNewUser).toBe(true);
    expect(res.body.accessToken).toBeTruthy();

    const me = await t.http().get('/me').auth(res.body.accessToken, { type: 'bearer' }).expect(200);
    expect(me.body.phone).toBe(`+977${phone}`);
    expect(me.body.profileComplete).toBe(false);
  });

  it('stores only a hash of the code', async () => {
    const phone = nextPhone();
    await t.http().post('/auth/otp/request').send({ phone }).expect(200);
    const code = t.sms.lastCode(`+977${phone}`)!;
    const row = await t.prisma.otpCode.findFirstOrThrow({ where: { phone: `+977${phone}` } });
    expect(row.codeHash).not.toContain(code);
  });

  it('rejects a wrong code and locks the code after 5 wrong tries', async () => {
    const phone = nextPhone();
    await t.http().post('/auth/otp/request').send({ phone }).expect(200);
    const code = t.sms.lastCode(`+977${phone}`)!;
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      const res = await t.http().post('/auth/otp/verify').send({ phone, code: wrong }).expect(400);
      expect(res.body.code).toBe('OTP_INVALID');
    }
    const res = await t.http().post('/auth/otp/verify').send({ phone, code }).expect(400);
    expect(res.body.code).toBe('OTP_EXPIRED');
  });

  it('makes users wait between code requests', async () => {
    const phone = nextPhone();
    await t.http().post('/auth/otp/request').send({ phone }).expect(200);
    const res = await t.http().post('/auth/otp/request').send({ phone }).expect(429);
    expect(res.body.code).toBe('OTP_WAIT');
  });

  it('rotates refresh tokens and rejects a used one', async () => {
    const { refreshToken } = await signUp(t, ['BUYER']);
    const first = await t.http().post('/auth/refresh').send({ refreshToken }).expect(200);
    expect(first.body.refreshToken).not.toBe(refreshToken);
    await t.http().post('/auth/refresh').send({ refreshToken }).expect(401);
    await t.http().post('/auth/logout').send({ refreshToken: first.body.refreshToken }).expect(204);
    await t.http().post('/auth/refresh').send({ refreshToken: first.body.refreshToken }).expect(401);
  });

  it('needs a token for /me', async () => {
    await t.http().get('/me').expect(401);
    await t.http().get('/me').auth('not-a-token', { type: 'bearer' }).expect(401);
  });
});
