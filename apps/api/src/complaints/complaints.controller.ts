import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { User } from '@prisma/client';
import { CurrentUser, Roles } from '../auth/guards';
import { ComplaintsService } from './complaints.service';
import { ComplaintsQuery, CreateComplaintDto, UpdateComplaintDto } from './dto';

@Controller()
export class ComplaintsController {
  constructor(private readonly complaints: ComplaintsService) {}

  @Post('complaints')
  create(@CurrentUser() user: User, @Body() dto: CreateComplaintDto) {
    return this.complaints.create(user, dto);
  }

  @Get('me/complaints')
  mine(@CurrentUser() user: User) {
    return this.complaints.mine(user);
  }

  @Roles('ADMIN')
  @Get('admin/complaints')
  list(@Query() q: ComplaintsQuery) {
    return this.complaints.list(q.status);
  }

  @Roles('ADMIN')
  @Patch('admin/complaints/:id')
  update(@CurrentUser() admin: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateComplaintDto) {
    return this.complaints.update(admin, id, dto);
  }
}
