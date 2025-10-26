import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { FinancePayoutsService } from './finance-payouts.service';

// Runs at 02:00 IST every day; the service decides if today is 1/8/14/21
@Injectable()
export class PayoutsScheduler {
  constructor(private readonly svc: FinancePayoutsService) {}

  @Cron('0 30 2 * * *', { timeZone: 'Asia/Kolkata' })
  async runDaily() {
    // If today ∈ {1,8,14,21} → preview → confirm → execute (idempotent)
    await this.svc.runScheduledIfDue();
  }
}
