import { Injectable } from '@nestjs/common';
import { Order, OrderStatus, PaymentMethod, Prisma, User } from '@prisma/client';
import { NotificationsService } from '../alerts/notifications.service';
import { AuditService } from '../common/audit.service';
import { badRequest, forbidden, notFound } from '../common/errors';
import { PrismaService } from '../prisma.service';
import { today } from './dates';
import { CancelOrderDto, PickupDto, ReviewDto } from './dto';

type Tx = Prisma.TransactionClient;

const orderInclude = {
  listing: {
    include: {
      crop: true,
      unit: true,
      ward: { include: { municipality: true } },
      photos: { take: 1, orderBy: { sortOrder: 'asc' } },
    },
  },
  buyer: { select: { id: true, fullName: true, phone: true, village: true } },
  farmer: { select: { id: true, fullName: true, phone: true, village: true } },
  reviews: { select: { id: true, reviewerId: true, rating: true, comment: true, createdAt: true } },
} satisfies Prisma.OrderInclude;

/** Statuses where the deal is still being carried out. */
const OPEN: OrderStatus[] = ['CONFIRMED', 'READY_FOR_PICKUP', 'PICKED_UP'];

/**
 * Orders are the record of every agreed deal: an accepted offer or a confirmed auction win.
 * Each order moves CONFIRMED → READY_FOR_PICKUP → PICKED_UP → COMPLETED, or is CANCELLED with a reason.
 * Payment happens off the platform; both sides record it here, and the order completes once the
 * produce is picked up and the farmer has confirmed the money arrived.
 */
