import { Module } from '@nestjs/common';
import { HealthService } from './health.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
