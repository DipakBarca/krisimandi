import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { Request } from 'express';
import { OpsAlertService } from './ops-alert.service';

/** Answers as Nest normally does, and raises an alert for anything that is not a planned error. */
@Catch()
export class ErrorAlertFilter extends BaseExceptionFilter {
  constructor(private readonly alerts: OpsAlertService) {
    super();
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const isPlanned = exception instanceof HttpException && exception.getStatus() < 500;
    if (!isPlanned) {
      const req = host.switchToHttp().getRequest<Request>();
      const err = exception instanceof Error ? exception : new Error(String(exception));
      const where = req ? `${req.method} ${req.route?.path ?? req.path}` : 'unknown request';
      void this.alerts.notify(`500:${where}:${err.message}`, `Server error on ${where}: ${err.message}\n${err.stack?.split('\n').slice(1, 4).join('\n') ?? ''}`);
    }
    super.catch(exception, host);
  }
}
