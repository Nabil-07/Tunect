import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { BookingStatus } from '@prisma/client';
import { NotificationsService } from './notifications.service';
import { addMinutes } from 'date-fns';

@Injectable()
export class NotificationsTasks {
  private readonly logger = new Logger(NotificationsTasks.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async sendT30Reminders() {
    const now = new Date();
    const t30 = addMinutes(now, 30);
    const t35 = addMinutes(now, 35); // small window to catch runs

    // Find bookings that start ~30 mins from now, not canceled/completed, and no T30 reminder yet
    const upcoming = await this.prisma.booking.findMany({
      where: {
        status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
        startTime: { gte: t30, lt: t35 },
        reminders: { none: { kind: 'T30' } },
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        student: { select: { user: { select: { email: true } } } },
        tutor: { select: { user: { select: { email: true } } } },
      },
    });

    if (!upcoming.length) return;

    for (const b of upcoming) {
      if (!b.startTime || !b.endTime) continue; // safety for unscheduled demos

      const startIso = b.startTime.toISOString();
      const endIso = b.endTime.toISOString();
      const studentEmail = b.student.user.email;
      const tutorEmail = b.tutor.user.email;

      // fire & forget emails
      this.notifications.bookingReminder({
        to: studentEmail,
        bookingId: b.id,
        startIso,
        endIso,
        minutesBefore: 30,
      });
      this.notifications.bookingReminder({
        to: tutorEmail,
        bookingId: b.id,
        startIso,
        endIso,
        minutesBefore: 30,
      });

      // mark reminder sent (unique per booking/kind)
      await this.prisma.reminder.create({
        data: { bookingId: b.id, kind: 'T30' },
      });
    }

    this.logger.log(`T30 reminders sent: ${upcoming.length}`);
  }
}
