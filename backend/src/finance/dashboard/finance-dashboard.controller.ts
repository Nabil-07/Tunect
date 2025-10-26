import { Controller, Get, Query } from '@nestjs/common';
import { FinanceDashboardService } from './finance-dashboard.service';

@Controller('admin/finance/dashboard')
export class FinanceDashboardController {
  constructor(private readonly svc: FinanceDashboardService) {}

  @Get()
  async monthRollup(@Query('month') month?: string) {
    // month = '2025-09' (YYYY-MM). Default: current month.
    return this.svc.getMonthRollup(month);
  }
}
