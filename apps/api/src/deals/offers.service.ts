import { Injectable } from '@nestjs/common';
import { Offer, Prisma, User } from '@prisma/client';
import { NotificationsService } from '../alerts/notifications.service';
import { AuditService } from '../common/audit.service';
import { badRequest, forbidden, notFound } from '../common/errors';
import { PrismaService } from '../prisma.service';
import { HOUR, toDate, today } from './dates';
import { CounterOfferDto, CreateOfferDto } from './dto';

const OFFER_TTL = 48 * HOUR;

const offerInclude = {
  listing: { include: { crop: true, unit: true, photos: { take: 1, orderBy: { sortOrder: 'asc' } } } },
  buyer: { select: { id: true, fullName: true, isVerified: true } },
  order: { select: { id: true } },
} satisfies Prisma.OfferInclude;

type ListingForOffer = { id: string; farmerId: string; availableUntil: Date; crop: { nameEn: string; nameNe: string } };

@Injectable()
export class OffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  async create(buyer: User, listingId: string, dto: CreateOfferDto) {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId }, include: { crop: true } });
    if (!listing || listing.status !== 'ACTIVE') throw notFound('LISTING_NOT_FOUND', 'Listing not found.');
    if (listing.saleMode !== 'FIXED') throw badRequest('USE_BIDDING', 'This listing is an auction. Place a bid instead.');
    if (listing.farmerId === buyer.id) throw forbidden('OWN_LISTING', 'You cannot make an offer on your own listing.');
    this.checkTerms(listing, listing.quantityLeft, dto.quantity, dto.pickupDate);

    const open = await this.prisma.offer.findFirst({ where: { listingId, buyerId: buyer.id, status: 'OPEN' } });
    if (open) throw badRequest('OFFER_EXISTS', 'You already have an open offer on this listing.');

    const offer = await this.prisma.offer.create({
      data: {
        listingId,
        buyerId: buyer.id,
        pricePerUnit: dto.pricePerUnit,
        quantity: dto.quantity,
        pickupDate: toDate(dto.pickupDate),
        expiresAt: this.expiry(listing.availableUntil),
      },
      include: offerInclude,
    });
    await this.notify(listing.farmerId, 'OFFER_RECEIVED', offer, listing);
    return offer;
  }

  /** The farmer sees every offer on their listing; a buyer sees only their own. */
  async forListing(user: User, listingId: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw notFound('LISTING_NOT_FOUND', 'Listing not found.');
    await this.expireOld();
    return this.prisma.offer.findMany({
      where: { listingId, ...(listing.farmerId === user.id ? {} : { buyerId: user.id }) },
      include: offerInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Offers the user made as a buyer, or received on their listings as a farmer. */
  async mine(user: User, side: 'buying' | 'selling' = 'buying') {
    await this.expireOld();
    return this.prisma.offer.findMany({
      where: side === 'buying' ? { buyerId: user.id } : { listing: { farmerId: user.id } },
      include: offerInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async accept(user: User, id: string) {
    const { offer, listing } = await this.forResponse(user, id);
    const result = await this.prisma.$transaction(async (tx) => {
      // Lock the listing so two acceptances cannot sell the same stock twice.
      const [locked] = await tx.$queryRaw<{ status: string; quantity_left: Prisma.Decimal }[]>`
        SELECT status, quantity_left FROM listings WHERE id = ${listing.id}::uuid FOR UPDATE`;
      if (locked.status !== 'ACTIVE') throw badRequest('LISTING_CLOSED', 'This listing is no longer for sale.');
      const left = new Prisma.Decimal(locked.quantity_left).minus(offer.quantity);
      if (left.isNegative()) throw badRequest('QUANTITY_UNAVAILABLE', 'Not enough quantity is left for this offer.');

      const order = await tx.order.create({
        data: {
          listingId: listing.id,
          buyerId: offer.buyerId,
          farmerId: listing.farmerId,
          offerId: offer.id,
          pricePerUnit: offer.pricePerUnit,
          quantity: offer.quantity,
          pickupAt: offer.pickupDate,
        },
      });
      await tx.offer.update({ where: { id: offer.id }, data: { status: 'ACCEPTED' } });
      await this.audit.log(user.id, 'OFFER_ACCEPTED', 'order', order.id, { after: { offerId: offer.id, listingId: listing.id } }, tx);
      const soldOut = left.isZero();
      await tx.listing.update({
        where: { id: listing.id },
        data: { quantityLeft: left, ...(soldOut ? { status: 'SOLD' } : {}) },
      });

      // Other open offers that no longer fit what is left are turned down.
      const others = await tx.offer.findMany({
        where: { listingId: listing.id, status: 'OPEN', id: { not: offer.id }, ...(soldOut ? {} : { quantity: { gt: left } }) },
      });
      if (others.length) {
        await tx.offer.updateMany({ where: { id: { in: others.map((o) => o.id) } }, data: { status: 'REJECTED' } });
      }
      return { order, others };
    });

    await this.notify(this.otherParty(offer, listing, user), 'OFFER_ACCEPTED', offer, listing, { orderId: result.order.id });
    // The buyer on each turned-down thread hears about it, whoever made the last move.
    for (const other of result.others) await this.notify(other.buyerId, 'OFFER_REJECTED', other, listing);
    return { offer: await this.get(offer.id), orderId: result.order.id };
  }

  async reject(user: User, id: string) {
    const { offer, listing } = await this.forResponse(user, id);
    await this.prisma.offer.update({ where: { id }, data: { status: 'REJECTED' } });
    await this.notify(this.otherParty(offer, listing, user), 'OFFER_REJECTED', offer, listing);
    return this.get(id);
  }

  async counter(user: User, id: string, dto: CounterOfferDto) {
    const { offer, listing } = await this.forResponse(user, id);
    const quantity = dto.quantity ?? offer.quantity.toNumber();
    const pickupDate = dto.pickupDate ?? offer.pickupDate.toISOString();
    this.checkTerms(listing, listing.quantityLeft, quantity, pickupDate);

    const counter = await this.prisma.$transaction(async (tx) => {
      await tx.offer.update({ where: { id }, data: { status: 'COUNTERED' } });
      return tx.offer.create({
        data: {
          listingId: listing.id,
          buyerId: offer.buyerId,
          parentOfferId: offer.id,
          madeByFarmer: user.id === listing.farmerId,
          pricePerUnit: dto.pricePerUnit,
          quantity,
          pickupDate: toDate(pickupDate),
          expiresAt: this.expiry(listing.availableUntil),
        },
        include: offerInclude,
      });
    });
    await this.notify(this.otherParty(offer, listing, user), 'OFFER_COUNTERED', counter, listing);
    return counter;
  }

  /** Whoever made an offer can take it back while it is open. */
  async withdraw(user: User, id: string) {
    const offer = await this.prisma.offer.findUnique({ where: { id }, include: { listing: true } });
    if (!offer || !this.canSee(user, offer, offer.listing)) throw notFound('OFFER_NOT_FOUND', 'Offer not found.');
    const madeByUser = offer.madeByFarmer ? offer.listing.farmerId === user.id : offer.buyerId === user.id;
    if (!madeByUser) throw forbidden('NOT_YOUR_OFFER', 'Only the person who made this offer can withdraw it.');
    if (offer.status !== 'OPEN') throw badRequest('OFFER_CLOSED', 'This offer is no longer open.');
    await this.prisma.offer.update({ where: { id }, data: { status: 'WITHDRAWN' } });
    return this.get(id);
  }

  /** Marks open offers past their deadline as expired. Run every few minutes and before reads. */
  async expireOld() {
    const { count } = await this.prisma.offer.updateMany({
      where: { status: 'OPEN', expiresAt: { lt: new Date() } },
      data: { status: 'EXPIRED' },
    });
    return count;
  }

  private get(id: string) {
    return this.prisma.offer.findUniqueOrThrow({ where: { id }, include: offerInclude });
  }

  /** Loads an open offer that the user is allowed to answer: the side that did not make it. */
  private async forResponse(user: User, id: string) {
    const offer = await this.prisma.offer.findUnique({ where: { id }, include: { listing: { include: { crop: true } } } });
    if (!offer || !this.canSee(user, offer, offer.listing)) throw notFound('OFFER_NOT_FOUND', 'Offer not found.');
    const { listing } = offer;
    const responder = offer.madeByFarmer ? offer.buyerId : listing.farmerId;
    if (responder !== user.id) throw forbidden('NOT_YOUR_TURN', 'The other side has to answer this offer.');
    if (offer.status === 'OPEN' && offer.expiresAt < new Date()) {
      await this.prisma.offer.update({ where: { id }, data: { status: 'EXPIRED' } });
      throw badRequest('OFFER_EXPIRED', 'This offer has expired.');
    }
    if (offer.status !== 'OPEN') throw badRequest('OFFER_CLOSED', 'This offer is no longer open.');
    if (listing.status !== 'ACTIVE') throw badRequest('LISTING_CLOSED', 'This listing is no longer for sale.');
    return { offer, listing };
  }

  private canSee(user: User, offer: Offer, listing: { farmerId: string }) {
    return offer.buyerId === user.id || listing.farmerId === user.id;
  }

  private otherParty(offer: Offer, listing: { farmerId: string }, user: User) {
    return user.id === listing.farmerId ? offer.buyerId : listing.farmerId;
  }

  private checkTerms(listing: { availableUntil: Date }, quantityLeft: Prisma.Decimal, quantity: number, pickupDate: string) {
    if (quantityLeft.lessThan(quantity)) {
      throw badRequest('QUANTITY_UNAVAILABLE', 'Not enough quantity is left for this offer.');
    }
    const pickup = toDate(pickupDate);
    if (pickup < today() || pickup > listing.availableUntil) {
      throw badRequest('PICKUP_DATE_INVALID', 'Pick a pickup date between today and the available-until date.');
    }
  }

  /** 48 hours, but never past the end of the listing's last available day. */
  private expiry(availableUntil: Date) {
    return new Date(Math.min(Date.now() + OFFER_TTL, availableUntil.getTime() + 24 * HOUR));
  }

  private notify(
    userId: string,
    type: string,
    offer: Offer,
    listing: ListingForOffer,
    extra: Prisma.InputJsonObject = {},
  ) {
    return this.notifications.send(userId, type, {
      listingId: listing.id,
      offerId: offer.id,
      crop: { nameEn: listing.crop.nameEn, nameNe: listing.crop.nameNe },
      price: offer.pricePerUnit.toString(),
      quantity: offer.quantity.toString(),
      ...extra,
    });
  }
}
