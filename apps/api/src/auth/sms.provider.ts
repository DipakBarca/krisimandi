import { Injectable, Logger } from '@nestjs/common';
import { config } from '../config';

export abstract class SmsProvider {
  abstract send(phone: string, text: string): Promise<void>;
}

/** Development: prints the SMS to the server log instead of sending it. */
@Injectable()
export class ConsoleSmsProvider extends SmsProvider {
  private readonly logger = new Logger('SMS');

  async send(phone: string, text: string) {
    this.logger.log(`to ${phone}: ${text}`);
  }
}

/** Sparrow SMS (https://sparrowsms.com), a Nepali SMS gateway. */
@Injectable()
export class SparrowSmsProvider extends SmsProvider {
  async send(phone: string, text: string) {
    const body = new URLSearchParams({
      token: config.sms.sparrowToken ?? '',
      from: config.sms.sparrowFrom,
      to: phone.replace(/^\+977/, ''),
      text,
    });
    const res = await fetch('https://api.sparrowsms.com/v2/sms/', { method: 'POST', body });
    if (!res.ok) {
      throw new Error(`Sparrow SMS failed with ${res.status}: ${await res.text()}`);
    }
  }
}

export const smsProviderFactory = {
  provide: SmsProvider,
  useClass: config.sms.provider === 'sparrow' ? SparrowSmsProvider : ConsoleSmsProvider,
};
