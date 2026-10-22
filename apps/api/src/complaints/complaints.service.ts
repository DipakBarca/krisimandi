import { Injectable } from '@nestjs/common';
import { ComplaintStatus, ComplaintTarget, User } from '@prisma/client';
import { NotificationsService } from '../alerts/notifications.service';
import { AuditService } from '../common/audit.service';
import { badRequest, notFound } from '../common/errors';
import { PrismaService } from '../prisma.service';
import { CreateComplaintDto, UpdateComplaintDto } from './dto';

/**
 * The two sides settle disputes themselves; a complaint brings in an admin, who follows it up
 * and closes it with a note the filer can read.
 */
@Injectable()
export class ComplaintsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  async create(user: User, dto: CreateComplaintDto) {
    await this.checkTarget(user, dto.targetType, dto.targetId);
    const open = await this.prisma.complaint.count({
      where: { filedById: user.id, targetType: dto.targetType, targetId: dto.targetId, status: { not: 'CLOSED' } },
    });
    if (open) throw badRequest('COMPLAINT_EXISTS', 'You already have an open complaint about this.');
    const complaint = await this.prisma.complaint.create({
      data: { filedById: user.id, targetType: dto.targetType, targetId: dto.targetId, reason: dto.reason.trim() },
    });
    const admins = await this.prisma.user.findMany({ where: { roles: { has: 'ADMIN' }, isSuspended: false }, select: { id: true } });
    await this.notifications.send(admins.map((a) => a.id), 'COMPLAINT_FILED', { complaintId: complaint.id, targetType: dto.targetType });
    return complaint;
  }

  async mine(user: User) {
    const items = await this.prisma.complaint.findMany({ where: { filedById: user.id }, orderBy: { createdAt: 'desc' } });
    return this.withTargets(items);
  }

  async list(status?: ComplaintStatus) {
    const items = await this.prisma.complaint.findMany({
      where: status ? { status } : { status: { not: 'CLOSED' } },
      include: {
        filedBy: { select: { id: true, fullName: true, phone: true } },
        handledBy: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    return this.withTargets(items);
  }

  async update(admin: User, id: string, dto: UpdateComplaintDto) {
    const complaint = await this.prisma.complaint.findUnique({ where: { id } });
    if (!complaint) throw notFound('COMPLAINT_NOT_FOUND', 'Complaint not found.');
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.complaint.update({
        where: { id },
        data: {
          status: dto.status,
          ...(dto.adminNotes !== undefined ? { adminNotes: dto.adminNotes.trim() || null } : {}),
          handledById: admin.id,
          closedAt: dto.status === 'CLOSED' ? new Date() : null,
        },
      });
      await this.audit.log(
        admin.id,
        'COMPLAINT_UPDATED',
        'complaint',
        id,
        { before: { status: complaint.status, adminNotes: complaint.adminNotes }, after: { status: row.status, adminNotes: row.adminNotes } },
        tx,
      );
      await this.notifications.send(complaint.filedById, 'COMPLAINT_UPDATED', { complaintId: id, status: row.status }, tx);
      return row;
    });
    return updated;
  }

  /** The thing being complained about must exist and be something the filer has dealt with or can see. */
  private async checkTarget(user: User, type: ComplaintTarget, id: string) {
    const missing = () => notFound('COMPLAINT_TARGET_NOT_FOUND', 'What you are reporting was not found.');
    if (type === 'USER') {
      if (id === user.id) throw badRequest('COMPLAINT_SELF', 'You cannot report yourself.');
      if (!(await this.prisma.user.count({ where: { id } }))) throw missing();
    } else if (type === 'LISTING') {
      const listing = await this.prisma.listing.findUnique({ where: { id } });
      if (!listing || listing.status === 'DRAFT') throw missing();
      if (listing.farmerId === user.id) throw badRequest('COMPLAINT_SELF', 'You cannot report your own listing.');
    } else {
      const order = await this.prisma.order.findUnique({ where: { id } });
      if (!order || (order.buyerId !== user.id && order.farmerId !== user.id)) throw missing();
    }
  }

  /** Adds a short description of each target so people can see what a complaint is about. */
  private async withTargets<T extends { targetType: ComplaintTarget; targetId: string }>(items: T[]) {
    const ids = (type: ComplaintTarget) => items.filter((c) => c.targetType === type).map((c) => c.targetId);
    const crop = { select: { nameEn: true, nameNe: true } };
    const [users, listings, orders] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: ids('USER') } }, select: { id: true, fullName: true } }),
      this.prisma.listing.findMany({
        where: { id: { in: ids('LISTING') } },
        select: { id: true, crop, farmer: { select: { id: true, fullName: true } } },
      }),
      this.prisma.order.findMany({
        where: { id: { in: ids('ORDER') } },
        select: {
          id: true,
          listing: { select: { crop } },
          buyer: { select: { id: true, fullName: true } },
          farmer: { select: { id: true, fullName: true } },
        },
      }),
    ]);
    const byId = new Map<string, unknown>([...users, ...listings, ...orders].map((t) => [t.id, t]));
    return items.map((c) => ({ ...c, target: byId.get(c.targetId) ?? null }));
  }
}
