import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { config } from './config';

/** Shared by main.ts and the tests so both run the same app. */
export function configureApp(app: NestExpressApplication) {
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useStaticAssets(join(config.uploadDir, 'public'), { prefix: '/uploads/' });
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? true });
  // Behind the Caddy proxy in production; this keeps client IPs and https right.
  app.set('trust proxy', 1);
  app.enableShutdownHooks();
  return app;
}
