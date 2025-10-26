import { Module } from '@nestjs/common';
import { TutorBalancesController } from './tutor-balances.controller';
import { TutorBalancesService } from './tutor-balances.service';

@Module({
  controllers: [TutorBalancesController],
  providers: [TutorBalancesService],
  exports: [TutorBalancesService],
})
export class TutorBalancesModule {}
