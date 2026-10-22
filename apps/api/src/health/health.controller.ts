import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../auth/guards';
import { PrismaService } from '../prisma.service';

/** For uptime monitors and the container health check: is the API up and can it reach the database? */
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({ ok: false, database: 'unreachable' });
    }
    return { ok: true, time: new Date().toISOString() };
  }
}
