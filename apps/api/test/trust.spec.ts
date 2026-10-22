import { AuctionsService } from '../src/deals/auctions.service';
import { createTestApp, resetData, signUp, TestApp } from './helpers';

const day = (offset: number) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);
const bearer = { type: 'bearer' as const };

describe('orders, reviews, complaints and admin', () => {
  let t: TestApp;
  let farmer: Awaited<ReturnType<typeof signUp>>;
  let buyer: Awaited<ReturnType<typeof signUp>>;
  let admin: Awaited<ReturnType<typeof signUp>>;
  let cropId: number;
  let unitId: number;

  const as = (u: { token: string }) => ({
    get: (path: string) => t.http().get(path).auth(u.token, bearer),
    post: (path: string, body: object = {}) => t.http().post(path).auth(u.token, bearer).send(body),
    patch: (path: string, body: object = {}) => t.http().patch(path).auth(u.token, bearer).send(body),
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
  /** Makes a fixed-price order for `quantity` of a fresh listing. */
  const order = async (quantity = 4, listingQty = 10) => {
    const listingId = await fixed(listingQty);
    const offer = await as(buyer).post(`/listings/${listingId}/offers`, { pricePerUnit: 3000, quantity, pickupDate: day(2) }).expect(201);
    const res = await as(farmer).post(`/offers/${offer.body.id}/accept`).expect(200);
    return { listingId, orderId: res.body.orderId as string };
  };
  const notices = async (u: { token: string }) =>
    (await as(u).get('/me/notifications').expect(200)).body.items.map((n: { type: string }) => n.type);

  beforeAll(async () => {
    t = await createTestApp();
    await resetData(t.prisma);
    farmer = await signUp(t, ['FARMER'], { fullName: 'Ram Farmer' });
    buyer = await signUp(t, ['BUYER'], { fullName: 'Hari Buyer' });
    admin = await signUp(t, ['BUYER', 'ADMIN'], { fullName: 'Admin' });
    cropId = (await t.prisma.crop.findFirstOrThrow({ where: { nameEn: 'Wheat' } })).id;
    unitId = (await t.prisma.unit.findFirstOrThrow({ where: { code: 'quintal' } })).id;
  });
  afterAll(() => t.app.close());

  describe('order tracking', () => {
    it('moves from ready to picked up and paid, then completes', async () => {
      const { orderId } = await order();

      const notFarmer = await as(buyer).post(`/orders/${orderId}/ready`).expect(403);
      expect(notFarmer.body.code).toBe('NOT_FARMER');
      const ready = await as(farmer).post(`/orders/${orderId}/ready`, { pickupPlace: 'Nawalpur chowk' }).expect(200);
      expect(ready.body).toMatchObject({ status: 'READY_FOR_PICKUP', pickupPlace: 'Nawalpur chowk' });
      expect(await notices(buyer)).toContain('ORDER_READY');

      const moved = await as(buyer).patch(`/orders/${orderId}`, { pickupAt: new Date(Date.now() + 864e5).toISOString() }).expect(200);
      expect(moved.body.pickupAt).not.toBeNull();
      expect(await notices(farmer)).toContain('ORDER_PICKUP_CHANGED');

      const noMethod = await as(buyer).post(`/orders/${orderId}/paid`).expect(400);
      expect(noMethod.body.code).toBe('PAYMENT_METHOD_REQUIRED');
      const paid = await as(buyer).post(`/orders/${orderId}/paid`, { method: 'CASH' }).expect(200);
      expect(paid.body).toMatchObject({ paymentMethod: 'CASH', paidStatus: 'UNPAID' });
      expect(paid.body.buyerPaidAt).not.toBeNull();
      await as(buyer).post(`/orders/${orderId}/paid`, { method: 'CASH' }).expect(400);

      const picked = await as(buyer).post(`/orders/${orderId}/picked-up`).expect(200);
      expect(picked.body.status).toBe('PICKED_UP');
      await as(buyer).post(`/orders/${orderId}/payment-received`).expect(403);

      // The farmer confirming the money is what completes a picked-up order.
      const done = await as(farmer).post(`/orders/${orderId}/payment-received`).expect(200);
      expect(done.body).toMatchObject({ status: 'COMPLETED', paidStatus: 'PAID', paymentMethod: 'CASH' });
      expect(done.body.completedAt).not.toBeNull();
      expect(await notices(buyer)).toContain('ORDER_COMPLETED');

      const cancel = await as(buyer).post(`/orders/${orderId}/cancel`, { reason: 'Changed my mind' }).expect(400);
      expect(cancel.body.code).toBe('ORDER_STATUS_INVALID');

      const log = await t.prisma.auditLog.findMany({ where: { entity: 'order', entityId: orderId }, orderBy: { id: 'asc' } });
      expect(log.map((l) => l.action)).toEqual([
        'OFFER_ACCEPTED', 'ORDER_READY', 'ORDER_PICKUP_CHANGED', 'ORDER_PAID', 'ORDER_PICKED_UP', 'ORDER_PAYMENT_CONFIRMED',
      ]);
      expect(log[5].after).toMatchObject({ status: 'COMPLETED' });
    });

    it('completes when the payment is confirmed first and pickup comes last', async () => {
      const { orderId } = await order();
      await as(farmer).post(`/orders/${orderId}/payment-received`, { method: 'BANK_TRANSFER' }).expect(200);
      const done = await as(farmer).post(`/orders/${orderId}/picked-up`).expect(200);
      expect(done.body.status).toBe('COMPLETED');
    });

    it('puts the quantity back and reopens a sold-out listing when an order is cancelled', async () => {
      const { listingId, orderId } = await order(10, 10);
      expect((await as(buyer).get(`/listings/${listingId}`).expect(200)).body.status).toBe('SOLD');

      await as(buyer).post(`/orders/${orderId}/cancel`, { reason: 'x' }).expect(400);
      const res = await as(buyer).post(`/orders/${orderId}/cancel`, { reason: 'Truck broke down' }).expect(200);
      expect(res.body).toMatchObject({ status: 'CANCELLED', cancelReason: 'Truck broke down', cancelledById: buyer.user.id });
      expect(await notices(farmer)).toContain('ORDER_CANCELLED');

      const listing = (await as(buyer).get(`/listings/${listingId}`).expect(200)).body;
      expect(listing).toMatchObject({ status: 'ACTIVE', quantityLeft: '10' });
    });

    it('does not cancel a paid order or let strangers touch it', async () => {
      const { orderId } = await order();
      const stranger = await signUp(t, ['BUYER']);
      await as(stranger).post(`/orders/${orderId}/picked-up`).expect(404);
      await as(farmer).post(`/orders/${orderId}/payment-received`, { method: 'CASH' }).expect(200);
      const res = await as(farmer).post(`/orders/${orderId}/cancel`, { reason: 'Buyer did not come' }).expect(400);
      expect(res.body.code).toBe('ORDER_PAID_NO_CANCEL');
    });

    it('closes an auction lot when its order is cancelled', async () => {
      const created = await as(farmer)
        .post('/listings', {
          cropId, quantity: 20, unitId, saleMode: 'AUCTION', harvestDate: day(-1), availableUntil: day(5), wardId: farmer.wardId,
          auction: { startPrice: 2500, minIncrement: 50, endsAt: new Date(Date.now() + 864e5).toISOString() },
        })
        .expect(201);
      const listingId = created.body.id;
      await as(buyer).post(`/listings/${listingId}/bids`, { amountPerUnit: 2500 }).expect(201);
      await t.prisma.auction.update({ where: { listingId }, data: { endsAt: new Date(Date.now() - 1000) } });
      await t.app.get(AuctionsService).closeDue();
      const { body } = await as(farmer).post(`/listings/${listingId}/auction/confirm`).expect(200);
      await as(farmer).post(`/orders/${body.orderId}/cancel`, { reason: 'Buyer stopped answering' }).expect(200);
      expect((await as(farmer).get(`/listings/${listingId}`).expect(200)).body.status).toBe('EXPIRED');
      expect(await t.prisma.auditLog.count({ where: { action: 'BID_PLACED', actorId: buyer.user.id } })).toBeGreaterThan(0);
    });
  });

  describe('reviews', () => {
    it('lets each side review a completed order once and shows it on the profile', async () => {
      const { orderId } = await order();
      const early = await as(buyer).post(`/orders/${orderId}/review`, { rating: 5 }).expect(400);
      expect(early.body.code).toBe('ORDER_NOT_COMPLETED');

      await as(farmer).post(`/orders/${orderId}/payment-received`, { method: 'CASH' }).expect(200);
      await as(buyer).post(`/orders/${orderId}/picked-up`).expect(200);
      await as(buyer).post(`/orders/${orderId}/review`, { rating: 6 }).expect(400);
      const reviewed = await as(buyer).post(`/orders/${orderId}/review`, { rating: 4, comment: 'Good wheat' }).expect(201);
      expect(reviewed.body.reviews).toHaveLength(1);
      const again = await as(buyer).post(`/orders/${orderId}/review`, { rating: 5 }).expect(400);
      expect(again.body.code).toBe('REVIEW_EXISTS');
      await as(farmer).post(`/orders/${orderId}/review`, { rating: 5 }).expect(201);
      expect(await notices(farmer)).toContain('REVIEW_RECEIVED');

      const reviews = await t.http().get(`/users/${farmer.user.id}/reviews`).expect(200);
      expect(reviews.body[0]).toMatchObject({ rating: 4, comment: 'Good wheat', reviewer: { fullName: 'Hari Buyer' } });
      expect(reviews.body[0].reviewer.phone).toBeUndefined();
      const profile = await t.http().get(`/users/${farmer.user.id}`).expect(200);
      expect(profile.body.rating.count).toBeGreaterThanOrEqual(1);
    });
  });

  describe('complaints', () => {
    it('files a complaint, blocks duplicates, and tells the filer when an admin follows up', async () => {
      const { orderId } = await order();
      const stranger = await signUp(t, ['BUYER']);
      await as(stranger).post('/complaints', { targetType: 'ORDER', targetId: orderId, reason: 'I was not part of this' }).expect(404);
      await as(buyer).post('/complaints', { targetType: 'USER', targetId: buyer.user.id, reason: 'Reporting myself here' }).expect(400);

      const filed = await as(buyer).post('/complaints', { targetType: 'ORDER', targetId: orderId, reason: 'Farmer gave less than agreed' }).expect(201);
      expect(filed.body.status).toBe('OPEN');
      const dup = await as(buyer).post('/complaints', { targetType: 'ORDER', targetId: orderId, reason: 'Still less than agreed' }).expect(400);
      expect(dup.body.code).toBe('COMPLAINT_EXISTS');
      expect(await notices(admin)).toContain('COMPLAINT_FILED');

      await as(buyer).get('/admin/complaints').expect(403);
      const list = await as(admin).get('/admin/complaints').expect(200);
      const item = list.body.find((c: { id: string }) => c.id === filed.body.id);
      expect(item.target).toMatchObject({ farmer: { fullName: 'Ram Farmer' } });

      await as(admin).patch(`/admin/complaints/${filed.body.id}`, { status: 'FOLLOWING_UP', adminNotes: 'Called both sides' }).expect(200);
      const closed = await as(admin).patch(`/admin/complaints/${filed.body.id}`, { status: 'CLOSED' }).expect(200);
      expect(closed.body).toMatchObject({ status: 'CLOSED', handledById: admin.user.id, adminNotes: 'Called both sides' });
      expect(await notices(buyer)).toContain('COMPLAINT_UPDATED');

      const mine = await as(buyer).get('/me/complaints').expect(200);
      expect(mine.body[0]).toMatchObject({ status: 'CLOSED', adminNotes: 'Called both sides' });
      // Once closed, the same thing can be reported again.
      await as(buyer).post('/complaints', { targetType: 'ORDER', targetId: orderId, reason: 'It happened a second time' }).expect(201);
    });
  });

  describe('admin', () => {
    it('suspends an account, which signs them out and pauses their listings', async () => {
      const seller = await signUp(t, ['FARMER'], { fullName: 'Shyam Seller' });
      const listing = await as(seller)
        .post('/listings', {
          cropId, quantity: 5, unitId, saleMode: 'FIXED', pricePerUnit: 100,
          harvestDate: day(-1), availableUntil: day(10), wardId: seller.wardId,
        })
        .expect(201);

      await as(farmer).post(`/admin/users/${seller.user.id}/suspend`, { reason: 'Fake listings' }).expect(403);
      const found = await as(admin).get('/admin/users?q=shyam').expect(200);
      expect(found.body.map((u: { id: string }) => u.id)).toEqual([seller.user.id]);
      const res = await as(admin).post(`/admin/users/${seller.user.id}/suspend`, { reason: 'Fake listings' }).expect(200);
      expect(res.body.isSuspended).toBe(true);
      const self = await as(admin).post(`/admin/users/${admin.user.id}/suspend`, { reason: 'Testing' }).expect(400);
      expect(self.body.code).toBe('CANNOT_SUSPEND_ADMIN');

      await as(seller).get('/me').expect(401);
      await t.http().post('/auth/refresh').send({ refreshToken: seller.refreshToken }).expect(401);
      expect((await t.prisma.listing.findUniqueOrThrow({ where: { id: listing.body.id } })).status).toBe('PAUSED');

      await as(admin).post(`/admin/users/${seller.user.id}/unsuspend`).expect(200);
      const log = await as(admin).get(`/admin/audit?entity=user&entityId=${seller.user.id}`).expect(200);
      expect(log.body.map((l: { action: string }) => l.action)).toEqual(['USER_UNSUSPENDED', 'USER_SUSPENDED']);
      expect(log.body[1].after).toMatchObject({ reason: 'Fake listings', listingsPaused: 1 });
    });

    it('removes a listing with a reason and tells the farmer', async () => {
      const listingId = await fixed();
      await as(buyer).post(`/listings/${listingId}/offers`, { pricePerUnit: 2000, quantity: 1, pickupDate: day(2) }).expect(201);
      await as(admin).post(`/admin/listings/${listingId}/remove`, { reason: 'Wrong crop photo' }).expect(200);
      await as(buyer).get(`/listings/${listingId}`).expect(404);
      expect(await notices(farmer)).toContain('LISTING_REMOVED');
      expect(await t.prisma.offer.count({ where: { listingId, status: 'OPEN' } })).toBe(0);
    });

    it('adds and edits crops, and shows stats', async () => {
      const crop = await as(admin).post('/admin/crops', { nameEn: 'Jackfruit', nameNe: 'कटहर', category: 'fruit', defaultUnitId: unitId }).expect(201);
      const dup = await as(admin).post('/admin/crops', { nameEn: 'Jackfruit', nameNe: 'कटहर', category: 'fruit', defaultUnitId: unitId }).expect(400);
      expect(dup.body.code).toBe('CROP_EXISTS');
      await as(admin).post('/admin/crops', { nameEn: 'X', nameNe: 'X', category: 'stone', defaultUnitId: unitId }).expect(400);
      const edited = await as(admin).patch(`/admin/crops/${crop.body.id}`, { nameNe: 'रुख कटहर' }).expect(200);
      expect(edited.body.nameNe).toBe('रुख कटहर');
      expect((await t.http().get('/crops').expect(200)).body.some((c: { nameEn: string }) => c.nameEn === 'Jackfruit')).toBe(true);

      const stats = await as(admin).get('/admin/stats').expect(200);
      expect(stats.body).toMatchObject({ farmers: expect.any(Number), openComplaints: expect.any(Number) });
      expect(stats.body.orders.COMPLETED).toBeGreaterThanOrEqual(1);
      await t.prisma.crop.delete({ where: { id: crop.body.id } });
    });
  });
});
