import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  async health() {
    let dbStatus = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (err: any) {
      dbStatus = `unreachable: ${err?.message || 'query failed'}`;
      throw new ServiceUnavailableException({
        status: 'degraded',
        service: 'cashflow-backend',
        database: {
          provider: this.prisma.provider,
          status: dbStatus
        }
      });
    }

    return {
      status: 'ok',
      service: 'cashflow-backend',
      database: {
        provider: this.prisma.provider,
        status: dbStatus
      }
    };
  }
}
