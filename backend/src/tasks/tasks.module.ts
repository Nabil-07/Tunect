import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotifierService } from './notifier.service';
import { AvailabilityTrackingService } from '../availability/availability-tracking.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    NotificationsModule,
  ],
  providers: [TasksService, PrismaService, NotifierService, AvailabilityTrackingService],
})
export class TasksModule {}
