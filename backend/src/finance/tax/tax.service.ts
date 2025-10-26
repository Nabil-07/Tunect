import { Injectable } from '@nestjs/common';
import { RecordTdsDepositDto } from './dto/record-tds-deposit.dto';
import { RecordGstItcDto } from './dto/record-gst-itc.dto';

@Injectable()
export class TaxService {
  async summary(month?: string) {
    // TODO: compute commission base, GST output, ITC, net GST payable
    return { month: month ?? 'current', commissionBase: 0, gstOutput: 0, itc: 0, netGst: 0 };
  }
  async tds(month?: string) {
    // TODO: sum TDS from token-ledger/payouts
    return { month: month ?? 'current', collected: 0, deposited: 0, thresholdHit: false };
  }
  async recordTdsDeposit(dto: RecordTdsDepositDto) {
    // TODO: persist challan
    return { ok: true, ...dto };
  }
  async recordGstItc(dto: RecordGstItcDto) {
    // TODO: persist ITC
    return { ok: true, ...dto };
  }
}
