import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { notFound } from '../common/errors';
import { PrismaService } from '../prisma.service';

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
} satisfies Prisma.OrderInclude;

/**
 * Orders are the record of every agreed deal: an accepted offer or a confirmed auction win.
 * Phase 4 adds pickup, payment and status tracking on top of this.
 */
@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

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
}
