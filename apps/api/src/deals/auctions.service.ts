import { Injectable, Logger } from '@nestjs/common';
import { Bid, Prisma, User } from '@prisma/client';
import { NotificationsService } from '../alerts/notifications.service';
import { AuditService } from '../common/audit.service';
import { badRequest, forbidden, notFound } from '../common/errors';
import { PrismaService } from '../prisma.service';
import { HOUR } from './dates';

const SNIPE_WINDOW = 5 * 60 * 1000;
const CONFIRM_WINDOW = 24 * HOUR;

type Tx = Prisma.TransactionClient;
type AuctionRow = {
  id: string;
  listing_id: string;
  status: string;
  start_price: Prisma.Decimal;
  min_increment: Prisma.Decimal;
  reserve_price: Prisma.Decimal | null;
  ends_at: Date;
};

@Injectable()
export class AuctionsService {
  private readonly log = new Logger(AuctionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Live view of an auction. Other buyers are shown as "Buyer 1", "Buyer 2" in the order they
   * first bid; the farmer sees names. The reserve stays hidden; only whether it is met is shown.
   */
  async state(listingId: string, viewer?: User) {
    const auction = await this.prisma.auction.findUnique({
      where: { listingId },
      include: {
        listing: { select: { farmerId: true, quantityLeft: true, status: true } },
        bids: { orderBy: [{ amountPerUnit: 'desc' }, { placedAt: 'asc' }], include: { buyer: { select: { fullName: true } } } },
        winningBid: true,
      },
    });
    if (!auction) throw notFound('AUCTION_NOT_FOUND', 'This listing has no auction.');
    const isFarmer = viewer?.id === auction.listing.farmerId;

    const order = [...auction.bids].sort((a, b) => a.placedAt.getTime() - b.placedAt.getTime());
    const labels = new Map<string, number>();
    for (const bid of order) if (!labels.has(bid.buyerId)) labels.set(bid.buyerId, labels.size + 1);

    const highest = auction.bids[0];
    const nextMin = highest ? highest.amountPerUnit.plus(auction.minIncrement) : auction.startPrice;
    const mine = viewer ? auction.bids.find((b) => b.buyerId === viewer.id) : undefined;
    const winnerId = auction.winningBid?.buyerId;
    return {
      listingId,
      status: auction.status,
      startPrice: auction.startPrice,
      minIncrement: auction.minIncrement,
      endsAt: auction.endsAt,
      serverTime: new Date(),
      confirmBy: auction.confirmBy,
      highest: highest?.amountPerUnit ?? null,
      nextMin,
      bidCount: auction.bids.length,
      bidderCount: labels.size,
      hasReserve: auction.reservePrice !== null,
      reserveMet: auction.reservePrice === null || (!!highest && highest.amountPerUnit.gte(auction.reservePrice)),
      myHighest: mine?.amountPerUnit ?? null,
      iAmLeading: !!viewer && highest?.buyerId === viewer.id,
      iAmWinner: !!viewer && winnerId === viewer.id,
      winningAmount: isFarmer || winnerId === viewer?.id ? (auction.winningBid?.amountPerUnit ?? null) : null,
      winnerName: isFarmer ? (auction.bids.find((b) => b.id === auction.winningBidId)?.buyer.fullName ?? null) : null,
      bids: auction.bids.slice(0, 20).map((b) => ({
        amountPerUnit: b.amountPerUnit,
        placedAt: b.placedAt,
        bidder: b.buyerId === viewer?.id ? 'you' : `#${labels.get(b.buyerId)}`,
        name: isFarmer ? b.buyer.fullName : undefined,
      })),
    };
  }

  async bid(buyer: User, listingId: string, amount: number) {
    const outbid = await this.prisma.$transaction(async (tx) => {
      // The row lock makes bids on one auction take turns, so increments and extensions stay right.
      const [a] = await tx.$queryRaw<AuctionRow[]>`
        SELECT id, listing_id, status, start_price, min_increment, reserve_price, ends_at
        FROM auctions WHERE listing_id = ${listingId}::uuid FOR UPDATE`;
      if (!a) throw notFound('AUCTION_NOT_FOUND', 'This listing has no auction.');
      const listing = await tx.listing.findUniqueOrThrow({ where: { id: listingId } });
      if (listing.farmerId === buyer.id) throw forbidden('OWN_LISTING', 'You cannot bid on your own listing.');
      const now = new Date();
      if (a.status !== 'LIVE' || listing.status !== 'ACTIVE' || a.ends_at <= now) {
        throw badRequest('AUCTION_CLOSED', 'This auction has ended.');
      }
      const highest = await tx.bid.findFirst({ where: { auctionId: a.id }, orderBy: [{ amountPerUnit: 'desc' }, { placedAt: 'asc' }] });
      const min = highest ? new Prisma.Decimal(highest.amountPerUnit).plus(a.min_increment) : new Prisma.Decimal(a.start_price);
      if (min.greaterThan(amount)) throw badRequest('BID_TOO_LOW', `Bid at least Rs. ${min.toString()}.`);

      const bid = await tx.bid.create({ data: { auctionId: a.id, buyerId: buyer.id, amountPerUnit: amount } });
      await this.audit.log(buyer.id, 'BID_PLACED', 'bid', bid.id, { after: { listingId, amountPerUnit: amount } }, tx);
      if (a.ends_at.getTime() - now.getTime() < SNIPE_WINDOW) {
        await tx.auction.update({ where: { id: a.id }, data: { endsAt: new Date(now.getTime() + SNIPE_WINDOW) } });
      }
      return highest && highest.buyerId !== buyer.id ? highest : null;
    });
    if (outbid) await this.notify(outbid.buyerId, 'OUTBID', listingId, { price: String(amount) });
    return this.state(listingId, buyer);
  }

  /** The farmer accepts the winning bid: the sale becomes an order for the whole remaining lot. */
  async confirm(farmer: User, listingId: string) {
    const auction = await this.awaiting(farmer, listingId);
    const bid = auction.winningBid!;
    const order = await this.prisma.$transaction(async (tx) => {
      const listing = await tx.listing.findUniqueOrThrow({ where: { id: listingId } });
      const created = await tx.order.create({
        data: {
          listingId,
          buyerId: bid.buyerId,
          farmerId: listing.farmerId,
          bidId: bid.id,
          pricePerUnit: bid.amountPerUnit,
          quantity: listing.quantityLeft,
        },
      });
      await tx.auction.update({ where: { id: auction.id }, data: { status: 'CLOSED', confirmBy: null } });
      await tx.listing.update({ where: { id: listingId }, data: { status: 'SOLD', quantityLeft: 0 } });
      await this.audit.log(farmer.id, 'AUCTION_CONFIRMED', 'order', created.id, { after: { bidId: bid.id, listingId } }, tx);
      return created;
    });
    await this.notify(bid.buyerId, 'AUCTION_WON', listingId, { price: bid.amountPerUnit.toString(), orderId: order.id });
    return { ...(await this.state(listingId, farmer)), orderId: order.id };
  }

  /** The farmer passes on the current winner; the lot goes to the next-highest other bidder. */
  async pass(farmer: User, listingId: string) {
    const auction = await this.awaiting(farmer, listingId);
    await this.prisma.$transaction((tx) => this.passToNext(tx, auction.id, auction.winningBid!));
    return this.state(listingId, farmer);
  }

  /**
   * Closes auctions whose time is up and moves on winners the farmer did not confirm within
   * 24 hours. Run every minute.
   */
  async closeDue() {
    const now = new Date();
    const due = await this.prisma.auction.findMany({
      where: {
        OR: [
          { status: 'LIVE', endsAt: { lte: now } },
          { status: 'AWAITING_CONFIRMATION', confirmBy: { lte: now } },
        ],
      },
      select: { id: true },
    });
    for (const { id } of due) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const [a] = await tx.$queryRaw<AuctionRow[]>`
            SELECT id, listing_id, status, start_price, min_increment, reserve_price, ends_at
            FROM auctions WHERE id = ${id}::uuid FOR UPDATE`;
          const auction = await tx.auction.findUniqueOrThrow({ where: { id }, include: { winningBid: true } });
          if (a.status === 'LIVE' && a.ends_at <= now) await this.pickWinner(tx, auction.id, auction.listingId);
          else if (a.status === 'AWAITING_CONFIRMATION' && auction.confirmBy && auction.confirmBy <= now) {
            await this.passToNext(tx, auction.id, auction.winningBid!);
          }
        });
      } catch (err) {
        this.log.error(`Closing auction ${id} failed`, err as Error);
      }
    }
    return due.length;
  }

  private async pickWinner(tx: Tx, auctionId: string, listingId: string) {
    const winner = await this.nextBid(tx, auctionId, []);
    const bidders = await tx.bid.findMany({ where: { auctionId }, distinct: ['buyerId'], select: { buyerId: true } });
    const listing = await tx.listing.findUniqueOrThrow({ where: { id: listingId } });
    if (winner) {
      await tx.auction.update({
        where: { id: auctionId },
        data: { status: 'AWAITING_CONFIRMATION', winningBidId: winner.id, confirmBy: new Date(Date.now() + CONFIRM_WINDOW) },
      });
      await this.notify(listing.farmerId, 'AUCTION_CONFIRM', listingId, { price: winner.amountPerUnit.toString() }, tx);
      await this.notify(winner.buyerId, 'AUCTION_LEADING', listingId, { price: winner.amountPerUnit.toString() }, tx);
      const losers = bidders.map((b) => b.buyerId).filter((id) => id !== winner.buyerId);
      await this.notify(losers, 'AUCTION_LOST', listingId, {}, tx);
    } else {
      await this.noSale(tx, auctionId, listingId);
      await this.notify(bidders.map((b) => b.buyerId), 'AUCTION_LOST', listingId, {}, tx);
    }
  }

  private async passToNext(tx: Tx, auctionId: string, current: Bid) {
    const auction = await tx.auction.update({
      where: { id: auctionId },
      data: { passedBuyerIds: { push: current.buyerId } },
    });
    await this.notify(current.buyerId, 'AUCTION_PASSED', auction.listingId, {}, tx);
    const next = await this.nextBid(tx, auctionId, auction.passedBuyerIds);
    if (!next) return this.noSale(tx, auctionId, auction.listingId);
    await tx.auction.update({
      where: { id: auctionId },
      data: { winningBidId: next.id, confirmBy: new Date(Date.now() + CONFIRM_WINDOW) },
    });
    const listing = await tx.listing.findUniqueOrThrow({ where: { id: auction.listingId } });
    await this.notify(listing.farmerId, 'AUCTION_CONFIRM', auction.listingId, { price: next.amountPerUnit.toString() }, tx);
    await this.notify(next.buyerId, 'AUCTION_LEADING', auction.listingId, { price: next.amountPerUnit.toString() }, tx);
  }

  /** Highest bid at or above the reserve from a buyer who has not been passed over. */
  private async nextBid(tx: Tx, auctionId: string, passed: string[]) {
    const auction = await tx.auction.findUniqueOrThrow({ where: { id: auctionId } });
    return tx.bid.findFirst({
      where: {
        auctionId,
        buyerId: { notIn: passed },
        ...(auction.reservePrice ? { amountPerUnit: { gte: auction.reservePrice } } : {}),
      },
      orderBy: [{ amountPerUnit: 'desc' }, { placedAt: 'asc' }],
    });
  }

  private async noSale(tx: Tx, auctionId: string, listingId: string) {
    await tx.auction.update({ where: { id: auctionId }, data: { status: 'NO_SALE', winningBidId: null, confirmBy: null } });
    const listing = await tx.listing.update({ where: { id: listingId }, data: { status: 'EXPIRED' } });
    await this.notify(listing.farmerId, 'AUCTION_NO_SALE', listingId, {}, tx);
  }

  private async awaiting(farmer: User, listingId: string) {
    const auction = await this.prisma.auction.findUnique({
      where: { listingId },
      include: { listing: true, winningBid: true },
    });
    if (!auction) throw notFound('AUCTION_NOT_FOUND', 'This listing has no auction.');
    if (auction.listing.farmerId !== farmer.id) throw forbidden('NOT_OWNER', 'Only the farmer who posted this can do that.');
    if (auction.status !== 'AWAITING_CONFIRMATION' || !auction.winningBid) {
      throw badRequest('AUCTION_NOT_AWAITING', 'There is no winning bid waiting for you.');
    }
    return auction;
  }

  private async notify(userIds: string | string[], type: string, listingId: string, extra: Prisma.InputJsonObject, tx?: Tx) {
    const listing = await (tx ?? this.prisma).listing.findUniqueOrThrow({ where: { id: listingId }, include: { crop: true } });
    await this.notifications.send(
      userIds,
      type,
      { listingId, crop: { nameEn: listing.crop.nameEn, nameNe: listing.crop.nameNe }, ...extra },
      tx,
    );
  }
}
