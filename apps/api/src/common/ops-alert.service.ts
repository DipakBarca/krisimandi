import { Injectable, Logger } from '@nestjs/common';
import { config } from '../config';

const QUIET_MS = 5 * 60 * 1000;

/**
 * Tells the team when something breaks in production: server errors, failed SMS and failed jobs.
 * Posts to ALERT_WEBHOOK_URL (a Slack or Discord incoming webhook). The same alert is sent at most
 * once every 5 minutes so a broken page does not flood the channel.
 */
@Injectable()
export class OpsAlertService {
  private readonly log = new Logger('OpsAlert');
  private readonly lastSent = new Map<string, number>();

  async notify(key: string, text: string) {
    this.log.error(text);
    const url = config.alertWebhookUrl;
    if (!url) return;
    const now = Date.now();
    if (now - (this.lastSent.get(key) ?? 0) < QUIET_MS) return;
    this.lastSent.set(key, now);
    const message = `[KrisiMandi${config.siteName ? ` ${config.siteName}` : ''}] ${text}`.slice(0, 1900);
    try {
      // Slack reads `text`, Discord reads `content`.
      await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: message, content: message }),
        signal: AbortSignal.timeout(5000),
      });
    } catch (err) {
      this.log.warn(`Alert webhook failed: ${(err as Error).message}`);
    }
  }
}
