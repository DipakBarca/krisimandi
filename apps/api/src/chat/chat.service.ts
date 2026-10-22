import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { badRequest, forbidden, notFound } from '../common/errors';
import { OrdersService } from '../deals/orders.service';
import { PrismaService } from '../prisma.service';
import { StorageService } from '../storage/storage.service';

const PAGE = 100;

const conversationInclude = {
  listing: { include: { crop: true, unit: true, photos: { take: 1, orderBy: { sortOrder: 'asc' } } } },
  farmer: { select: { id: true, fullName: true, photoUrl: true, phone: true } },
  buyer: { select: { id: true, fullName: true, photoUrl: true, phone: true } },
} satisfies Prisma.ConversationInclude;

type ConversationWithPeople = Prisma.ConversationGetPayload<{ include: typeof conversationInclude }>;

/** One conversation per listing and buyer. Phone numbers stay hidden until the two agree a deal. */
@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly orders: OrdersService,
  ) {}

  async start(buyer: User, listingId: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing || listing.status === 'DRAFT' || listing.status === 'REMOVED') {
      throw notFound('LISTING_NOT_FOUND', 'Listing not found.');
    }
    if (listing.farmerId === buyer.id) throw forbidden('OWN_LISTING', 'This is your own listing.');
    const convo = await this.prisma.conversation.upsert({
      where: { listingId_buyerId: { listingId, buyerId: buyer.id } },
      create: { listingId, buyerId: buyer.id, farmerId: listing.farmerId },
      update: {},
    });
    return this.get(buyer, convo.id);
  }

  async list(user: User) {
    const convos = await this.prisma.conversation.findMany({
      where: { OR: [{ farmerId: user.id }, { buyerId: user.id }] },
      include: { ...conversationInclude, messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    const unread = await this.unreadByConversation(user);
    return convos
      .map((c) => ({
        ...this.present(c, user, false),
        lastMessage: c.messages[0] ?? null,
        unread: unread.get(c.id) ?? 0,
      }))
      .sort((a, b) => (b.lastMessage?.createdAt ?? b.createdAt).getTime() - (a.lastMessage?.createdAt ?? a.createdAt).getTime());
  }

  async get(user: User, id: string) {
    const convo = await this.load(user, id);
    return this.present(convo, user, await this.orders.hasDeal(convo.listingId, convo.buyerId));
  }

  /** Newest messages (or those after a given message, for polling). Marks the other side's as read. */
  async messages(user: User, id: string, after?: string) {
    await this.load(user, id);
    let since: Date | undefined;
    if (after) {
      const ref = await this.prisma.message.findFirst({ where: { id: after, conversationId: id } });
      since = ref?.createdAt;
    }
    const rows = await this.prisma.message.findMany({
      where: { conversationId: id, ...(since ? { createdAt: { gt: since } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: PAGE,
    });
    await this.prisma.message.updateMany({
      where: { conversationId: id, senderId: { not: user.id }, readAt: null },
      data: { readAt: new Date() },
    });
    return rows.reverse();
  }

  async send(user: User, id: string, body: string) {
    await this.load(user, id);
    const text = body.trim();
    if (!text) throw badRequest('MESSAGE_EMPTY', 'Write a message.');
    return this.prisma.message.create({ data: { conversationId: id, senderId: user.id, body: text } });
  }

  async sendPhoto(user: User, id: string, file: Express.Multer.File) {
    await this.load(user, id);
    const url = await this.storage.saveImage(`chat/${id}`, file);
    return this.prisma.message.create({ data: { conversationId: id, senderId: user.id, photoUrl: url } });
  }

  async unreadTotal(user: User) {
    return this.prisma.message.count({
      where: {
        readAt: null,
        senderId: { not: user.id },
        conversation: { OR: [{ farmerId: user.id }, { buyerId: user.id }] },
      },
    });
  }

  private async unreadByConversation(user: User) {
    const rows = await this.prisma.message.groupBy({
      by: ['conversationId'],
      where: {
        readAt: null,
        senderId: { not: user.id },
        conversation: { OR: [{ farmerId: user.id }, { buyerId: user.id }] },
      },
      _count: true,
    });
    return new Map(rows.map((r) => [r.conversationId, r._count]));
  }

  private async load(user: User, id: string) {
    const convo = await this.prisma.conversation.findUnique({ where: { id }, include: conversationInclude });
    if (!convo || (convo.farmerId !== user.id && convo.buyerId !== user.id)) {
      throw notFound('CONVERSATION_NOT_FOUND', 'Conversation not found.');
    }
    return convo;
  }

  private present(c: ConversationWithPeople, user: User, dealAgreed: boolean) {
    const other = c.farmerId === user.id ? c.buyer : c.farmer;
    return {
      id: c.id,
      listingId: c.listingId,
      createdAt: c.createdAt,
      listing: c.listing,
      iAm: c.farmerId === user.id ? ('FARMER' as const) : ('BUYER' as const),
      dealAgreed,
      other: { id: other.id, fullName: other.fullName, photoUrl: other.photoUrl, phone: dealAgreed ? other.phone : null },
    };
  }
}
