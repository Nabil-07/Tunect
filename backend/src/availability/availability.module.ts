import { Module, forwardRef } from '@nestjs/common';
import { AvailabilityController } from './availability.controller';
import { AvailabilityService } from './availability.service';
import { AvailabilityTrackingService } from './availability-tracking.service';
import { PrismaModule } from '../prisma/prisma.module';
import { WaitlistModule } from '../waitlist/waitlist.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, forwardRef(() => WaitlistModule), NotificationsModule],
  controllers: [AvailabilityController],
  providers: [AvailabilityService, AvailabilityTrackingService],
  exports: [AvailabilityService, AvailabilityTrackingService],
})
export class AvailabilityModule {}
