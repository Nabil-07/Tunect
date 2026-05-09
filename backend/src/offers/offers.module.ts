import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PricingEngineService } from './pricing-engine.service';
import { AdminOffersController } from './admin-offers.controller';
import { PublicOffersController } from './public-offers.controller';

@Module({
  imports: [PrismaModule],
  controllers: [AdminOffersController, PublicOffersController],
  providers: [PricingEngineService],
  exports: [PricingEngineService],
})
export class OffersModule {}
