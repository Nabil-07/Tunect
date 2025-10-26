import { BadRequestException, Injectable } from '@nestjs/common';
import type { Express } from 'express';
import { ReconAdjustmentDto } from './dto/recon-adjustment.dto';

@Injectable()
export class ReconService {
  async daily(date?: string) {
    // TODO: compute opening, inflows, outflows, expected closing, actual, variance
    return {
      date: date ?? 'today',
      opening: 0,
      inflows: 0,
      outflows: 0,
      expected: 0,
      actual: 0,
      variance: 0,
    };
  }

  private ensureSupportedFile(file: Express.Multer.File, label: 'bank' | 'gateway') {
    const name = (file.originalname || '').toLowerCase();
    const ok = name.endsWith('.csv') || name.endsWith('.xls') || name.endsWith('.xlsx');
    if (!ok) {
      throw new BadRequestException(
        `Unsupported ${label} file "${file.originalname}". Please upload .csv, .xls, or .xlsx.`,
      );
    }
  }

  async parseBank(file: Express.Multer.File) {
    this.ensureSupportedFile(file, 'bank');
    // TODO:
    // - detect CSV/XLS/XLSX and parse
    // - map to your BankStatement model
    // - insert/upsert rows and return summary
    return { ok: true, rows: 0, filename: file.originalname };
  }

  async parseGateway(file: Express.Multer.File) {
    this.ensureSupportedFile(file, 'gateway');
    // TODO:
    // - detect provider (Razorpay/Stripe) by filename/columns
    // - parse and map to your Gateway report model(s)
    // - insert/upsert rows and return summary
    return { ok: true, rows: 0, filename: file.originalname };
  }

  async adjustment(dto: ReconAdjustmentDto) {
    // TODO: persist adjustment entry; optionally return updated daily snapshot
    return { ok: true, ...dto };
  }
}
