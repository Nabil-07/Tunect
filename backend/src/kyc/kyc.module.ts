import { Module } from '@nestjs/common';
import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';
import { AuditModule } from '../audit/audit.module';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [AuditModule, UploadsModule],
  controllers: [KycController],
  providers: [KycService],
  exports: [KycService],
})
export class KycModule {}
