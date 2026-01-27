import { Module } from '@nestjs/common';
import { AdminTokensController } from './admin-tokens.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [AdminTokensController],
})
export class AdminTokensModule {}
