// src/prisma/prisma.service.ts
import { INestApplication, Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private static hookInstalled = false;
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
    
    // Enable query logging in development to track slow queries
    if (process.env.NODE_ENV !== 'production') {
      this.$on('query' as never, (e: any) => {
        if (e.duration > 200) { // Log queries taking >200ms
          this.logger.warn(`⚠️ Slow query (${e.duration}ms): ${e.query.substring(0, 100)}...`);
        } else if (e.duration > 100) { // Warn on queries >100ms
          this.logger.debug(`Moderate query (${e.duration}ms): ${e.query.substring(0, 100)}...`);
        }
      });
    }
  }

  /**
   * Ensure we close the Nest app when the process is about to exit.
   * Use Node's process 'beforeExit' to avoid TS typing issues on Prisma $on.
   * Call this ONCE from main.ts.
   */
  async enableShutdownHooks(app: INestApplication) {
    if (PrismaService.hookInstalled) return;
    PrismaService.hookInstalled = true;

    process.on('beforeExit', async () => {
      try {
        await app.close();
      } catch {
        // swallow
      }
    });
  }
}
