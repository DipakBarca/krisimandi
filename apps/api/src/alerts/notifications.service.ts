import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Adds an in-app notice for each user. `data` should carry what the notice text needs. */
  async send(userIds: string | string[], type: string, data: Prisma.InputJsonObject, db: Prisma.TransactionClient = this.prisma) {
    const ids = [...new Set(Array.isArray(userIds) ? userIds : [userIds])];
    if (ids.length === 0) return;
    await db.notification.createMany({ data: ids.map((userId) => ({ userId, type, data, channel: 'IN_APP' as const })) });
  }

  async list(user: User) {
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId: user.id, channel: 'IN_APP' },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.unreadCount(user),
    ]);
    return { items, unread };
  }

  unreadCount(user: User) {
    return this.prisma.notification.count({ where: { userId: user.id, channel: 'IN_APP', readAt: null } });
  }

  /** Marks the given notifications read, or all of them when no ids are sent. */
  async markRead(user: User, ids?: string[]) {
    await this.prisma.notification.updateMany({
      where: { userId: user.id, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
      data: { readAt: new Date() },
    });
    return { unread: await this.unreadCount(user) };
  }
}
