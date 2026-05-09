import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentsPublicController } from './payments.public.controller';
import { PaymentsPublicService } from './payments-public.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { OffersModule } from '../../offers/offers.module';

@Module({
  imports: [PrismaModule, ConfigModule, NotificationsModule, OffersModule],
  controllers: [PaymentsController, PaymentsPublicController],
  providers: [PaymentsService, PaymentsPublicService],
  exports: [PaymentsService, PaymentsPublicService],
})
export class PaymentsModule {}
