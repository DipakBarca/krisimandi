import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { User } from '@prisma/client';
import { ArrayMaxSize, IsArray, IsOptional, IsUUID } from 'class-validator';
import { CurrentUser } from '../auth/guards';
import { CreateAlertDto } from '../listings/dto';
import { AlertsService } from './alerts.service';
import { NotificationsService } from './notifications.service';

class MarkReadDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  ids?: string[];
}

@Controller('me')
export class AlertsController {
  constructor(
    private readonly alerts: AlertsService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get('alerts')
  list(@CurrentUser() user: User) {
    return this.alerts.list(user);
  }

  @Post('alerts')
  create(@CurrentUser() user: User, @Body() dto: CreateAlertDto) {
    return this.alerts.create(user, dto);
  }

  @Delete('alerts/:id')
  @HttpCode(204)
  remove(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.alerts.remove(user, id);
  }

  @Get('notifications')
  notificationsList(@CurrentUser() user: User) {
    return this.notifications.list(user);
  }

  @Get('notifications/unread')
  async unread(@CurrentUser() user: User) {
    return { unread: await this.notifications.unreadCount(user) };
  }

  @Post('notifications/read')
  @HttpCode(200)
  markRead(@CurrentUser() user: User, @Body() dto: MarkReadDto) {
    return this.notifications.markRead(user, dto.ids);
  }
}
