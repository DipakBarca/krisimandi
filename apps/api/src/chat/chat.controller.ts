import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UploadedFile } from '@nestjs/common';
import { User } from '@prisma/client';
import { IsOptional, IsUUID } from 'class-validator';
import { CurrentUser } from '../auth/guards';
import { badRequest } from '../common/errors';
import { SendMessageDto } from '../deals/dto';
import { SingleUpload } from '../storage/upload';
import { ChatService } from './chat.service';

class MessagesQuery {
  @IsOptional()
  @IsUUID()
  after?: string;
}

@Controller()
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Post('listings/:id/conversation')
  start(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.chat.start(user, id);
  }

  @Get('me/conversations')
  list(@CurrentUser() user: User) {
    return this.chat.list(user);
  }

  @Get('me/conversations/unread')
  async unread(@CurrentUser() user: User) {
    return { unread: await this.chat.unreadTotal(user) };
  }

  @Get('conversations/:id')
  get(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.chat.get(user, id);
  }

  @Get('conversations/:id/messages')
  messages(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Query() q: MessagesQuery) {
    return this.chat.messages(user, id, q.after);
  }

  @Post('conversations/:id/messages')
  send(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SendMessageDto) {
    return this.chat.send(user, id, dto.body);
  }

  @Post('conversations/:id/photos')
  @SingleUpload()
  photo(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw badRequest('FILE_MISSING', 'Attach a photo.');
    return this.chat.sendPhoto(user, id, file);
  }
}
