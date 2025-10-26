import { Module } from '@nestjs/common';
import { AdminTokensService } from './admin-tokens.service';
import { AdminTokensController } from './admin-tokens.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [AdminTokensController],
  providers: [AdminTokensService, PrismaService],
})
export class AdminTokensModule {}
