import { Body, Controller, Get, Logger, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { FinancePayoutsService } from './finance-payouts.service';
import { BatchPreviewDto } from './dto/batch-preview.dto';
import { BatchConfirmDto } from './dto/batch-confirm.dto';
import { ExecuteBatchDto } from './dto/execute-batch.dto';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { DirectorGuard } from '../../auth/director.guard';

@Controller('admin/finance/payouts')
@UseGuards(JwtAuthGuard, DirectorGuard)
export class FinancePayoutsController {
  private readonly logger = new Logger(FinancePayoutsController.name);

  constructor(private readonly svc: FinancePayoutsService) {}

  @Get('batches')
  async listBatches(@Query('month') month?: string, @Req() req?: any) {
    this.logger.log(`Payout batches listed by ${req?.user?.id ?? 'unknown'}`);
    return this.svc.listBatches(month);
  }

  @Get('batches/:batchKey')
  async getBatch(@Param('batchKey') batchKey: string, @Req() req?: any) {
    this.logger.log(`Payout batch ${batchKey} viewed by ${req?.user?.id ?? 'unknown'}`);
    return this.svc.getBatch(batchKey);
  }

  @Post('batches/preview')
  async preview(@Body() dto: BatchPreviewDto, @Req() req?: any) {
    this.logger.log(`Payout preview ${dto.batchKey} requested by ${req?.user?.id ?? 'unknown'}`);
    return this.svc.previewBatch(dto.batchKey, dto.tutorId);
  }

  @Post('batches/confirm')
  async confirm(@Body() dto: BatchConfirmDto, @Req() req?: any) {
    this.logger.log(`Payout confirm ${dto.batchKey} requested by ${req?.user?.id ?? 'unknown'}`);
    return this.svc.confirmBatch(dto.batchKey, !!dto.dryRun);
  }

  @Post('batches/execute')
  async execute(@Body() dto: ExecuteBatchDto, @Req() req?: any) {
    this.logger.log(`Payout execute ${dto.batchKey} requested by ${req?.user?.id ?? 'unknown'}`);
    return this.svc.executeBatch(dto.batchKey);
  }
}

// Payout webhooks (provider → status updates)
@Controller('webhooks/payouts')
export class PayoutWebhooksController {
  constructor(private readonly svc: FinancePayoutsService) {}
  @Post(':provider')
  async handle(@Param('provider') provider: string, @Body() payload: any) {
    // TODO: verify signature, then:
    return this.svc.handleWebhook(provider, payload);
  }
}
