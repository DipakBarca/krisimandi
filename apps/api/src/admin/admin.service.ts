import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { NotificationsService } from '../alerts/notifications.service';
import { AuditService } from '../common/audit.service';
import { badRequest, notFound } from '../common/errors';
import { PrismaService } from '../prisma.service';
import { AuditQuery, CreateCropDto, UpdateCropDto } from './dto';

const userSelect = {
  id: true,
  phone: true,
  fullName: true,
  roles: true,
  village: true,
  isVerified: true,
  isSuspended: true,
  createdAt: true,
  _count: { select: { listings: true, buyerOrders: true, farmerOrders: true } },
} satisfies Prisma.UserSelect;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  async stats() {
    const [farmers, buyers, suspended, activeListings, orders, openComplaints, pendingDocs] = await Promise.all([
      this.prisma.user.count({ where: { roles: { has: 'FARMER' } } }),
      this.prisma.user.count({ where: { roles: { has: 'BUYER' } } }),
      this.prisma.user.count({ where: { isSuspended: true } }),
      this.prisma.listing.count({ where: { status: 'ACTIVE' } }),
      this.prisma.order.groupBy({ by: ['status'], _count: true }),
      this.prisma.complaint.count({ where: { status: { not: 'CLOSED' } } }),
      this.prisma.verificationDoc.count({ where: { status: 'PENDING' } }),
    ]);
    return {
      farmers,
      buyers,
      suspended,
      activeListings,
      orders: Object.fromEntries(orders.map((o) => [o.status, o._count])),
      openComplaints,
      pendingDocs,
    };
  }

  /** Finds people by name or phone digits; newest first when no search is given. */
  users(q?: string) {
    const term = q?.trim();
    const digits = term?.replace(/\D/g, '');
    return this.prisma.user.findMany({
      where: term
        ? {
            OR: [
              { fullName: { contains: term, mode: 'insensitive' } },
              ...(digits && digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
            ],
          }
        : undefined,
      select: userSelect,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /**
   * Suspends an account: they are signed out, cannot sign in again, and their active listings are
   * paused so buyers no longer see them. Orders already agreed stay as they are.
   */
  async suspend(admin: User, id: string, reason: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw notFound('USER_NOT_FOUND', 'User not found.');
    if (user.id === admin.id || user.roles.includes('ADMIN')) {
      throw badRequest('CANNOT_SUSPEND_ADMIN', 'Admins cannot be suspended here.');
    }
    if (user.isSuspended) throw badRequest('ALREADY_SUSPENDED', 'This account is already suspended.');
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { isSuspended: true } });
      await tx.refreshToken.deleteMany({ where: { userId: id } });
      const paused = await tx.listing.updateMany({ where: { farmerId: id, status: 'ACTIVE' }, data: { status: 'PAUSED' } });
      await this.audit.log(admin.id, 'USER_SUSPENDED', 'user', id, { after: { reason, listingsPaused: paused.count } }, tx);
    });
    return this.prisma.user.findUniqueOrThrow({ where: { id }, select: userSelect });
  }

  /** Lifts a suspension. Paused listings stay paused until the farmer resumes them. */
  async unsuspend(admin: User, id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw notFound('USER_NOT_FOUND', 'User not found.');
    if (!user.isSuspended) throw badRequest('NOT_SUSPENDED', 'This account is not suspended.');
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { isSuspended: false } });
      await this.audit.log(admin.id, 'USER_UNSUSPENDED', 'user', id, {}, tx);
    });
    return this.prisma.user.findUniqueOrThrow({ where: { id }, select: userSelect });
  }

  /** Takes a listing down and tells the farmer why. A live auction on it ends with no sale. */
  async removeListing(admin: User, id: string, reason: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id }, include: { crop: true, auction: true } });
    if (!listing || listing.status === 'REMOVED') throw notFound('LISTING_NOT_FOUND', 'Listing not found.');
    await this.prisma.$transaction(async (tx) => {
      await tx.listing.update({ where: { id }, data: { status: 'REMOVED' } });
      if (listing.auction && (listing.auction.status === 'LIVE' || listing.auction.status === 'AWAITING_CONFIRMATION')) {
        await tx.auction.update({ where: { id: listing.auction.id }, data: { status: 'NO_SALE', confirmBy: null } });
      }
      await tx.offer.updateMany({ where: { listingId: id, status: 'OPEN' }, data: { status: 'REJECTED' } });
      await this.audit.log(admin.id, 'LISTING_REMOVED', 'listing', id, { before: { status: listing.status }, after: { status: 'REMOVED', reason } }, tx);
      await this.notifications.send(
        listing.farmerId,
        'LISTING_REMOVED',
        { listingId: id, reason, crop: { nameEn: listing.crop.nameEn, nameNe: listing.crop.nameNe } },
        tx,
      );
    });
    return { id, status: 'REMOVED' };
  }

  async createCrop(admin: User, dto: CreateCropDto) {
    await this.checkUnit(dto.defaultUnitId);
    const crop = await this.saveCrop(() => this.prisma.crop.create({ data: this.cropData(dto) as Prisma.CropUncheckedCreateInput }));
    await this.audit.log(admin.id, 'CROP_CREATED', 'crop', String(crop.id), { after: { ...this.cropData(dto) } });
    return crop;
  }

  async updateCrop(admin: User, id: number, dto: UpdateCropDto) {
    const crop = await this.prisma.crop.findUnique({ where: { id } });
    if (!crop) throw notFound('CROP_NOT_FOUND', 'Crop not found.');
    if (dto.defaultUnitId) await this.checkUnit(dto.defaultUnitId);
    const updated = await this.saveCrop(() => this.prisma.crop.update({ where: { id }, data: this.cropData(dto) }));
    const { nameEn, nameNe, category, defaultUnitId } = crop;
    await this.audit.log(admin.id, 'CROP_UPDATED', 'crop', String(id), {
      before: { nameEn, nameNe, category, defaultUnitId },
      after: { ...this.cropData(dto) },
    });
    return updated;
  }

  /** Newest entries first, 50 at a time. Ids are BigInt in the database, so they go out as numbers. */
  async auditLog(q: AuditQuery) {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        ...(q.entity ? { entity: q.entity } : {}),
        ...(q.entityId ? { entityId: q.entityId } : {}),
        ...(q.before ? { id: { lt: BigInt(q.before) } } : {}),
      },
      include: { actor: { select: { id: true, fullName: true } } },
      orderBy: { id: 'desc' },
      take: 50,
    });
    return rows.map((r) => ({ ...r, id: Number(r.id) }));
  }

  private cropData(dto: UpdateCropDto) {
    return {
      ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn.trim() } : {}),
      ...(dto.nameNe !== undefined ? { nameNe: dto.nameNe.trim() } : {}),
      ...(dto.category !== undefined ? { category: dto.category } : {}),
      ...(dto.defaultUnitId !== undefined ? { defaultUnitId: dto.defaultUnitId } : {}),
    };
  }

  private async checkUnit(id: number) {
    if (!(await this.prisma.unit.count({ where: { id } }))) throw badRequest('UNIT_NOT_FOUND', 'Unit not found.');
  }

  private async saveCrop<T>(save: () => Promise<T>) {
    try {
      return await save();
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw badRequest('CROP_EXISTS', 'A crop with this English name already exists.');
      }
      throw err;
    }
  }
}
