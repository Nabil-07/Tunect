import { Injectable } from '@nestjs/common';
import { AdjustBalanceDto } from './dto/adjust-balance.dto';
import { HoldReleaseDto } from './dto/hold-release.dto';

@Injectable()
export class TutorBalancesService {
  async list(tutorId?: string, month?: string) {
    // TODO: derive from ledger+payouts or maintain TutorWallet table
    return { items: [], month: month ?? 'current' };
  }
  async adjust(tutorId: string, dto: AdjustBalanceDto) {
    // TODO: create adjustment entry; update balance; audit log
    return { tutorId, ...dto, done: true };
  }
  async hold(tutorId: string, dto: HoldReleaseDto) {
    // TODO: increase hold; reduce available; audit log
    return { tutorId, holdAdded: dto.amount };
  }
  async release(tutorId: string, dto: HoldReleaseDto) {
    // TODO: decrease hold; increase available; audit log
    return { tutorId, holdReleased: dto.amount };
  }
}
