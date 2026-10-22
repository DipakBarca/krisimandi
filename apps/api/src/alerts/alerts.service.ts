import { Injectable, Logger } from '@nestjs/common';
import { User } from '@prisma/client';
import { badRequest, notFound } from '../common/errors';
import { PrismaService } from '../prisma.service';
import { CreateAlertDto } from '../listings/dto';

const MAX_ALERTS = 20;

@Injectable()
export class AlertsService {
  private readonly log = new Logger(AlertsService.name);

  constructor(private readonly prisma: PrismaService) {}

  list(user: User) {
    return this.prisma.cropAlert.findMany({
      where: { userId: user.id },
      include: { crop: true, municipality: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(user: User, dto: CreateAlertDto) {
    const [crop, municipality, count] = await Promise.all([
      this.prisma.crop.findUnique({ where: { id: dto.cropId } }),
      dto.municipalityId === undefined ? true : this.prisma.municipality.findUnique({ where: { id: dto.municipalityId } }),
      this.prisma.cropAlert.count({ where: { userId: user.id } }),
    ]);
    if (!crop) throw badRequest('CROP_INVALID', 'Choose a crop from the list.');
    if (!municipality) throw badRequest('MUNICIPALITY_INVALID', 'Choose a municipality from the list.');
    if (count >= MAX_ALERTS) throw badRequest('ALERT_LIMIT', `You can have up to ${MAX_ALERTS} alerts.`);
    const same = await this.prisma.cropAlert.findFirst({
      where: { userId: user.id, cropId: dto.cropId, municipalityId: dto.municipalityId ?? null },
    });
    const data = { cropId: dto.cropId, municipalityId: dto.municipalityId ?? null, maxPrice: dto.maxPrice ?? null };
    // Asking again for the same crop and place updates the price instead of adding a duplicate.
    const alert = same
      ? await this.prisma.cropAlert.update({ where: { id: same.id }, data })
      : await this.prisma.cropAlert.create({ data: { ...data, userId: user.id } });
    return this.prisma.cropAlert.findUniqueOrThrow({
      where: { id: alert.id },
      include: { crop: true, municipality: true },
    });
  }

  async remove(user: User, id: string) {
    const { count } = await this.prisma.cropAlert.deleteMany({ where: { id, userId: user.id } });
    if (!count) throw notFound('ALERT_NOT_FOUND', 'Alert not found.');
  }

  /**
   * Tells buyers whose alerts match a newly posted listing. One notification per buyer,
   * however many of their alerts match. Failures are logged, never thrown at the farmer.
   */
  async notifyMatches(listingId: string) {
    try {
      const listing = await this.prisma.listing.findUniqueOrThrow({
        where: { id: listingId },
        include: { crop: true, unit: true, auction: true, ward: { include: { municipality: true } } },
      });
      if (listing.status !== 'ACTIVE') return 0;
      const price = listing.pricePerUnit ?? listing.auction?.startPrice ?? null;
      const alerts = await this.prisma.cropAlert.findMany({
        where: {
          cropId: listing.cropId,
          userId: { not: listing.farmerId },
          user: { isSuspended: false },
          AND: [
            { OR: [{ municipalityId: null }, { municipalityId: listing.ward.municipalityId }] },
            price ? { OR: [{ maxPrice: null }, { maxPrice: { gte: price } }] } : { maxPrice: null },
          ],
        },
        select: { userId: true },
      });
      const userIds = [...new Set(alerts.map((a) => a.userId))];
      if (userIds.length === 0) return 0;
      const data = {
        listingId: listing.id,
        crop: { nameEn: listing.crop.nameEn, nameNe: listing.crop.nameNe },
        unit: { nameEn: listing.unit.nameEn, nameNe: listing.unit.nameNe },
        price: price?.toString() ?? null,
        saleMode: listing.saleMode,
        village: listing.village,
        municipality: { nameEn: listing.ward.municipality.nameEn, nameNe: listing.ward.municipality.nameNe },
      };
      await this.prisma.notification.createMany({
        data: userIds.map((userId) => ({ userId, type: 'LISTING_MATCH', channel: 'IN_APP' as const, data })),
      });
      return userIds.length;
    } catch (err) {
      this.log.error(`Alert matching failed for listing ${listingId}`, err as Error);
      return 0;
    }
  }
}
