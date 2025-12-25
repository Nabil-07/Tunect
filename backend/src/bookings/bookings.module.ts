import { Module } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { BookingsController } from './bookings.controller';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaModule } from '../prisma/prisma.module';
import { GoogleMeetModule } from '../google-meet/google-meet.module';

@Module({
  imports: [PrismaModule, GoogleMeetModule],
  controllers: [BookingsController],
  providers: [BookingsService, NotificationsService],
  exports: [BookingsService],
})
export class BookingsModule {}
