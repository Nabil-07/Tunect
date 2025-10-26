import { Controller, Get, Param, Patch, Body, Query } from '@nestjs/common';
import { TokenLedgerService } from './token-ledger.service';
import { CorrectLedgerDto } from './dto/correct-ledger.dto';
import { ReassignBatchDto } from './dto/reassign-batch.dto';

@Controller('admin/finance/token-ledger')
export class TokenLedgerController {
  constructor(private readonly svc: TokenLedgerService) {}

  @Get()
  async list(
    @Query('status') status?: 'PENDING'|'PAID'|'REFUND',
    @Query('batchKey') batchKey?: string,
    @Query('tutorId') tutorId?: string,
    @Query('studentId') studentId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '50',
  ) {
    return this.svc.list({ status, batchKey, tutorId, studentId, from, to, page: +page, limit: +limit });
  }

  @Patch(':id/correct')
  async correct(@Param('id') id: string, @Body() dto: CorrectLedgerDto) {
    return this.svc.correct(id, dto);
  }

  @Patch(':id/reassign-batch')
  async reassignBatch(@Param('id') id: string, @Body() dto: ReassignBatchDto) {
    return this.svc.reassignBatch(id, dto.batchKey);
  }
}
