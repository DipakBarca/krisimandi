import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OpsAlertService } from '../common/ops-alert.service';
import { AuctionsService } from './auctions.service';
import { OffersService } from './offers.service';

@Injectable()
export class DealsJob {
  private readonly logger = new Logger(DealsJob.name);

  constructor(
    private readonly auctions: AuctionsService,
    private readonly offers: OffersService,
    private readonly alerts: OpsAlertService,
  ) {}

  /** Auctions close on the minute their time runs out; stale offers expire on the same beat. */
  @Cron(CronExpression.EVERY_MINUTE)
  async run() {
    try {
      const closed = await this.auctions.closeDue();
      const expired = await this.offers.expireOld();
      if (closed || expired) this.logger.log(`Processed ${closed} auction(s), expired ${expired} offer(s)`);
    } catch (err) {
      await this.alerts.notify('job:deals', `Auction and offer job failed: ${(err as Error).message}`);
    }
  }
}
