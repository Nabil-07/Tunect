import { Controller, Get, Header, Logger, Query, Req, Res, UseGuards } from '@nestjs/common';
import { FinanceDashboardService } from './finance-dashboard.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { DirectorGuard } from '../../auth/director.guard';
import { Response } from 'express';

@Controller('admin/finance/dashboard')
@UseGuards(JwtAuthGuard, DirectorGuard)
export class FinanceDashboardController {
  private readonly logger = new Logger(FinanceDashboardController.name);

  constructor(private readonly svc: FinanceDashboardService) {}

  @Get()
  async getBalanceSheet(
    @Query('period') period: 'month' | 'quarter' | 'half' | 'year' = 'month',
    @Query('asOf') asOf?: string,
    @Req() req?: any,
  ) {
    this.logger.log(`Balance sheet viewed by ${req?.user?.id ?? 'unknown'} period=${period} asOf=${asOf ?? 'now'}`);
    return this.svc.getBalanceSheet(period, asOf);
  }

  @Get('export')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="balance-sheet.csv"')
  async exportCsv(
    @Query('period') period: 'month' | 'quarter' | 'half' | 'year' = 'month',
    @Query('asOf') asOf: string | undefined,
    @Req() req: any,
    @Res() res: Response,
  ) {
    this.logger.log(`Balance sheet CSV export by ${req?.user?.id ?? 'unknown'} period=${period} asOf=${asOf ?? 'now'}`);
    const csv = await this.svc.exportCsv(period, asOf);
    res.send(csv);
  }
}
