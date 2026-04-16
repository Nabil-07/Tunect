import { Module } from '@nestjs/common';
import { FinancePayoutsController } from './finance-payouts.controller';
import { FinancePayoutsService } from './finance-payouts.service';
import { PayoutsScheduler } from './payouts.scheduler';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsModule } from '../../notifications/notifications.module';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [FinancePayoutsController],
  providers: [FinancePayoutsService, PayoutsScheduler],
  exports: [FinancePayoutsService],
})
export class FinancePayoutsModule {}
