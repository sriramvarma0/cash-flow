import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaD1 } from '@prisma/adapter-d1';
import { createD1HttpClient } from './d1-http-client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  public readonly provider: string;

  constructor() {
    const rawProvider = (process.env.DATABASE_PROVIDER || 'sqlite').trim().toLowerCase();

    if (rawProvider === 'd1') {
      const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || '';
      const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID || '';
      const apiToken = process.env.CLOUDFLARE_API_TOKEN || '';
      const httpUrl = process.env.CLOUDFLARE_D1_HTTP_URL;

      const missing: string[] = [];
      if (!httpUrl) {
        if (!accountId) missing.push('CLOUDFLARE_ACCOUNT_ID');
        if (!databaseId) missing.push('CLOUDFLARE_D1_DATABASE_ID');
        if (!apiToken) missing.push('CLOUDFLARE_API_TOKEN');
      }

      if (missing.length > 0) {
        throw new Error(
          `[PrismaService] FATAL: DATABASE_PROVIDER is set to "d1", but required configuration is missing: ${missing.join(
            ', '
          )}. Refusing to fall back silently to local SQLite in production.`
        );
      }

      const d1Client = createD1HttpClient({
        accountId,
        databaseId,
        apiToken,
        httpUrl
      });

      const adapter = new PrismaD1(d1Client as any);
      super({ adapter });
      this.provider = 'd1';
    } else if (rawProvider === 'sqlite') {
      const databaseUrl = process.env.DATABASE_URL || 'file:../../data/dev.db';
      super({
        datasources: {
          db: {
            url: databaseUrl
          }
        }
      });
      this.provider = 'sqlite';
    } else {
      throw new Error(
        `[PrismaService] Unsupported DATABASE_PROVIDER: "${rawProvider}". Allowed providers: "sqlite", "d1".`
      );
    }
  }

  async onModuleInit() {
    this.logger.log(`Initializing database connection with provider: [${this.provider}]`);
    if (this.provider === 'd1') {
      this.logger.log(
        `Connected to Cloudflare D1 (Database ID: ${process.env.CLOUDFLARE_D1_DATABASE_ID || 'custom-http'})`
      );
    } else {
      this.logger.log(`Connected to local SQLite (URL: ${process.env.DATABASE_URL || 'file:../../data/dev.db'})`);
    }
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
