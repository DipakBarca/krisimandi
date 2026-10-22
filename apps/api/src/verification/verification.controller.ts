import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
} from '@nestjs/common';
import { DocType, User, VerificationStatus } from '@prisma/client';
import { IsEnum, IsIn, IsOptional } from 'class-validator';
import type { Response } from 'express';
import { CurrentUser, Roles } from '../auth/guards';
import { badRequest, notFound } from '../common/errors';
import { PrismaService } from '../prisma.service';
import { StorageService } from '../storage/storage.service';
import { SingleUpload } from '../storage/upload';

class UploadDocDto {
  @IsEnum(DocType)
  docType: DocType;
}

class ListDocsQuery {
  @IsOptional()
  @IsEnum(VerificationStatus)
  status?: VerificationStatus;
}

class ReviewDocDto {
  @IsIn(['APPROVED', 'REJECTED'])
  status: 'APPROVED' | 'REJECTED';
}

@Controller()
export class VerificationController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @Post('me/verification-docs')
  @SingleUpload()
  async upload(
    @CurrentUser() user: User,
    @Body() dto: UploadDocDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw badRequest('FILE_MISSING', 'Attach a photo or PDF of the document.');
    const key = await this.storage.savePrivate(`verification/${user.id}`, file);
    const doc = await this.prisma.verificationDoc.create({
      data: { userId: user.id, docType: dto.docType, fileUrl: key },
    });
    return { id: doc.id, docType: doc.docType, status: doc.status, createdAt: doc.createdAt };
  }

  @Get('me/verification-docs')
  mine(@CurrentUser() user: User) {
    return this.prisma.verificationDoc.findMany({
      where: { userId: user.id },
      select: { id: true, docType: true, status: true, createdAt: true, reviewedAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Roles('ADMIN')
  @Get('admin/verification-docs')
  list(@Query() q: ListDocsQuery) {
    return this.prisma.verificationDoc.findMany({
      where: { status: q.status ?? 'PENDING' },
      include: { user: { select: { id: true, fullName: true, phone: true, village: true } } },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
  }

  @Roles('ADMIN')
  @Get('admin/verification-docs/:id/file')
  async file(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const doc = await this.prisma.verificationDoc.findUnique({ where: { id } });
    if (!doc) throw notFound('DOC_NOT_FOUND', 'Document not found.');
    res.type(doc.fileUrl.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');
    res.send(await this.storage.readPrivate(doc.fileUrl));
  }

  @Roles('ADMIN')
  @Patch('admin/verification-docs/:id')
  async review(
    @CurrentUser() admin: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewDocDto,
  ) {
    const doc = await this.prisma.verificationDoc.findUnique({ where: { id } });
    if (!doc) throw notFound('DOC_NOT_FOUND', 'Document not found.');
    const [updated] = await this.prisma.$transaction([
      this.prisma.verificationDoc.update({
        where: { id },
        data: { status: dto.status, reviewedBy: admin.id, reviewedAt: new Date() },
      }),
      ...(dto.status === 'APPROVED'
        ? [this.prisma.user.update({ where: { id: doc.userId }, data: { isVerified: true } })]
        : []),
      this.prisma.auditLog.create({
        data: {
          actorId: admin.id,
          action: `VERIFICATION_${dto.status}`,
          entity: 'verification_doc',
          entityId: id,
        },
      }),
    ]);
    return updated;
  }
}
