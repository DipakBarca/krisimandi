import { AuctionsService } from '../src/deals/auctions.service';
import { OffersService } from '../src/deals/offers.service';
import { createTestApp, resetData, signUp, TestApp } from './helpers';

const day = (offset: number) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);
const bearer = { type: 'bearer' as const };

describe('deals', () => {
  let t: TestApp;
  let farmer: Awaited<ReturnType<typeof signUp>>;
  let buyer: Awaited<ReturnType<typeof signUp>>;
  let buyer2: Awaited<ReturnType<typeof signUp>>;
  let cropId: number;
  let unitId: number;

  const as = (u: { token: string }) => ({
    get: (path: string) => t.http().get(path).auth(u.token, bearer),
    post: (path: string, body: object = {}) => t.http().post(path).auth(u.token, bearer).send(body),
  });
  const fixed = async (quantity = 10) =>
    (
      await as(farmer)
        .post('/listings', {
          cropId, quantity, unitId, saleMode: 'FIXED', pricePerUnit: 3000,
          harvestDate: day(-1), availableUntil: day(10), wardId: farmer.wardId,
        })
        .expect(201)
    ).body.id as string;
  const auction = async (reservePrice?: number) =>
    (
      await as(farmer)
        .post('/listings', {
          cropId, quantity: 50, unitId, saleMode: 'AUCTION', harvestDate: day(-1), availableUntil: day(5), wardId: farmer.wardId,
          auction: { startPrice: 2500, minIncrement: 50, endsAt: new Date(Date.now() + 2 * 864e5).toISOString(), reservePrice },
        })
        .expect(201)
    ).body.id as string;
  const notices = async (u: { token: string }) =>
    (await as(u).get('/me/notifications').expect(200)).body.items.map((n: { type: string }) => n.type);
  const endAuction = async (listingId: string) => {
    await t.prisma.auction.update({ where: { listingId }, data: { endsAt: new Date(Date.now() - 1000) } });
    await t.app.get(AuctionsService).closeDue();
  };

  beforeAll(async () => {
    t = await createTestApp();
    await resetData(t.prisma);
    farmer = await signUp(t, ['FARMER'], { fullName: 'Ram Farmer' });
    buyer = await signUp(t, ['BUYER'], { fullName: 'Hari Buyer' });
    buyer2 = await signUp(t, ['BUYER'], { fullName: 'Sita Buyer' });
    cropId = (await t.prisma.crop.findFirstOrThrow({ where: { nameEn: 'Wheat' } })).id;
    unitId = (await t.prisma.unit.findFirstOrThrow({ where: { code: 'quintal' } })).id;
  });
  afterAll(() => t.app.close());

  describe('offers', () => {
    it('runs offer, counter and accept, and makes an order', async () => {
      const listingId = await fixed();
      const offer = await as(buyer).post(`/listings/${listingId}/offers`, { pricePerUnit: 2800, quantity: 4, pickupDate: day(2) }).expect(201);
      expect(offer.body.status).toBe('OPEN');
      expect(await notices(farmer)).toContain('OFFER_RECEIVED');

      // Only one open offer per buyer per listing, and the buyer cannot answer their own offer.
      const dup = await as(buyer).post(`/listings/${listingId}/offers`, { pricePerUnit: 2900, quantity: 1, pickupDate: day(2) }).expect(400);
      expect(dup.body.code).toBe('OFFER_EXISTS');
      const turn = await as(buyer).post(`/offers/${offer.body.id}/accept`).expect(403);
      expect(turn.body.code).toBe('NOT_YOUR_TURN');

      const counter = await as(farmer).post(`/offers/${offer.body.id}/counter`, { pricePerUnit: 2950 }).expect(201);
      expect(counter.body).toMatchObject({ madeByFarmer: true, pricePerUnit: '2950', quantity: '4', parentOfferId: offer.body.id });
      expect(await notices(buyer)).toContain('OFFER_COUNTERED');
      await as(farmer).post(`/offers/${counter.body.id}/accept`).expect(403);

      // Before the deal, chat hides phone numbers.
      const convo = await as(buyer).post(`/listings/${listingId}/conversation`).expect(201);
      expect(convo.body.other.phone).toBeNull();

      const accepted = await as(buyer).post(`/offers/${counter.body.id}/accept`).expect(200);
      expect(accepted.body.offer.status).toBe('ACCEPTED');
      const order = await as(farmer).get(`/orders/${accepted.body.orderId}`).expect(200);
      expect(order.body).toMatchObject({ pricePerUnit: '2950', quantity: '4', status: 'CONFIRMED' });
      expect(order.body.buyer.phone).toBe(`+977${buyer.phone}`);
      await as(buyer2).get(`/orders/${accepted.body.orderId}`).expect(404);

      const listing = await t.http().get(`/listings/${listingId}`).expect(200);
      expect(listing.body.quantityLeft).toBe('6');
      const after = await as(buyer).get(`/conversations/${convo.body.id}`).expect(200);
      expect(after.body.other.phone).toBe(`+977${farmer.phone}`);
      expect(await notices(farmer)).toContain('OFFER_ACCEPTED');
    });

    it('checks quantity and pickup date', async () => {
      const listingId = await fixed(5);
      const tooMuch = await as(buyer).post(`/listings/${listingId}/offers`, { pricePerUnit: 2800, quantity: 6, pickupDate: day(2) }).expect(400);
      expect(tooMuch.body.code).toBe('QUANTITY_UNAVAILABLE');
      const late = await as(buyer).post(`/listings/${listingId}/offers`, { pricePerUnit: 2800, quantity: 1, pickupDate: day(20) }).expect(400);
      expect(late.body.code).toBe('PICKUP_DATE_INVALID');
      const own = await as(farmer).post(`/listings/${listingId}/offers`, { pricePerUnit: 2800, quantity: 1, pickupDate: day(2) }).expect(403);
      expect(own.body.code).toBe('ROLE_REQUIRED');
    });

    it('sells stock only once when two offers are accepted at the same moment', async () => {
      const listingId = await fixed(5);
      const a = await as(buyer).post(`/listings/${listingId}/offers`, { pricePerUnit: 3000, quantity: 4, pickupDate: day(1) }).expect(201);
      const b = await as(buyer2).post(`/listings/${listingId}/offers`, { pricePerUnit: 3000, quantity: 3, pickupDate: day(1) }).expect(201);
      const results = await Promise.all([
        as(farmer).post(`/offers/${a.body.id}/accept`),
        as(farmer).post(`/offers/${b.body.id}/accept`),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
      expect(await t.prisma.order.count({ where: { listingId } })).toBe(1);
    });

    it('turns down other offers when stock runs out and marks the listing sold', async () => {
      const listingId = await fixed(5);
      const a = await as(buyer).post(`/listings/${listingId}/offers`, { pricePerUnit: 3000, quantity: 5, pickupDate: day(1) }).expect(201);
      const b = await as(buyer2).post(`/listings/${listingId}/offers`, { pricePerUnit: 2900, quantity: 2, pickupDate: day(1) }).expect(201);
      await as(farmer).post(`/offers/${a.body.id}/accept`).expect(200);

      const offers = await as(farmer).get(`/listings/${listingId}/offers`).expect(200);
      expect(offers.body.find((o: { id: string }) => o.id === b.body.id).status).toBe('REJECTED');
      expect((await t.http().get(`/listings/${listingId}`)).body.status).toBe('SOLD');
      const late = await as(farmer).post(`/offers/${b.body.id}/accept`).expect(400);
      expect(late.body.code).toBe('OFFER_CLOSED');
    });

    it('lets the maker withdraw, and expires old offers', async () => {
      const listingId = await fixed();
      const a = await as(buyer).post(`/listings/${listingId}/offers`, { pricePerUnit: 2500, quantity: 1, pickupDate: day(1) }).expect(201);
      await as(farmer).post(`/offers/${a.body.id}/withdraw`).expect(403);
      expect((await as(buyer).post(`/offers/${a.body.id}/withdraw`).expect(200)).body.status).toBe('WITHDRAWN');

      const b = await as(buyer).post(`/listings/${listingId}/offers`, { pricePerUnit: 2500, quantity: 1, pickupDate: day(1) }).expect(201);
      await t.prisma.offer.update({ where: { id: b.body.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      const expired = await as(farmer).post(`/offers/${b.body.id}/accept`).expect(400);
      expect(expired.body.code).toBe('OFFER_EXPIRED');
      await t.app.get(OffersService).expireOld();
      const mine = await as(buyer).get('/me/offers?side=buying').expect(200);
      expect(mine.body.find((o: { id: string }) => o.id === b.body.id).status).toBe('EXPIRED');
    });

    it('only allows offers on fixed-price listings', async () => {
      const listingId = await auction();
      const res = await as(buyer).post(`/listings/${listingId}/offers`, { pricePerUnit: 2800, quantity: 1, pickupDate: day(1) }).expect(400);
      expect(res.body.code).toBe('USE_BIDDING');
    });
  });

  describe('auctions', () => {
    it('enforces the minimum bid and masks other bidders', async () => {
      const listingId = await auction();
      const low = await as(buyer).post(`/listings/${listingId}/bids`, { amountPerUnit: 2400 }).expect(400);
      expect(low.body.code).toBe('BID_TOO_LOW');
      await as(buyer).post(`/listings/${listingId}/bids`, { amountPerUnit: 2500 }).expect(201);
      const small = await as(buyer2).post(`/listings/${listingId}/bids`, { amountPerUnit: 2520 }).expect(400);
      expect(small.body.code).toBe('BID_TOO_LOW');
      const state = await as(buyer2).post(`/listings/${listingId}/bids`, { amountPerUnit: 2550 }).expect(201);
      expect(state.body).toMatchObject({ highest: '2550', nextMin: '2600', iAmLeading: true, bidderCount: 2 });
      expect(state.body.bids.map((b: { bidder: string }) => b.bidder)).toEqual(['you', '#1']);
      expect(state.body.bids[0].name).toBeUndefined();
      expect(await notices(buyer)).toContain('OUTBID');

      const asFarmer = await as(farmer).get(`/listings/${listingId}/auction`).expect(200);
      expect(asFarmer.body.bids[0].name).toBe('Sita Buyer');
      const own = await as(farmer).post(`/listings/${listingId}/bids`, { amountPerUnit: 9000 }).expect(403);
      expect(own.body.code).toBe('ROLE_REQUIRED');
      const pause = await as(farmer).post(`/listings/${listingId}/pause`).expect(400);
      expect(pause.body.code).toBe('AUCTION_HAS_BIDS');
    });

    it('accepts only one of two identical bids sent at the same moment', async () => {
      const listingId = await auction();
      const results = await Promise.all([
        as(buyer).post(`/listings/${listingId}/bids`, { amountPerUnit: 2500 }),
        as(buyer2).post(`/listings/${listingId}/bids`, { amountPerUnit: 2500 }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
      expect((await t.http().get(`/listings/${listingId}/auction`)).body.bidCount).toBe(1);
    });

    it('extends the auction when a bid lands in the last 5 minutes', async () => {
      const listingId = await auction();
      const soon = new Date(Date.now() + 60 * 1000);
      await t.prisma.auction.update({ where: { listingId }, data: { endsAt: soon } });
      const res = await as(buyer).post(`/listings/${listingId}/bids`, { amountPerUnit: 2500 }).expect(201);
      expect(new Date(res.body.endsAt).getTime()).toBeGreaterThan(Date.now() + 4.5 * 60 * 1000);
    });

    it('closes, lets the farmer pass to the next bidder, then confirm into an order', async () => {
      const listingId = await auction(2600);
      await as(buyer).post(`/listings/${listingId}/bids`, { amountPerUnit: 2600 }).expect(201);
      await as(buyer2).post(`/listings/${listingId}/bids`, { amountPerUnit: 2700 }).expect(201);
      await endAuction(listingId);

      let state = await as(farmer).get(`/listings/${listingId}/auction`).expect(200);
      expect(state.body).toMatchObject({ status: 'AWAITING_CONFIRMATION', winningAmount: '2700', winnerName: 'Sita Buyer' });
      expect(await notices(farmer)).toContain('AUCTION_CONFIRM');
      expect(await notices(buyer)).toContain('AUCTION_LOST');
      const closed = await as(buyer).post(`/listings/${listingId}/bids`, { amountPerUnit: 3000 }).expect(400);
      expect(closed.body.code).toBe('AUCTION_CLOSED');

      state = await as(farmer).post(`/listings/${listingId}/auction/pass`).expect(200);
      expect(state.body).toMatchObject({ status: 'AWAITING_CONFIRMATION', winningAmount: '2600', winnerName: 'Hari Buyer' });
      expect(await notices(buyer2)).toContain('AUCTION_PASSED');

      const confirmed = await as(farmer).post(`/listings/${listingId}/auction/confirm`).expect(200);
      expect(confirmed.body.status).toBe('CLOSED');
      const order = await as(buyer).get(`/orders/${confirmed.body.orderId}`).expect(200);
      expect(order.body).toMatchObject({ pricePerUnit: '2600', quantity: '50' });
      expect(order.body.farmer.phone).toBe(`+977${farmer.phone}`);
      expect((await t.http().get(`/listings/${listingId}`)).body.status).toBe('SOLD');
      expect(await notices(buyer)).toContain('AUCTION_WON');
    });

    it('ends with no sale when the reserve is not met or the last winner times out', async () => {
      const unmet = await auction(5000);
      await as(buyer).post(`/listings/${unmet}/bids`, { amountPerUnit: 2500 }).expect(201);
      const before = await as(buyer).get(`/listings/${unmet}/auction`).expect(200);
      expect(before.body).toMatchObject({ hasReserve: true, reserveMet: false });
      expect(before.body.reservePrice).toBeUndefined();
      await endAuction(unmet);
      expect((await t.http().get(`/listings/${unmet}/auction`)).body.status).toBe('NO_SALE');
      expect((await t.http().get(`/listings/${unmet}`)).body.status).toBe('EXPIRED');

      const single = await auction();
      await as(buyer).post(`/listings/${single}/bids`, { amountPerUnit: 2500 }).expect(201);
      await endAuction(single);
      await t.prisma.auction.update({ where: { listingId: single }, data: { confirmBy: new Date(Date.now() - 1000) } });
      await t.app.get(AuctionsService).closeDue();
      expect((await t.http().get(`/listings/${single}/auction`)).body.status).toBe('NO_SALE');
      expect(await notices(farmer)).toContain('AUCTION_NO_SALE');
    });
  });

  describe('chat', () => {
    it('lets a buyer and farmer talk about a listing', async () => {
      const listingId = await fixed();
      const convo = await as(buyer).post(`/listings/${listingId}/conversation`).expect(201);
      const again = await as(buyer).post(`/listings/${listingId}/conversation`).expect(201);
      expect(again.body.id).toBe(convo.body.id);
      await as(farmer).post(`/listings/${listingId}/conversation`).expect(403);

      const first = await as(buyer).post(`/conversations/${convo.body.id}/messages`, { body: 'Is the wheat dry?' }).expect(201);
      expect((await as(farmer).get('/me/conversations/unread').expect(200)).body.unread).toBe(1);
      const list = await as(farmer).get('/me/conversations').expect(200);
      const row = list.body.find((c: { id: string }) => c.id === convo.body.id);
      expect(row).toMatchObject({ unread: 1, iAm: 'FARMER' });
      expect(row.lastMessage.body).toBe('Is the wheat dry?');

      await as(farmer).get(`/conversations/${convo.body.id}/messages`).expect(200);
      expect((await as(farmer).get('/me/conversations/unread').expect(200)).body.unread).toBe(0);
      await as(farmer).post(`/conversations/${convo.body.id}/messages`, { body: 'Yes, sun-dried.' }).expect(201);
      const newer = await as(buyer).get(`/conversations/${convo.body.id}/messages?after=${first.body.id}`).expect(200);
      expect(newer.body.map((m: { body: string }) => m.body)).toEqual(['Yes, sun-dried.']);

      await as(buyer2).get(`/conversations/${convo.body.id}/messages`).expect(404);
      await as(buyer).post(`/conversations/${convo.body.id}/messages`, { body: '' }).expect(400);
    });
  });
});
