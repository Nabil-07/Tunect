import { Module } from '@nestjs/common';
import { WaitlistService } from './waitlist.service';
import { WaitlistController } from './waitlist.controller';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailService } from '../notifications/email.service';

@Module({
  imports: [NotificationsModule],
  controllers: [WaitlistController],
  providers: [WaitlistService, PrismaService, EmailService],
  exports: [WaitlistService],
})
export class WaitlistModule {}
