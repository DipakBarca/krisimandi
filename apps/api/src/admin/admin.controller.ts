import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { User } from '@prisma/client';
import { CurrentUser, Roles } from '../auth/guards';
import { AdminService } from './admin.service';
import { AuditQuery, CreateCropDto, ReasonDto, UpdateCropDto, UsersQuery } from './dto';

/** Admin tools. Verification documents and complaints have their own controllers. */
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('stats')
  stats() {
    return this.admin.stats();
  }

  @Get('users')
  users(@Query() q: UsersQuery) {
    return this.admin.users(q.q);
  }

  @Post('users/:id/suspend')
  @HttpCode(200)
  suspend(@CurrentUser() admin: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.admin.suspend(admin, id, dto.reason);
  }

  @Post('users/:id/unsuspend')
  @HttpCode(200)
  unsuspend(@CurrentUser() admin: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.admin.unsuspend(admin, id);
  }

  @Post('listings/:id/remove')
  @HttpCode(200)
  removeListing(@CurrentUser() admin: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.admin.removeListing(admin, id, dto.reason);
  }

  @Post('crops')
  createCrop(@CurrentUser() admin: User, @Body() dto: CreateCropDto) {
    return this.admin.createCrop(admin, dto);
  }

  @Patch('crops/:id')
  updateCrop(@CurrentUser() admin: User, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCropDto) {
    return this.admin.updateCrop(admin, id, dto);
  }

  @Get('audit')
  audit(@Query() q: AuditQuery) {
    return this.admin.auditLog(q);
  }
}
