import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminReportsController } from './admin-reports.controller';
import { PayoutsController } from './payouts.controller';
import { TokenLedgerService } from '../tokens/token-ledger.service';
import { AuditModule } from '../audit/audit.module';
import { MetricsModule } from '../metrics/metrics.module';
import { PolicyConfigModule } from '../policy-config/policy-config.module';

@Module({
  imports: [AuditModule, MetricsModule, PolicyConfigModule],
  controllers: [AdminController, AdminReportsController, PayoutsController],
  providers: [AdminService, TokenLedgerService],
})
export class AdminModule {}