@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  list(user: User) {
    return this.prisma.order.findMany({
      where: { OR: [{ buyerId: user.id }, { farmerId: user.id }] },
      include: orderInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Both sides see each other's phone number here: the deal is agreed. */
  async get(user: User, id: string) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: orderInclude });
    if (!order || (order.buyerId !== user.id && order.farmerId !== user.id)) {
      throw notFound('ORDER_NOT_FOUND', 'Order not found.');
    }
    return order;
  }

  /** True when the two people have a live deal on this listing, so phone numbers can be shown. */
  async hasDeal(listingId: string, buyerId: string) {
    const count = await this.prisma.order.count({ where: { listingId, buyerId, status: { not: 'CANCELLED' } } });
    return count > 0;
  }

  /** Either side sets or changes when and where the pickup happens. */
  async setPickup(user: User, id: string, dto: PickupDto) {
    await this.change(user, id, 'ORDER_PICKUP_CHANGED', async (order) => {
      if (order.status !== 'CONFIRMED' && order.status !== 'READY_FOR_PICKUP') throw this.invalid(order);
      return { data: this.pickupData(dto) };
    });
    return this.get(user, id);
  }

  /** The farmer says the produce is ready to collect, optionally with pickup details. */
  async ready(user: User, id: string, dto: PickupDto) {
    await this.change(user, id, 'ORDER_READY', async (order) => {
      if (order.farmerId !== user.id) throw forbidden('NOT_FARMER', 'Only the farmer can do this.');
      if (order.status !== 'CONFIRMED') throw this.invalid(order);
      return { data: { status: 'READY_FOR_PICKUP', ...this.pickupData(dto) } };
    });
    return this.get(user, id);
  }

  /** Either side records that the buyer has collected the produce. */
  async pickedUp(user: User, id: string) {
    await this.change(user, id, 'ORDER_PICKED_UP', async (order) => {
      if (order.status !== 'CONFIRMED' && order.status !== 'READY_FOR_PICKUP') throw this.invalid(order);
      return { data: { status: 'PICKED_UP' } };
    });
    return this.get(user, id);
  }

  /** The buyer records that they paid, and how. */
  async markPaid(user: User, id: string, method?: PaymentMethod) {
    await this.change(user, id, 'ORDER_PAID', async (order) => {
      if (order.buyerId !== user.id) throw forbidden('NOT_BUYER', 'Only the buyer can do this.');
      if (!OPEN.includes(order.status) || order.buyerPaidAt) throw this.invalid(order);
      const paymentMethod = method ?? order.paymentMethod;
      if (!paymentMethod) throw badRequest('PAYMENT_METHOD_REQUIRED', 'Say whether you paid in cash or by bank.');
      return { data: { buyerPaidAt: new Date(), paymentMethod } };
    });
    return this.get(user, id);
  }

  /** The farmer confirms the money arrived. This is what marks the order paid. */
  async confirmPayment(user: User, id: string, method?: PaymentMethod) {
    await this.change(user, id, 'ORDER_PAYMENT_CONFIRMED', async (order) => {
      if (order.farmerId !== user.id) throw forbidden('NOT_FARMER', 'Only the farmer can do this.');
      if (!OPEN.includes(order.status) || order.paidStatus === 'PAID') throw this.invalid(order);
      const paymentMethod = method ?? order.paymentMethod;
      if (!paymentMethod) throw badRequest('PAYMENT_METHOD_REQUIRED', 'Say whether you were paid in cash or by bank.');
      return { data: { paidStatus: 'PAID', farmerPaidAt: new Date(), paymentMethod } };
    });
    return this.get(user, id);
  }

  /**
   * Either side calls the deal off before pickup, giving a reason. The quantity goes back on a
   * fixed-price listing; an auction lot is not reopened, since its bidding has ended.
   */
  async cancel(user: User, id: string, dto: CancelOrderDto) {
    await this.change(user, id, 'ORDER_CANCELLED', async (order, tx) => {
      if (order.status !== 'CONFIRMED' && order.status !== 'READY_FOR_PICKUP') throw this.invalid(order);
      if (order.paidStatus === 'PAID') {
        throw badRequest('ORDER_PAID_NO_CANCEL', 'This order is already paid. Settle it with the other side, or report a problem.');
      }
      const [listing] = await tx.$queryRaw<{ status: string; quantity_left: Prisma.Decimal; available_until: Date }[]>`
        SELECT status, quantity_left, available_until FROM listings WHERE id = ${order.listingId}::uuid FOR UPDATE`;
      if (order.offerId) {
        const back = order.quantity.plus(listing.quantity_left);
        const reopen = listing.status === 'SOLD' && listing.available_until >= today();
        await tx.listing.update({
          where: { id: order.listingId },
          data: { quantityLeft: back, ...(reopen ? { status: 'ACTIVE' } : {}) },
        });
      } else if (listing.status === 'SOLD') {
        await tx.listing.update({ where: { id: order.listingId }, data: { status: 'EXPIRED' } });
      }
      return { data: { status: 'CANCELLED', cancelReason: dto.reason, cancelledById: user.id }, extra: { reason: dto.reason } };
    });
    return this.get(user, id);
  }

  /** Leaves a rating for the other side once the order is completed. One review per side. */
  async review(user: User, id: string, dto: ReviewDto) {
    const order = await this.get(user, id);
    if (order.status !== 'COMPLETED') throw badRequest('ORDER_NOT_COMPLETED', 'You can review once the order is completed.');
    if (order.reviews.some((r) => r.reviewerId === user.id)) {
      throw badRequest('REVIEW_EXISTS', 'You have already reviewed this order.');
    }
    const revieweeId = order.buyerId === user.id ? order.farmerId : order.buyerId;
    try {
      await this.prisma.review.create({
        data: { orderId: id, reviewerId: user.id, revieweeId, rating: dto.rating, comment: dto.comment?.trim() || null },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw badRequest('REVIEW_EXISTS', 'You have already reviewed this order.');
      }
      throw err;
    }
    await this.notifications.send(revieweeId, 'REVIEW_RECEIVED', { ...this.noticeData(order), rating: dto.rating });
    return this.get(user, id);
  }

  /** Public reviews someone has received, newest first. */
  async reviewsOf(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.isSuspended) throw notFound('USER_NOT_FOUND', 'User not found.');
    return this.prisma.review.findMany({
      where: { revieweeId: userId },
      select: {
        id: true,
        rating: true,
        comment: true,
        createdAt: true,
        reviewer: { select: { id: true, fullName: true } },
        order: { select: { buyerId: true, listing: { select: { crop: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /**
   * Runs one change on a locked order: checks the user is a party, applies `fn`'s update,
   * completes the order when it is both picked up and paid, then audits and tells the other side.
   */
  private async change(
    user: User,
    id: string,
    action: string,
    fn: (order: Order, tx: Tx) => Promise<{ data: Prisma.OrderUpdateInput; extra?: Prisma.InputJsonObject }>,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM orders WHERE id = ${id}::uuid FOR UPDATE`;
      const order = row && (await tx.order.findUnique({ where: { id } }));
      if (!order || (order.buyerId !== user.id && order.farmerId !== user.id)) {
        throw notFound('ORDER_NOT_FOUND', 'Order not found.');
      }
      const { data, extra } = await fn(order, tx);
      let updated = await tx.order.update({ where: { id }, data, include: { listing: { include: { crop: true } } } });
      if (updated.status === 'PICKED_UP' && updated.paidStatus === 'PAID') {
        updated = await tx.order.update({
          where: { id },
          data: { status: 'COMPLETED', completedAt: new Date() },
          include: { listing: { include: { crop: true } } },
        });
      }
      await this.audit.log(user.id, action, 'order', id, { before: this.snapshot(order), after: this.snapshot(updated) }, tx);

      const other = order.buyerId === user.id ? order.farmerId : order.buyerId;
      await this.notifications.send(other, action, { ...this.noticeData(updated), ...extra }, tx);
      if (updated.status === 'COMPLETED' && order.status !== 'COMPLETED') {
        await this.notifications.send([order.buyerId, order.farmerId], 'ORDER_COMPLETED', this.noticeData(updated), tx);
      }
    });
  }

  private pickupData(dto: PickupDto): Prisma.OrderUpdateInput {
    return {
      ...(dto.pickupAt !== undefined ? { pickupAt: new Date(dto.pickupAt) } : {}),
      ...(dto.pickupPlace !== undefined ? { pickupPlace: dto.pickupPlace.trim() } : {}),
    };
  }

  private invalid(order: Order) {
    return badRequest('ORDER_STATUS_INVALID', `This cannot be done on a ${order.status.toLowerCase()} order.`);
  }

  private snapshot(o: Order): Prisma.InputJsonObject {
    return {
      status: o.status,
      paidStatus: o.paidStatus,
      paymentMethod: o.paymentMethod,
      pickupAt: o.pickupAt?.toISOString() ?? null,
      pickupPlace: o.pickupPlace,
    };
  }

  private noticeData(o: { id: string; listingId: string; pricePerUnit: Prisma.Decimal; listing: { crop: { nameEn: string; nameNe: string } } }) {
    return {
      orderId: o.id,
      listingId: o.listingId,
      price: o.pricePerUnit.toString(),
      crop: { nameEn: o.listing.crop.nameEn, nameNe: o.listing.crop.nameNe },
    };
  }
}
