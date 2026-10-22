import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

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
