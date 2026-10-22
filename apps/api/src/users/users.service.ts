import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { badRequest, notFound } from '../common/errors';
import { PrismaService } from '../prisma.service';
import { StorageService } from '../storage/storage.service';
import { UpdateMeDto } from './dto';

const wardInclude = { include: { municipality: { include: { district: true } } } } as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { ward: wardInclude },
    });
    const profileComplete = Boolean(user.fullName && user.roles.length && user.wardId);
    return { ...user, profileComplete };
  }

  async updateMe(user: User, dto: UpdateMeDto) {
    if (dto.wardId !== undefined) {
      const ward = await this.prisma.ward.findUnique({ where: { id: dto.wardId } });
      if (!ward) throw badRequest('WARD_INVALID', 'Choose a ward from the list.');
    }
    // Keep ADMIN if staff granted it; the user only controls Farmer and Buyer.
    const roles = dto.roles
      ? [...new Set([...dto.roles, ...user.roles.filter((r) => r === 'ADMIN')])]
      : undefined;
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        fullName: dto.fullName?.trim(),
        roles,
        preferredLang: dto.preferredLang,
        wardId: dto.wardId,
        village: dto.village?.trim(),
      },
    });
    return this.me(user.id);
  }

  async setPhoto(user: User, file: Express.Multer.File) {
    const url = await this.storage.saveImage(`users/${user.id}`, file);
    if (user.photoUrl) await this.storage.removePublic(user.photoUrl);
    await this.prisma.user.update({ where: { id: user.id }, data: { photoUrl: url } });
    return this.me(user.id);
  }

  /** What other users see: no phone number, location only to ward level. */
  async publicProfile(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { ward: wardInclude },
    });
    if (!user || user.isSuspended) throw notFound('USER_NOT_FOUND', 'User not found.');
    const [rating, activeListings] = await Promise.all([
      this.prisma.review.aggregate({ where: { revieweeId: id }, _avg: { rating: true }, _count: true }),
      this.prisma.listing.count({ where: { farmerId: id, status: 'ACTIVE' } }),
    ]);
    return {
      id: user.id,
      fullName: user.fullName,
      photoUrl: user.photoUrl,
      roles: user.roles.filter((r) => r !== 'ADMIN'),
      isVerified: user.isVerified,
      village: user.village,
      ward: user.ward,
      memberSince: user.createdAt,
      rating: { average: rating._avg.rating, count: rating._count },
      activeListings,
    };
  }
}
