import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { TaxService } from './tax.service';
import { RecordTdsDepositDto } from './dto/record-tds-deposit.dto';
import { RecordGstItcDto } from './dto/record-gst-itc.dto';

@Controller('admin/finance/tax')
export class TaxController {
  constructor(private readonly svc: TaxService) {}

  @Get('summary')
  async summary(@Query('month') month?: string) {
    return this.svc.summary(month);
  }

  @Get('tds')
  async tds(@Query('month') month?: string) {
    return this.svc.tds(month);
  }

  @Post('tds/deposit')
  async recordTds(@Body() dto: RecordTdsDepositDto) {
    return this.svc.recordTdsDeposit(dto);
  }

  @Post('gst/itc')
  async recordItc(@Body() dto: RecordGstItcDto) {
    return this.svc.recordGstItc(dto);
  }
}
