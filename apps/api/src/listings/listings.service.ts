import { Injectable } from '@nestjs/common';
import { Listing, ListingStatus, Prisma, User } from '@prisma/client';
import { config } from '../config';
import { badRequest, forbidden, notFound } from '../common/errors';
import { AlertsService } from '../alerts/alerts.service';
import { PrismaService } from '../prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateListingDto, ListListingsQuery, RelistDto, UpdateListingDto } from './dto';

const MIN_AUCTION_MS = 60 * 60 * 1000;

/** Great-circle distance in km, to one decimal. Callers pass the rounded point, never the exact one. */
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
  return Math.round(6371 * 2 * Math.asin(Math.sqrt(a)) * 10) / 10;
}

const listingInclude = {
  crop: true,
  unit: true,
  ward: { include: { municipality: { include: { district: true } } } },
  photos: { orderBy: { sortOrder: 'asc' } },
  auction: true,
  farmer: { select: { id: true, fullName: true, photoUrl: true, isVerified: true } },
} satisfies Prisma.ListingInclude;

type ListingWithRelations = Prisma.ListingGetPayload<{ include: typeof listingInclude }>;

/** Calendar date (YYYY-MM-DD) as a UTC midnight Date, matching Postgres DATE columns. */
const toDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
const today = () => toDate(new Date().toISOString());

