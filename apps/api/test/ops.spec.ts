import { OpsAlertService } from '../src/common/ops-alert.service';
import { PrismaService } from '../src/prisma.service';
import { createTestApp, nextPhone, resetData, TestApp } from './helpers';

describe('operations', () => {
  let t: TestApp;
  let alerts: string[];

  beforeAll(async () => {
    t = await createTestApp();
    await resetData(t.prisma);
    alerts = [];
    jest.spyOn(t.app.get(OpsAlertService), 'notify').mockImplementation(async (_key, text) => {
      alerts.push(text);
    });
  });
  afterEach(() => {
    alerts.length = 0;
    jest.restoreAllMocks();
    jest.spyOn(t.app.get(OpsAlertService), 'notify').mockImplementation(async (_key, text) => {
      alerts.push(text);
    });
  });
  afterAll(() => t.app.close());

  it('reports health with the database reachable', async () => {
    const res = await t.http().get('/health').expect(200);
    expect(res.body.ok).toBe(true);
  });

  it('frees the code and raises an alert when the SMS cannot be sent', async () => {
    const phone = nextPhone();
    jest.spyOn(t.sms, 'send').mockRejectedValueOnce(new Error('gateway down'));
    const res = await t.http().post('/auth/otp/request').send({ phone }).expect(503);
    expect(res.body.code).toBe('SMS_FAILED');
    expect(alerts[0]).toContain('gateway down');
    expect(await t.prisma.otpCode.count({ where: { phone: `+977${phone}` } })).toBe(0);
    // Trying again straight away works, since the failed attempt does not count.
    await t.http().post('/auth/otp/request').send({ phone }).expect(200);
  });

  it('answers unexpected errors with a plain 500 and raises an alert', async () => {
    jest.spyOn(t.app.get(PrismaService).crop, 'findMany').mockRejectedValueOnce(new Error('disk full'));
    const res = await t.http().get('/crops').expect(500);
    expect(res.body).toEqual({ statusCode: 500, message: 'Internal server error' });
    expect(alerts[0]).toContain('GET /crops: disk full');
  });

  it('does not alert on ordinary client errors', async () => {
    await t.http().get('/orders/not-a-uuid').expect(401);
    await t.http().get('/listings/00000000-0000-0000-0000-000000000000').expect(404);
    expect(alerts).toHaveLength(0);
  });
});
