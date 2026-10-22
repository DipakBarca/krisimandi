import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { AlertsController } from './alerts/alerts.controller';
import { AlertsService } from './alerts/alerts.service';
import { NotificationsService } from './alerts/notifications.service';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { AuthGuard } from './auth/guards';
import { OtpService } from './auth/otp.service';
import { smsProviderFactory } from './auth/sms.provider';
import { ChatController } from './chat/chat.controller';
import { ChatService } from './chat/chat.service';
import { AuctionsService } from './deals/auctions.service';
import { DealsController } from './deals/deals.controller';
import { DealsJob } from './deals/deals.job';
import { OffersService } from './deals/offers.service';
import { OrdersService } from './deals/orders.service';
import { CatalogueController } from './catalogue/catalogue.controller';
import { ListingExpiryJob } from './listings/expiry.job';
import { ListingsController } from './listings/listings.controller';
import { ListingsService } from './listings/listings.service';
import { PrismaService } from './prisma.service';
import { StorageService } from './storage/storage.service';
import { UsersController } from './users/users.controller';
import { UsersService } from './users/users.service';
import { VerificationController } from './verification/verification.controller';

@Module({
  imports: [JwtModule.register({}), ScheduleModule.forRoot()],
  controllers: [
    AuthController,
    UsersController,
    VerificationController,
    CatalogueController,
    ListingsController,
    AlertsController,
    DealsController,
    ChatController,
  ],
  providers: [
    PrismaService,
    StorageService,
    smsProviderFactory,
    OtpService,
    AuthService,
    UsersService,
    ListingsService,
    AlertsService,
    NotificationsService,
    OffersService,
    AuctionsService,
    OrdersService,
    DealsJob,
    ChatService,
    ListingExpiryJob,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
