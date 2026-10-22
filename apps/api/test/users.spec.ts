import { createTestApp, resetData, signUp, TestApp } from './helpers';

describe('users and verification', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
    await resetData(t.prisma);
  });
  afterAll(() => t.app.close());

  it('completes a profile with roles, ward and village', async () => {
    const { token } = await signUp(t, ['FARMER', 'BUYER'], { fullName: 'Ram Bahadur' });
    const me = await t.http().get('/me').auth(token, { type: 'bearer' }).expect(200);
    expect(me.body.fullName).toBe('Ram Bahadur');
    expect(me.body.roles.sort()).toEqual(['BUYER', 'FARMER']);
    expect(me.body.village).toBe('Nawalpur');
    expect(me.body.ward.municipality.nameEn).toBe('Lalbandi');
    expect(me.body.profileComplete).toBe(true);
  });

  it('does not let users make themselves admin', async () => {
    const { token } = await signUp(t, ['BUYER']);
    await t.http().patch('/me').auth(token, { type: 'bearer' }).send({ roles: ['ADMIN'] }).expect(400);
  });

  it('keeps admin when an admin changes their own roles', async () => {
    const { token, user } = await signUp(t, ['ADMIN', 'BUYER']);
    await t.http().patch('/me').auth(token, { type: 'bearer' }).send({ roles: ['FARMER'] }).expect(200);
    const updated = await t.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.roles.sort()).toEqual(['ADMIN', 'FARMER']);
  });

  it('hides the phone number on public profiles', async () => {
    const { user } = await signUp(t, ['FARMER']);
    const res = await t.http().get(`/users/${user.id}`).expect(200);
    expect(res.body.phone).toBeUndefined();
    expect(res.body.village).toBe('Nawalpur');
  });

  it('verifies a farmer after an admin approves their document', async () => {
    const farmer = await signUp(t, ['FARMER']);
    const admin = await signUp(t, ['ADMIN']);

    const upload = await t
      .http()
      .post('/me/verification-docs')
      .auth(farmer.token, { type: 'bearer' })
      .field('docType', 'CITIZENSHIP')
      .attach('file', Buffer.from('%PDF-1.4 test'), { filename: 'id.pdf', contentType: 'application/pdf' })
      .expect(201);

    await t.http().get('/admin/verification-docs').auth(farmer.token, { type: 'bearer' }).expect(403);
    const queue = await t.http().get('/admin/verification-docs').auth(admin.token, { type: 'bearer' }).expect(200);
    expect(queue.body.map((d: { id: string }) => d.id)).toContain(upload.body.id);

    const file = await t
      .http()
      .get(`/admin/verification-docs/${upload.body.id}/file`)
      .auth(admin.token, { type: 'bearer' })
      .expect(200);
    expect(file.headers['content-type']).toContain('application/pdf');

    await t
      .http()
      .patch(`/admin/verification-docs/${upload.body.id}`)
      .auth(admin.token, { type: 'bearer' })
      .send({ status: 'APPROVED' })
      .expect(200);
    const profile = await t.http().get(`/users/${farmer.user.id}`).expect(200);
    expect(profile.body.isVerified).toBe(true);
  });

  it('lists Lalbandi wards and crops for the forms', async () => {
    const munis = await t.http().get('/locations/municipalities').expect(200);
    const lalbandi = munis.body.find((m: { nameEn: string }) => m.nameEn === 'Lalbandi');
    const wards = await t.http().get(`/locations/municipalities/${lalbandi.id}/wards`).expect(200);
    expect(wards.body).toHaveLength(17);
    const crops = await t.http().get('/crops').expect(200);
    expect(crops.body.find((c: { nameEn: string }) => c.nameEn === 'Wheat').nameNe).toBe('गहुँ');
  });
});
