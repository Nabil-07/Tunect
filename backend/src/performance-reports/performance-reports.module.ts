import { Module } from '@nestjs/common';
import { PerformanceReportsController } from './performance-reports.controller';
import { PerformanceReportsService } from './performance-reports.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PerformanceReportsController],
  providers: [PerformanceReportsService],
  exports: [PerformanceReportsService],
})
export class PerformanceReportsModule {}
