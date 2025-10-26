import { Module } from '@nestjs/common';
import { TokenLedgerController } from './token-ledger.controller';
import { TokenLedgerService } from './token-ledger.service';

@Module({
  controllers: [TokenLedgerController],
  providers: [TokenLedgerService],
  exports: [TokenLedgerService],
})
export class TokenLedgerModule {}
