import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OpsAlertService } from '../common/ops-alert.service';
import { ListingsService } from './listings.service';

@Injectable()
export class ListingExpiryJob {
  private readonly logger = new Logger(ListingExpiryJob.name);

  constructor(
    private readonly listings: ListingsService,
    private readonly alerts: OpsAlertService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async run() {
    try {
      const count = await this.listings.expireOld();
      if (count) this.logger.log(`Expired ${count} listing(s)`);
    } catch (err) {
      await this.alerts.notify('job:expiry', `Listing expiry job failed: ${(err as Error).message}`);
    }
  }
}
