import { Module } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { BookingsController } from './bookings.controller';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaModule } from '../prisma/prisma.module';
import { GoogleMeetModule } from '../google-meet/google-meet.module';
import { WaitlistModule } from '../waitlist/waitlist.module';
import { MessagesModule } from '../messages/messages.module';
import { BansModule } from '../bans/bans.module';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [PrismaModule, GoogleMeetModule, WaitlistModule, MessagesModule, BansModule, UploadsModule],
  controllers: [BookingsController],
  providers: [BookingsService, NotificationsService],
  exports: [BookingsService],
})
export class BookingsModule {}
