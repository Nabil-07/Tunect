import { Module } from '@nestjs/common';
import { FinancePayoutsController } from './finance-payouts.controller';
import { FinancePayoutsService } from './finance-payouts.service';
import { PayoutsScheduler } from './payouts.scheduler';

@Module({
  controllers: [FinancePayoutsController],
  providers: [FinancePayoutsService, PayoutsScheduler],
  exports: [FinancePayoutsService],
})
export class FinancePayoutsModule {}
