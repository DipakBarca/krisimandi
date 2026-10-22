import sharp from 'sharp';
import { ListingsService } from '../src/listings/listings.service';
import { createTestApp, resetData, signUp, TestApp } from './helpers';

const day = (offset: number) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);

describe('listings', () => {
  let t: TestApp;
  let farmer: Awaited<ReturnType<typeof signUp>>;
  let buyer: Awaited<ReturnType<typeof signUp>>;
  let wheatId: number;
  let quintalId: number;

  const fixed = () => ({
    cropId: wheatId,
    quantity: 20,
    unitId: quintalId,
    saleMode: 'FIXED',
    pricePerUnit: 3500,
    harvestDate: day(-2),
    availableUntil: day(10),
    wardId: farmer.wardId,
    lat: 26.98765,
    lng: 85.56789,
  });

  beforeAll(async () => {
    t = await createTestApp();
    await resetData(t.prisma);
    farmer = await signUp(t, ['FARMER']);
    buyer = await signUp(t, ['BUYER']);
    wheatId = (await t.prisma.crop.findFirstOrThrow({ where: { nameEn: 'Wheat' } })).id;
    quintalId = (await t.prisma.unit.findFirstOrThrow({ where: { code: 'quintal' } })).id;
  });
  afterAll(() => t.app.close());

  const asFarmer = () => ({ type: 'bearer' as const, token: farmer.token });
  const post = (body: object, token = farmer.token) =>
    t.http().post('/listings').auth(token, { type: 'bearer' }).send(body);

  it('only lets farmers post', async () => {
    const res = await post(fixed(), buyer.token).expect(403);
    expect(res.body.code).toBe('ROLE_REQUIRED');
  });

  it('needs a price for fixed-price listings', async () => {
    const { pricePerUnit, ...body } = fixed();
    const res = await post(body).expect(400);
    expect(res.body.code).toBe('PRICE_REQUIRED');
  });

  it('needs an available-until date', async () => {
    const { availableUntil, ...body } = fixed();
    await post(body).expect(400);
  });

  it('rejects an available-until date before harvest', async () => {
    const res = await post({ ...fixed(), harvestDate: day(5), availableUntil: day(3) }).expect(400);
    expect(res.body.code).toBe('DATES_INVALID');
  });

  it('creates a fixed-price listing and hides the exact location from others', async () => {
    const created = await post(fixed()).expect(201);
    expect(created.body.quantityLeft).toBe('20');
    expect(created.body.village).toBe('Nawalpur');
    expect(created.body.location).toEqual({ lat: 26.98765, lng: 85.56789 });

    const asGuest = await t.http().get(`/listings/${created.body.id}`).expect(200);
    expect(asGuest.body.location).toEqual({ lat: 26.99, lng: 85.57, approximate: true });
    expect(asGuest.body.ward.municipality.nameEn).toBe('Lalbandi');

    const list = await t.http().get('/listings').query({ cropId: wheatId }).expect(200);
    expect(list.body.items.map((l: { id: string }) => l.id)).toContain(created.body.id);
  });

  it('creates an auction and keeps the reserve price from buyers', async () => {
    const { pricePerUnit, ...base } = fixed();
    const endsAt = new Date(Date.now() + 2 * 864e5).toISOString();
    const created = await post({
      ...base,
      saleMode: 'AUCTION',
      auction: { startPrice: 3000, reservePrice: 3400, minIncrement: 50, endsAt },
    }).expect(201);
    expect(created.body.auction.status).toBe('LIVE');
    expect(created.body.auction.reservePrice).toBe('3400');

    const asBuyer = await t.http().get(`/listings/${created.body.id}`).auth(buyer.token, { type: 'bearer' }).expect(200);
    expect(asBuyer.body.auction.reservePrice).toBeUndefined();
    expect(asBuyer.body.auction.hasReserve).toBe(true);
  });

  it('rejects an auction shorter than an hour', async () => {
    const { pricePerUnit, ...base } = fixed();
    const endsAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const res = await post({ ...base, saleMode: 'AUCTION', auction: { startPrice: 3000, minIncrement: 50, endsAt } }).expect(400);
    expect(res.body.code).toBe('AUCTION_END_INVALID');
  });

  it('lets only the owner edit, pause and resume', async () => {
    const { body: listing } = await post(fixed()).expect(201);
    await t.http().patch(`/listings/${listing.id}`).auth(buyer.token, { type: 'bearer' }).send({ quantity: 5 }).expect(403);

    const edited = await t.http().patch(`/listings/${listing.id}`).auth(farmer.token, asFarmer()).send({ quantity: 25, grade: 'A' }).expect(200);
    expect(edited.body.quantityLeft).toBe('25');
    expect(edited.body.grade).toBe('A');

    const paused = await t.http().post(`/listings/${listing.id}/pause`).auth(farmer.token, asFarmer()).expect(200);
    expect(paused.body.status).toBe('PAUSED');
    const list = await t.http().get('/listings').expect(200);
    expect(list.body.items.map((l: { id: string }) => l.id)).not.toContain(listing.id);

    const resumed = await t.http().post(`/listings/${listing.id}/resume`).auth(farmer.token, asFarmer()).expect(200);
    expect(resumed.body.status).toBe('ACTIVE');
  });

  it('converts uploaded photos to WebP and caps them at six', async () => {
    const { body: listing } = await post(fixed()).expect(201);
    const jpeg = await sharp({ create: { width: 2000, height: 1500, channels: 3, background: '#7a5' } }).jpeg().toBuffer();

    let latest = listing;
    for (let i = 0; i < 6; i++) {
      const res = await t
        .http()
        .post(`/listings/${listing.id}/photos`)
        .auth(farmer.token, asFarmer())
        .attach('file', jpeg, { filename: 'wheat.jpg', contentType: 'image/jpeg' })
        .expect(201);
      latest = res.body;
    }
    expect(latest.photos).toHaveLength(6);
    expect(latest.photos[0].url).toMatch(/\.webp$/);

    const served = await t.http().get(latest.photos[0].url).expect(200);
    const meta = await sharp(served.body).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(1280);

    const seventh = await t
      .http()
      .post(`/listings/${listing.id}/photos`)
      .auth(farmer.token, asFarmer())
      .attach('file', jpeg, { filename: 'wheat.jpg', contentType: 'image/jpeg' })
      .expect(400);
    expect(seventh.body.code).toBe('PHOTO_LIMIT');
  });

  it('expires listings past their date, and they can be relisted', async () => {
    const { body: listing } = await post(fixed()).expect(201);
    await t.prisma.listing.update({ where: { id: listing.id }, data: { availableUntil: new Date(day(-1)) } });

    expect(await t.app.get(ListingsService).expireOld()).toBeGreaterThanOrEqual(1);
    const expired = await t.http().get(`/listings/${listing.id}`).expect(200);
    expect(expired.body.status).toBe('EXPIRED');

    await t.http().post(`/listings/${listing.id}/resume`).auth(farmer.token, asFarmer()).expect(400);
    const relisted = await t
      .http()
      .post(`/listings/${listing.id}/relist`)
      .auth(farmer.token, asFarmer())
      .send({ availableUntil: day(7), quantity: 8 })
      .expect(200);
    expect(relisted.body.status).toBe('ACTIVE');
    expect(relisted.body.quantityLeft).toBe('8');
  });

  it('hides removed listings', async () => {
    const { body: listing } = await post(fixed()).expect(201);
    await t.http().delete(`/listings/${listing.id}`).auth(farmer.token, asFarmer()).expect(204);
    await t.http().get(`/listings/${listing.id}`).expect(404);
  });

  it("shows the farmer their own listings", async () => {
    const res = await t.http().get('/me/listings').auth(farmer.token, asFarmer()).expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((l: { farmerId: string }) => l.farmerId === farmer.user.id)).toBe(true);
  });
});