@Injectable()
export class ListingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly alerts: AlertsService,
  ) {}

  async create(farmer: User, dto: CreateListingDto) {
    const harvestDate = toDate(dto.harvestDate);
    const availableUntil = toDate(dto.availableUntil);
    if (availableUntil < harvestDate || availableUntil < today()) {
      throw badRequest('DATES_INVALID', 'Available-until must be today or later, and not before harvest.');
    }
    await this.checkRefs(dto.cropId, dto.unitId, dto.wardId);
    this.checkLatLng(dto.lat, dto.lng);

    let auction: Prisma.AuctionCreateWithoutListingInput | undefined;
    if (dto.saleMode === 'FIXED') {
      if (!dto.pricePerUnit) throw badRequest('PRICE_REQUIRED', 'Set a price per unit.');
      if (dto.auction) throw badRequest('AUCTION_NOT_ALLOWED', 'Fixed-price listings have no auction.');
    } else {
      const a = dto.auction;
      if (!a) throw badRequest('AUCTION_REQUIRED', 'Set the auction start price, increment and end time.');
      if (dto.pricePerUnit) throw badRequest('PRICE_NOT_ALLOWED', 'Auctions use a start price instead.');
      const endsAt = new Date(a.endsAt);
      const latestEnd = new Date(availableUntil.getTime() + 864e5);
      if (endsAt.getTime() < Date.now() + MIN_AUCTION_MS || endsAt > latestEnd) {
        throw badRequest('AUCTION_END_INVALID', 'The auction must run at least 1 hour and end by the available-until date.');
      }
      if (a.reservePrice !== undefined && a.reservePrice < a.startPrice) {
        throw badRequest('RESERVE_BELOW_START', 'The reserve price cannot be below the start price.');
      }
      auction = {
        startPrice: a.startPrice,
        reservePrice: a.reservePrice,
        minIncrement: a.minIncrement,
        startsAt: new Date(),
        endsAt,
        status: 'LIVE',
      };
    }

    const listing = await this.prisma.listing.create({
      data: {
        farmerId: farmer.id,
        cropId: dto.cropId,
        variety: dto.variety,
        grade: dto.grade,
        description: dto.description,
        quantity: dto.quantity,
        quantityLeft: dto.quantity,
        unitId: dto.unitId,
        pricePerUnit: dto.pricePerUnit,
        saleMode: dto.saleMode,
        harvestDate,
        availableUntil,
        wardId: dto.wardId,
        village: dto.village?.trim() ?? farmer.village,
        auction: auction && { create: auction },
      },
    });
    await this.setLocation(listing.id, dto.lat, dto.lng);
    await this.alerts.notifyMatches(listing.id);
    return this.get(listing.id, farmer);
  }

  async get(id: string, viewer?: User) {
    const listing = await this.prisma.listing.findUnique({ where: { id }, include: listingInclude });
    const isOwner = listing?.farmerId === viewer?.id;
    if (!listing || ((listing.status === 'DRAFT' || listing.status === 'REMOVED') && !isOwner)) {
      throw notFound('LISTING_NOT_FOUND', 'Listing not found.');
    }
    const saved = await this.savedIds(viewer, [id]);
    return { ...(await this.present(listing, isOwner)), saved: saved.has(id) };
  }

  /**
   * Search for buyers. Filters run in SQL so distance and price can be used for sorting;
   * paging is by offset, carried in an opaque cursor.
   */
  async list(q: ListListingsQuery, viewer?: User) {
    const take = q.limit ?? 20;
    const offset = q.cursor ? Number(q.cursor) : 0;
    const hasPoint = q.lat !== undefined && q.lng !== undefined;
    if ((q.lat === undefined) !== (q.lng === undefined)) {
      throw badRequest('LOCATION_INCOMPLETE', 'Send both latitude and longitude.');
    }
    if ((q.radiusKm !== undefined || q.sort === 'nearest') && !hasPoint) {
      throw badRequest('LOCATION_REQUIRED', 'Share your location to search nearby.');
    }
    if (q.minPrice !== undefined && q.maxPrice !== undefined && q.minPrice > q.maxPrice) {
      throw badRequest('PRICE_RANGE_INVALID', 'The lowest price is above the highest price.');
    }

    const price = Prisma.sql`COALESCE(l.price_per_unit, a.start_price)`;
    const here = hasPoint ? Prisma.sql`ST_SetSRID(ST_MakePoint(${q.lng}, ${q.lat}), 4326)::geography` : null;
    const where: Prisma.Sql[] = [Prisma.sql`l.status = ${q.status ?? 'ACTIVE'}::"ListingStatus"`];
    if (q.cropId !== undefined) where.push(Prisma.sql`l.crop_id = ${q.cropId}`);
    if (q.wardId !== undefined) where.push(Prisma.sql`l.ward_id = ${q.wardId}`);
    if (q.municipalityId !== undefined) where.push(Prisma.sql`w.municipality_id = ${q.municipalityId}`);
    if (q.saleMode) where.push(Prisma.sql`l.sale_mode = ${q.saleMode}::"SaleMode"`);
    if (q.minPrice !== undefined) where.push(Prisma.sql`${price} >= ${q.minPrice}`);
    if (q.maxPrice !== undefined) where.push(Prisma.sql`${price} <= ${q.maxPrice}`);
    if (q.q?.trim()) {
      const like = `%${q.q.trim().replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
      where.push(Prisma.sql`(c.name_en ILIKE ${like} OR c.name_ne ILIKE ${like}
        OR l.variety ILIKE ${like} OR l.village ILIKE ${like})`);
    }
    if (here && q.radiusKm !== undefined) {
      where.push(Prisma.sql`ST_DWithin(l.location, ${here}, ${q.radiusKm * 1000})`);
    }

    const orderBy = {
      newest: Prisma.sql`l.created_at DESC`,
      price_asc: Prisma.sql`${price} ASC`,
      price_desc: Prisma.sql`${price} DESC`,
      nearest: here ? Prisma.sql`ST_Distance(l.location, ${here}) ASC NULLS LAST` : Prisma.empty,
      // Auctions closing first; fixed-price listings follow, newest first.
      ending_soon: Prisma.sql`a.ends_at ASC NULLS LAST, l.created_at DESC`,
    }[q.sort ?? 'newest'];

    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT l.id FROM listings l
      JOIN crops c ON c.id = l.crop_id
      JOIN wards w ON w.id = l.ward_id
      LEFT JOIN auctions a ON a.listing_id = l.id
      WHERE ${Prisma.join(where, ' AND ')}
      ORDER BY ${orderBy}, l.id DESC
      LIMIT ${take + 1} OFFSET ${offset}`;
    const ids = rows.slice(0, take).map((r) => r.id);
    const found = await this.prisma.listing.findMany({ where: { id: { in: ids } }, include: listingInclude });
    const byId = new Map(found.map((l) => [l.id, l]));
    const saved = await this.savedIds(viewer, ids);
    const items = await Promise.all(
      ids.map(async (id) => {
        const item = await this.present(byId.get(id)!, false);
        return {
          ...item,
          saved: saved.has(id),
          distanceKm: hasPoint && item.location ? distanceKm(q.lat!, q.lng!, item.location.lat, item.location.lng) : null,
        };
      }),
    );
    return { items, nextCursor: rows.length > take ? String(offset + take) : null };
  }

  async save(user: User, id: string) {
    await this.get(id, user);
    await this.prisma.savedListing.upsert({
      where: { userId_listingId: { userId: user.id, listingId: id } },
      create: { userId: user.id, listingId: id },
      update: {},
    });
  }

  async unsave(user: User, id: string) {
    await this.prisma.savedListing.deleteMany({ where: { userId: user.id, listingId: id } });
  }

  /** Saved listings, newest saved first. Removed ones drop out; sold or expired ones stay, marked. */
  async saved(user: User) {
    const rows = await this.prisma.savedListing.findMany({
      where: { userId: user.id, listing: { status: { notIn: ['REMOVED', 'DRAFT'] } } },
      include: { listing: { include: listingInclude } },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(
      rows.map(async (r) => ({ ...(await this.present(r.listing, r.listing.farmerId === user.id)), saved: true })),
    );
  }

  private async savedIds(viewer: User | undefined, ids: string[]) {
    if (!viewer || ids.length === 0) return new Set<string>();
    const rows = await this.prisma.savedListing.findMany({
      where: { userId: viewer.id, listingId: { in: ids } },
      select: { listingId: true },
    });
    return new Set(rows.map((r) => r.listingId));
  }

  async mine(farmer: User) {
    const rows = await this.prisma.listing.findMany({
      where: { farmerId: farmer.id, status: { not: 'REMOVED' } },
      include: listingInclude,
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(rows.map((l) => this.present(l, true)));
  }

  async update(user: User, id: string, dto: UpdateListingDto) {
    const listing = await this.owned(user, id);
    if (listing.status === 'SOLD' || listing.status === 'REMOVED') {
      throw badRequest('LISTING_CLOSED', 'This listing can no longer be edited.');
    }
    if (listing.saleMode === 'AUCTION' && (await this.prisma.bid.count({ where: { auction: { listingId: id } } })) > 0) {
      throw badRequest('AUCTION_HAS_BIDS', 'An auction with bids runs to its end.');
    }
    if (dto.pricePerUnit !== undefined && listing.saleMode !== 'FIXED') {
      throw badRequest('PRICE_NOT_ALLOWED', 'Auctions use a start price instead.');
    }
    if (dto.wardId !== undefined) await this.checkRefs(undefined, undefined, dto.wardId);
    this.checkLatLng(dto.lat, dto.lng);

    let availableUntil: Date | undefined;
    if (dto.availableUntil) {
      availableUntil = toDate(dto.availableUntil);
      if (availableUntil < listing.harvestDate || availableUntil < today()) {
        throw badRequest('DATES_INVALID', 'Available-until must be today or later, and not before harvest.');
      }
    }

    // Changing the total keeps what has already been sold: quantityLeft moves by the same amount.
    let quantityLeft: Prisma.Decimal | undefined;
    if (dto.quantity !== undefined) {
      const sold = listing.quantity.minus(listing.quantityLeft);
      if (sold.greaterThan(dto.quantity)) {
        throw badRequest('QUANTITY_BELOW_SOLD', 'Quantity cannot be less than what is already sold.');
      }
      quantityLeft = new Prisma.Decimal(dto.quantity).minus(sold);
    }

    await this.prisma.listing.update({
      where: { id },
      data: {
        variety: dto.variety,
        grade: dto.grade,
        description: dto.description,
        quantity: dto.quantity,
        quantityLeft,
        pricePerUnit: dto.pricePerUnit,
        availableUntil,
        wardId: dto.wardId,
        village: dto.village?.trim(),
      },
    });
    await this.setLocation(id, dto.lat, dto.lng);
    return this.get(id, user);
  }

  async setStatus(user: User, id: string, action: 'pause' | 'resume' | 'sold' | 'remove') {
    const listing = await this.owned(user, id);
    const allowed: Record<typeof action, { from: ListingStatus[]; to: ListingStatus }> = {
      pause: { from: ['ACTIVE'], to: 'PAUSED' },
      resume: { from: ['PAUSED'], to: 'ACTIVE' },
      sold: { from: ['ACTIVE', 'PAUSED'], to: 'SOLD' },
      remove: { from: ['DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED'], to: 'REMOVED' },
    };
    const rule = allowed[action];
    if (!rule.from.includes(listing.status)) {
      throw badRequest('STATUS_CHANGE_INVALID', `A ${listing.status.toLowerCase()} listing cannot be ${action}d.`);
    }
    if (listing.saleMode === 'AUCTION' && action !== 'remove') {
      const bids = await this.prisma.bid.count({ where: { auction: { listingId: id } } });
      if (bids > 0) throw badRequest('AUCTION_HAS_BIDS', 'An auction with bids runs to its end.');
    }
    if (action === 'remove' && listing.saleMode === 'AUCTION') {
      const auction = await this.prisma.auction.findUnique({ where: { listingId: id }, include: { _count: { select: { bids: true } } } });
      if (auction && auction._count.bids > 0 && (auction.status === 'LIVE' || auction.status === 'AWAITING_CONFIRMATION')) {
        throw badRequest('AUCTION_HAS_BIDS', 'An auction with bids runs to its end.');
      }
    }
    if (action === 'resume' && listing.availableUntil < today()) {
      throw badRequest('LISTING_EXPIRED', 'This listing has expired. Relist it with new dates.');
    }
    await this.prisma.listing.update({ where: { id }, data: { status: rule.to } });
    return this.get(id, user);
  }

  async relist(user: User, id: string, dto: RelistDto) {
    const listing = await this.owned(user, id);
    if (listing.status !== 'EXPIRED' && listing.status !== 'SOLD') {
      throw badRequest('STATUS_CHANGE_INVALID', 'Only expired or sold listings can be relisted.');
    }
    if (listing.saleMode === 'AUCTION') {
      throw badRequest('RELIST_AUCTION', 'Post a new listing to run another auction.');
    }
    const availableUntil = toDate(dto.availableUntil);
    if (availableUntil < today()) throw badRequest('DATES_INVALID', 'Available-until must be today or later.');
    const quantity = dto.quantity ?? listing.quantityLeft.toNumber();
    if (quantity <= 0) throw badRequest('QUANTITY_REQUIRED', 'Set the quantity you have available.');
    await this.prisma.listing.update({
      where: { id },
      data: { status: 'ACTIVE', availableUntil, quantity, quantityLeft: quantity },
    });
    return this.get(id, user);
  }

  async addPhoto(user: User, id: string, file: Express.Multer.File) {
    const listing = await this.owned(user, id);
    const count = await this.prisma.listingPhoto.count({ where: { listingId: id } });
    if (count >= config.maxListingPhotos) {
      throw badRequest('PHOTO_LIMIT', `A listing can have up to ${config.maxListingPhotos} photos.`);
    }
    const url = await this.storage.saveImage(`listings/${listing.id}`, file);
    await this.prisma.listingPhoto.create({ data: { listingId: id, url, sortOrder: count } });
    return this.get(id, user);
  }

  async removePhoto(user: User, id: string, photoId: string) {
    await this.owned(user, id);
    const photo = await this.prisma.listingPhoto.findFirst({ where: { id: photoId, listingId: id } });
    if (!photo) throw notFound('PHOTO_NOT_FOUND', 'Photo not found.');
    await this.prisma.listingPhoto.delete({ where: { id: photoId } });
    await this.storage.removePublic(photo.url);
    return this.get(id, user);
  }

  /** Marks listings past their available-until date as expired. Run hourly. */
  async expireOld() {
    const { count } = await this.prisma.listing.updateMany({
      where: {
        status: { in: ['ACTIVE', 'PAUSED'] },
        availableUntil: { lt: today() },
        // A winner waiting for the farmer's confirmation keeps the listing open past its date.
        OR: [{ auction: { is: null } }, { auction: { status: { not: 'AWAITING_CONFIRMATION' } } }],
      },
      data: { status: 'EXPIRED' },
    });
    return count;
  }

  private async owned(user: User, id: string): Promise<Listing> {
    const listing = await this.prisma.listing.findUnique({ where: { id } });
    if (!listing || listing.status === 'REMOVED') throw notFound('LISTING_NOT_FOUND', 'Listing not found.');
    if (listing.farmerId !== user.id) throw forbidden('NOT_OWNER', 'Only the farmer who posted this can change it.');
    return listing;
  }

  private async checkRefs(cropId?: number, unitId?: number, wardId?: number) {
    const [crop, unit, ward] = await Promise.all([
      cropId === undefined ? true : this.prisma.crop.findUnique({ where: { id: cropId } }),
      unitId === undefined ? true : this.prisma.unit.findUnique({ where: { id: unitId } }),
      wardId === undefined ? true : this.prisma.ward.findUnique({ where: { id: wardId } }),
    ]);
    if (!crop) throw badRequest('CROP_INVALID', 'Choose a crop from the list.');
    if (!unit) throw badRequest('UNIT_INVALID', 'Choose a unit from the list.');
    if (!ward) throw badRequest('WARD_INVALID', 'Choose a ward from the list.');
  }

  private checkLatLng(lat?: number, lng?: number) {
    if ((lat === undefined) !== (lng === undefined)) {
      throw badRequest('LOCATION_INCOMPLETE', 'Send both latitude and longitude.');
    }
  }

  private async setLocation(id: string, lat?: number, lng?: number) {
    if (lat === undefined || lng === undefined) return;
    await this.prisma.$executeRaw`
      UPDATE listings
      SET location = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      WHERE id = ${id}::uuid`;
  }

  /**
   * Shapes a listing for the API. Only the owner sees the exact pickup point; everyone else
   * gets it rounded to about 1 km. Buyers see the exact point once an order exists (phase 4).
   */
  private async present(listing: ListingWithRelations, isOwner: boolean) {
    const [point] = await this.prisma.$queryRaw<{ lat: number; lng: number }[]>`
      SELECT ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
      FROM listings WHERE id = ${listing.id}::uuid AND location IS NOT NULL`;
    const round = (n: number) => Math.round(n * 100) / 100;
    return {
      ...listing,
      location: point ? (isOwner ? point : { lat: round(point.lat), lng: round(point.lng), approximate: true }) : null,
      auction: listing.auction && {
        ...listing.auction,
        // The reserve price is the farmer's secret until the auction closes.
        reservePrice: isOwner ? listing.auction.reservePrice : undefined,
        hasReserve: listing.auction.reservePrice !== null,
      },
    };
  }
}
