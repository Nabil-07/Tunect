import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { BookingStatus } from '@prisma/client';
import { NotificationsService } from './notifications.service';
import { addMinutes } from 'date-fns';
import { NotificationType } from './dto/create-notification.dto';

@Injectable()
export class NotificationsTasks {
  private readonly logger = new Logger(NotificationsTasks.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
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

  @Cron(CronExpression.EVERY_MINUTE)
  async sendT5Reminders() {
    const now = new Date();
    const t5 = addMinutes(now, 5);
    const t6 = addMinutes(now, 6);

    const upcoming = await this.prisma.booking.findMany({
      where: {
        status: BookingStatus.CONFIRMED,
        startTime: { gte: t5, lt: t6 },
        reminders: { none: { kind: 'T5' } },
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        studentId: true,
        tutorId: true,
        student: { select: { user: { select: { id: true, name: true, email: true } } } },
        tutor: { select: { user: { select: { id: true, name: true, email: true } } } },
      },
    });

    if (!upcoming.length) return;

    for (const b of upcoming) {
      if (!b.startTime || !b.endTime) continue;

      const startIso = b.startTime.toISOString();
      const endIso = b.endTime.toISOString();
      const studentName = b.student.user.name || 'Student';
      const tutorName = b.tutor.user.name || 'Tutor';

      await this.notifications.create({
        userId: b.student.user.id,
        type: NotificationType.REMINDER,
        bookingId: b.id,
        title: 'Class starts in 5 minutes',
        message: `Your class with ${tutorName} starts in 5 minutes.`,
      });

      await this.notifications.create({
        userId: b.tutor.user.id,
        type: NotificationType.REMINDER,
        bookingId: b.id,
        title: 'Class starts in 5 minutes',
        message: `Your class with ${studentName} starts in 5 minutes.`,
      });

      this.notifications.bookingReminder({
        to: b.student.user.email,
        bookingId: b.id,
        startIso,
        endIso,
        minutesBefore: 5,
      });
      this.notifications.bookingReminder({
        to: b.tutor.user.email,
        bookingId: b.id,
        startIso,
        endIso,
        minutesBefore: 5,
      });

      await this.prisma.reminder.create({
        data: { bookingId: b.id, kind: 'T5' },
      });
    }

    this.logger.log(`T5 reminders sent: ${upcoming.length}`);
  }
}
