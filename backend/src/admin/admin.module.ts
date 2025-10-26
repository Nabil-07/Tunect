import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminReportsController } from './admin-reports.controller';
import { PayoutsController } from './payouts.controller';

import { TokenLedgerService } from '../tokens/token-ledger.service';

@Module({
  controllers: [AdminController,AdminReportsController,PayoutsController],
  providers: [AdminService, TokenLedgerService],
})
export class AdminModule {}
