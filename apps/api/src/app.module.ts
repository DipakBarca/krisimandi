import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { AuthGuard } from './auth/guards';
import { OtpService } from './auth/otp.service';
import { smsProviderFactory } from './auth/sms.provider';
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
  ],
  providers: [
    PrismaService,
    StorageService,
    smsProviderFactory,
    OtpService,
    AuthService,
    UsersService,
    ListingsService,
    ListingExpiryJob,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
