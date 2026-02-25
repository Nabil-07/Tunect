import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminReportsController } from './admin-reports.controller';
import { PayoutsController } from './payouts.controller';
import { ExpensesController } from './expenses.controller';
import { TokenLedgerService } from '../tokens/token-ledger.service';
import { AuditModule } from '../audit/audit.module';
import { MetricsModule } from '../metrics/metrics.module';
import { PolicyConfigModule } from '../policy-config/policy-config.module';
import { CommonModule } from '../common/common.module';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [AuditModule, MetricsModule, PolicyConfigModule, CommonModule, UploadsModule],
  controllers: [AdminController, AdminReportsController, PayoutsController, ExpensesController],
  providers: [AdminService, TokenLedgerService],
})
export class AdminModule {}
