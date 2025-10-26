// src/prisma/prisma.service.ts
import { INestApplication, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private static hookInstalled = false;

  async onModuleInit() {
    await this.$connect();
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
