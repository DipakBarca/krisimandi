import { Injectable } from '@nestjs/common';
import { Listing, ListingStatus, Prisma, User } from '@prisma/client';
import { config } from '../config';
import { badRequest, forbidden, notFound } from '../common/errors';
import { PrismaService } from '../prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateListingDto, ListListingsQuery, RelistDto, UpdateListingDto } from './dto';

const MIN_AUCTION_MS = 60 * 60 * 1000;

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
    return this.get(listing.id, farmer);
  }

  async get(id: string, viewer?: User) {
    const listing = await this.prisma.listing.findUnique({ where: { id }, include: listingInclude });
    const isOwner = listing?.farmerId === viewer?.id;
    if (!listing || ((listing.status === 'DRAFT' || listing.status === 'REMOVED') && !isOwner)) {
      throw notFound('LISTING_NOT_FOUND', 'Listing not found.');
    }
    return this.present(listing, isOwner);
  }

  async list(q: ListListingsQuery) {
    const take = q.limit ?? 20;
    const rows = await this.prisma.listing.findMany({
      where: {
        status: q.status ?? 'ACTIVE',
        cropId: q.cropId,
        saleMode: q.saleMode,
        ward: q.municipalityId ? { municipalityId: q.municipalityId } : undefined,
      },
      include: listingInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, take);
    const items = await Promise.all(page.map((l) => this.present(l, false)));
    return { items, nextCursor: rows.length > take ? page.at(-1)!.id : null };
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
      where: { status: { in: ['ACTIVE', 'PAUSED'] }, availableUntil: { lt: today() } },
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
