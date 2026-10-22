import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ListingsService } from './listings.service';

@Injectable()
export class ListingExpiryJob {
  private readonly logger = new Logger(ListingExpiryJob.name);

  constructor(private readonly listings: ListingsService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async run() {
    const count = await this.listings.expireOld();
    if (count) this.logger.log(`Expired ${count} listing(s)`);
  }
}
