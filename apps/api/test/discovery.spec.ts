import { createTestApp, resetData, signUp, TestApp } from './helpers';

const day = (offset: number) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);

// Nawalpur, and points about 3 km and 30 km away.
const NAWALPUR = { lat: 26.98, lng: 85.57 };

describe('discovery', () => {
  let t: TestApp;
  let farmer: Awaited<ReturnType<typeof signUp>>;
  let buyer: Awaited<ReturnType<typeof signUp>>;
  let crops: Record<string, number>;
  let kg: number;
  const ids: Record<string, string> = {};

  const post = (body: object, token = farmer.token) =>
    t.http().post('/listings').auth(token, { type: 'bearer' }).send(body).expect(201);
  const listing = (cropId: number, price: number, lat: number, lng: number, extra: object = {}) => ({
    cropId,
    quantity: 100,
    unitId: kg,
    saleMode: 'FIXED',
    pricePerUnit: price,
    harvestDate: day(-1),
    availableUntil: day(7),
    wardId: farmer.wardId,
    lat,
    lng,
    ...extra,
  });
  const search = (query: object, token?: string) => {
    const req = t.http().get('/listings').query(query);
    return token ? req.auth(token, { type: 'bearer' }) : req;
  };
  const idsOf = (body: { items: { id: string }[] }) => body.items.map((l) => l.id);

  beforeAll(async () => {
    t = await createTestApp();
    await resetData(t.prisma);
    farmer = await signUp(t, ['FARMER']);
    buyer = await signUp(t, ['BUYER']);
    const all = await t.prisma.crop.findMany();
    crops = Object.fromEntries(all.map((c) => [c.nameEn, c.id]));
    kg = (await t.prisma.unit.findFirstOrThrow({ where: { code: 'kg' } })).id;

    ids.near = (await post(listing(crops.Tomato, 60, 26.98, 85.57, { variety: 'Srijana' }))).body.id;
    ids.mid = (await post(listing(crops.Tomato, 45, 27.0, 85.59))).body.id;
    ids.far = (await post(listing(crops.Potato, 30, 27.2, 85.7))).body.id;
    const endsAt = new Date(Date.now() + 2 * 864e5).toISOString();
    ids.auction = (
      await post({
        ...listing(crops.Potato, 0, 26.99, 85.58),
        saleMode: 'AUCTION',
        pricePerUnit: undefined,
        auction: { startPrice: 25, minIncrement: 1, endsAt },
      })
    ).body.id;
  });
  afterAll(() => t.app.close());

  it('filters by crop and sale mode', async () => {
    const tomato = await search({ cropId: crops.Tomato }).expect(200);
    expect(idsOf(tomato.body).sort()).toEqual([ids.near, ids.mid].sort());
    const auctions = await search({ saleMode: 'AUCTION' }).expect(200);
    expect(idsOf(auctions.body)).toEqual([ids.auction]);
  });

  it('matches text in Nepali and English crop names and variety', async () => {
    const ne = await search({ q: 'गोलभेडा' }).expect(200);
    expect(idsOf(ne.body).sort()).toEqual([ids.near, ids.mid].sort());
    const en = await search({ q: 'potat' }).expect(200);
    expect(idsOf(en.body).sort()).toEqual([ids.far, ids.auction].sort());
    const variety = await search({ q: 'srijana' }).expect(200);
    expect(idsOf(variety.body)).toEqual([ids.near]);
    const wildcard = await search({ q: '%' }).expect(200);
    expect(wildcard.body.items).toEqual([]);
  });

  it('filters and sorts by price, using the start price for auctions', async () => {
    const cheap = await search({ maxPrice: 30 }).expect(200);
    expect(idsOf(cheap.body).sort()).toEqual([ids.far, ids.auction].sort());
    const asc = await search({ sort: 'price_asc' }).expect(200);
    expect(idsOf(asc.body)).toEqual([ids.auction, ids.far, ids.mid, ids.near]);
    const bad = await search({ minPrice: 50, maxPrice: 10 }).expect(400);
    expect(bad.body.code).toBe('PRICE_RANGE_INVALID');
  });

  it('finds listings nearby, nearest first, with rounded distances', async () => {
    const res = await search({ ...NAWALPUR, radiusKm: 10, sort: 'nearest' }).expect(200);
    expect(idsOf(res.body)).toEqual([ids.near, ids.auction, ids.mid]);
    expect(res.body.items[0].distanceKm).toBe(0);
    expect(res.body.items[2].distanceKm).toBeCloseTo(3, 0);
    expect(res.body.items[2].location.approximate).toBe(true);

    const all = await search({ ...NAWALPUR, sort: 'nearest' }).expect(200);
    expect(idsOf(all.body).at(-1)).toBe(ids.far);

    const noPoint = await search({ sort: 'nearest' }).expect(400);
    expect(noPoint.body.code).toBe('LOCATION_REQUIRED');
  });

  it('pages through results without repeats', async () => {
    const first = await search({ sort: 'price_asc', limit: 3 }).expect(200);
    expect(first.body.nextCursor).toBe('3');
    const second = await search({ sort: 'price_asc', limit: 3, cursor: first.body.nextCursor }).expect(200);
    expect(idsOf(second.body)).toEqual([ids.near]);
    expect(second.body.nextCursor).toBeNull();
  });

  it('keeps paused listings out of search', async () => {
    await t.http().post(`/listings/${ids.mid}/pause`).auth(farmer.token, { type: 'bearer' }).expect(200);
    const res = await search({ cropId: crops.Tomato }).expect(200);
    expect(idsOf(res.body)).toEqual([ids.near]);
    await search({ status: 'PAUSED' }).expect(400);
    await t.http().post(`/listings/${ids.mid}/resume`).auth(farmer.token, { type: 'bearer' }).expect(200);
  });

  it('saves and unsaves listings', async () => {
    const auth = { type: 'bearer' as const };
    await t.http().put(`/listings/${ids.near}/save`).auth(buyer.token, auth).expect(204);
    await t.http().put(`/listings/${ids.near}/save`).auth(buyer.token, auth).expect(204);

    const saved = await t.http().get('/me/saved').auth(buyer.token, auth).expect(200);
    expect(saved.body.map((l: { id: string }) => l.id)).toEqual([ids.near]);
    expect(saved.body[0].location.approximate).toBe(true);

    const detail = await t.http().get(`/listings/${ids.near}`).auth(buyer.token, auth).expect(200);
    expect(detail.body.saved).toBe(true);
    const listed = await search({ cropId: crops.Tomato }, buyer.token).expect(200);
    expect(listed.body.items.find((l: { id: string }) => l.id === ids.near).saved).toBe(true);

    await t.http().delete(`/listings/${ids.near}/save`).auth(buyer.token, auth).expect(204);
    const after = await t.http().get('/me/saved').auth(buyer.token, auth).expect(200);
    expect(after.body).toEqual([]);
    await t.http().put(`/listings/${ids.near}/save`).expect(401);
  });

  describe('crop alerts', () => {
    const auth = { type: 'bearer' as const };
    let lalbandi: number;

    beforeAll(async () => {
      lalbandi = (await t.prisma.municipality.findFirstOrThrow({ where: { nameEn: 'Lalbandi' } })).id;
    });

    it('tells a buyer when a matching listing is posted', async () => {
      const alert = await t
        .http()
        .post('/me/alerts')
        .auth(buyer.token, auth)
        .send({ cropId: crops.Onion, municipalityId: lalbandi, maxPrice: 80 })
        .expect(201);
      expect(alert.body.crop.nameEn).toBe('Onion');

      await post(listing(crops.Onion, 90, 26.98, 85.57)); // too expensive
      await post(listing(crops.Onion, 70, 26.98, 85.57)); // matches
      const own = await signUp(t, ['FARMER', 'BUYER']);
      await t.http().post('/me/alerts').auth(own.token, auth).send({ cropId: crops.Onion }).expect(201);
      await post(listing(crops.Onion, 50, 26.98, 85.57), own.token); // own listing: no alert to self

      const res = await t.http().get('/me/notifications').auth(buyer.token, auth).expect(200);
      expect(res.body.unread).toBe(2);
      expect(res.body.items[0].type).toBe('LISTING_MATCH');
      expect(res.body.items.map((n: { data: { price: string } }) => n.data.price).sort()).toEqual(['50', '70']);
      expect(res.body.items[0].data.crop.nameNe).toBe('प्याज');

      const ownRes = await t.http().get('/me/notifications').auth(own.token, auth).expect(200);
      expect(ownRes.body.items).toEqual([]);
    });

    it('updates the same alert instead of duplicating it', async () => {
      await t
        .http()
        .post('/me/alerts')
        .auth(buyer.token, auth)
        .send({ cropId: crops.Onion, municipalityId: lalbandi, maxPrice: 100 })
        .expect(201);
      const list = await t.http().get('/me/alerts').auth(buyer.token, auth).expect(200);
      expect(list.body).toHaveLength(1);
      expect(list.body[0].maxPrice).toBe('100');
    });

    it('marks notifications read', async () => {
      const res = await t.http().get('/me/notifications').auth(buyer.token, auth).expect(200);
      const one = await t
        .http()
        .post('/me/notifications/read')
        .auth(buyer.token, auth)
        .send({ ids: [res.body.items[0].id] })
        .expect(200);
      expect(one.body.unread).toBe(1);
      const all = await t.http().post('/me/notifications/read').auth(buyer.token, auth).send({}).expect(200);
      expect(all.body.unread).toBe(0);
      const count = await t.http().get('/me/notifications/unread').auth(buyer.token, auth).expect(200);
      expect(count.body.unread).toBe(0);
    });

    it('deletes alerts only for their owner', async () => {
      const list = await t.http().get('/me/alerts').auth(buyer.token, auth).expect(200);
      await t.http().delete(`/me/alerts/${list.body[0].id}`).auth(farmer.token, auth).expect(404);
      await t.http().delete(`/me/alerts/${list.body[0].id}`).auth(buyer.token, auth).expect(204);
      const after = await t.http().get('/me/alerts').auth(buyer.token, auth).expect(200);
      expect(after.body).toEqual([]);
    });
  });
});
