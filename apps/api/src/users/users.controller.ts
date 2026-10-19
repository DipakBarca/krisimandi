import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UploadedFile } from '@nestjs/common';
import { User } from '@prisma/client';
import { CurrentUser, Public } from '../auth/guards';
import { badRequest } from '../common/errors';
import { SingleUpload } from '../storage/upload';
import { UpdateMeDto } from './dto';
import { UsersService } from './users.service';

@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: User) {
    return this.users.me(user.id);
  }

  @Patch('me')
  update(@CurrentUser() user: User, @Body() dto: UpdateMeDto) {
    return this.users.updateMe(user, dto);
  }

  @Post('me/photo')
  @SingleUpload()
  photo(@CurrentUser() user: User, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw badRequest('FILE_MISSING', 'Attach a photo.');
    return this.users.setPhoto(user, file);
  }

  @Public()
  @Get('users/:id')
  profile(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.publicProfile(id);
  }
}
