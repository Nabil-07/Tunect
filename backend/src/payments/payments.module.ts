import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PrismaService } from '../prisma/prisma.service';
import { TokenLedgerService } from '../tokens/token-ledger.service';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, PrismaService, TokenLedgerService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
