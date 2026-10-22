import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

type Snapshot = Prisma.InputJsonObject;

/** Writes the audit trail admins read: who changed what, and the before and after values. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(
    actorId: string | null,
    action: string,
    entity: string,
    entityId: string,
    change: { before?: Snapshot; after?: Snapshot } = {},
    db: Prisma.TransactionClient = this.prisma,
  ) {
    await db.auditLog.create({ data: { actorId, action, entity, entityId, before: change.before, after: change.after } });
  }
}
