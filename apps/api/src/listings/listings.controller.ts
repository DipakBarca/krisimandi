import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
} from '@nestjs/common';
import { User } from '@prisma/client';
import { CurrentUser, Public, Roles } from '../auth/guards';
import { badRequest } from '../common/errors';
import { SingleUpload } from '../storage/upload';
import { CreateListingDto, ListListingsQuery, RelistDto, UpdateListingDto } from './dto';
import { ListingsService } from './listings.service';

@Controller()
export class ListingsController {
  constructor(private readonly listings: ListingsService) {}

  @Public()
  @Get('listings')
  list(@Query() q: ListListingsQuery) {
    return this.listings.list(q);
  }

  @Public()
  @Get('listings/:id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user?: User) {
    return this.listings.get(id, user);
  }

  @Roles('FARMER')
  @Get('me/listings')
  mine(@CurrentUser() user: User) {
    return this.listings.mine(user);
  }

  @Roles('FARMER')
  @Post('listings')
  create(@CurrentUser() user: User, @Body() dto: CreateListingDto) {
    return this.listings.create(user, dto);
  }

  @Patch('listings/:id')
  update(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateListingDto) {
    return this.listings.update(user, id, dto);
  }

  @Post('listings/:id/pause')
  @HttpCode(200)
  pause(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.listings.setStatus(user, id, 'pause');
  }

  @Post('listings/:id/resume')
  @HttpCode(200)
  resume(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.listings.setStatus(user, id, 'resume');
  }

  @Post('listings/:id/sold')
  @HttpCode(200)
  sold(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.listings.setStatus(user, id, 'sold');
  }

  @Delete('listings/:id')
  @HttpCode(204)
  async remove(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    await this.listings.setStatus(user, id, 'remove');
  }

  @Post('listings/:id/relist')
  @HttpCode(200)
  relist(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RelistDto) {
    return this.listings.relist(user, id, dto);
  }

  @Post('listings/:id/photos')
  @SingleUpload()
  addPhoto(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw badRequest('FILE_MISSING', 'Attach a photo.');
    return this.listings.addPhoto(user, id, file);
  }

  @Delete('listings/:id/photos/:photoId')
  removePhoto(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('photoId', ParseUUIDPipe) photoId: string,
  ) {
    return this.listings.removePhoto(user, id, photoId);
  }
}
