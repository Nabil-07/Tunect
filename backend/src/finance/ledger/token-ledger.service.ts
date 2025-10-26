import { Injectable } from '@nestjs/common';
import { CorrectLedgerDto } from './dto/correct-ledger.dto';

type ListQuery = {
  status?: 'PENDING'|'PAID'|'REFUND';
  batchKey?: string; tutorId?: string; studentId?: string;
  from?: string; to?: string; page: number; limit: number;
};

@Injectable()
export class TokenLedgerService {
  async list(q: ListQuery) {
    // TODO: Prisma: tokenLedger.findMany({ where: {...}, skip, take, orderBy: { createdAt: 'desc' } })
    return { items: [], page: q.page, limit: q.limit, total: 0 };
  }

  async correct(id: string, dto: CorrectLedgerDto) {
    // TODO: Recompute gross/fee/gst/tutorGross/tds/tutorNet, write audit trail
    return { id, unitPrice: dto.unitPrice, corrected: true };
  }

  async reassignBatch(id: string, batchKey: string) {
    // TODO: update tokenLedger.set({ batchKey }) with audit trail
    return { id, batchKey, reassigned: true };
  }
}
