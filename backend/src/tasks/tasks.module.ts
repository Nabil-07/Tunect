import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotifierService } from './notifier.service';

@Module({
  imports: [
    ScheduleModule.forRoot(), // Enables @Cron, @Interval, @Timeout decorators
  ],
  providers: [TasksService, PrismaService, NotifierService],
})
export class TasksModule {}
