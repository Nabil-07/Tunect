import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { FinancePayoutsService } from './finance-payouts.service';
import { BatchPreviewDto } from './dto/batch-preview.dto';
import { BatchConfirmDto } from './dto/batch-confirm.dto';
import { ExecuteBatchDto } from './dto/execute-batch.dto';

@Controller('admin/finance/payouts')
export class FinancePayoutsController {
  constructor(private readonly svc: FinancePayoutsService) {}

  @Get('batches')
  async listBatches(@Query('month') month?: string) {
    return this.svc.listBatches(month);
  }

  @Get('batches/:batchKey')
  async getBatch(@Param('batchKey') batchKey: string) {
    return this.svc.getBatch(batchKey);
  }

  @Post('batches/preview')
  async preview(@Body() dto: BatchPreviewDto) {
    return this.svc.previewBatch(dto.batchKey, dto.tutorId);
  }

  @Post('batches/confirm')
  async confirm(@Body() dto: BatchConfirmDto) {
    return this.svc.confirmBatch(dto.batchKey, !!dto.dryRun);
  }

  @Post('batches/execute')
  async execute(@Body() dto: ExecuteBatchDto) {
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
