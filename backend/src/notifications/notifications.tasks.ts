import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { BookingStatus } from '@prisma/client';
import { NotificationsService } from './notifications.service';
import { addMinutes } from 'date-fns';
import { NotificationType } from './dto/create-notification.dto';

@Injectable()
export class NotificationsTasks implements OnModuleInit {
  private readonly logger = new Logger(NotificationsTasks.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async onModuleInit() {
    // Run low-availability check once on startup so existing cases get notified immediately
    setTimeout(() => this.lowAvailabilityReminders(), 10_000);
  }

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

  @Cron(CronExpression.EVERY_MINUTE)
  async sendT15Reminders() {
    const now = new Date();
    const t15 = addMinutes(now, 15);
    const t16 = addMinutes(now, 16);

    const upcoming = await this.prisma.booking.findMany({
      where: {
        status: BookingStatus.CONFIRMED,
        startTime: { gte: t15, lt: t16 },
        reminders: { none: { kind: 'T15' } },
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
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
        title: 'Class starts in 15 minutes',
        message: `Your class with ${tutorName} starts in 15 minutes.`,
      });

      await this.notifications.create({
        userId: b.tutor.user.id,
        type: NotificationType.REMINDER,
        bookingId: b.id,
        title: 'Class starts in 15 minutes',
        message: `Your class with ${studentName} starts in 15 minutes.`,
      });

      this.notifications.bookingReminder({
        to: b.student.user.email,
        recipientName: studentName,
        otherPartyName: tutorName,
        bookingId: b.id,
        startIso,
        endIso,
        minutesBefore: 15,
      });
      this.notifications.bookingReminder({
        to: b.tutor.user.email,
        recipientName: tutorName,
        otherPartyName: studentName,
        bookingId: b.id,
        startIso,
        endIso,
        minutesBefore: 15,
      });

      await this.prisma.reminder.create({
        data: { bookingId: b.id, kind: 'T15' },
      });
    }

    this.logger.log(`T15 reminders sent: ${upcoming.length}`);
  }

  /**
   * Daily at 8 AM IST — check all tutors who have students with token balances
   * but fewer than 2 upcoming availability slots. Send reminder email.
   */
  @Cron('0 30 2 * * *', { timeZone: 'Asia/Kolkata' }) // 8:00 AM IST = 2:30 UTC
  async lowAvailabilityReminders() {
    this.logger.log('Running low-availability reminder check…');

    const now = new Date();
    const tenDaysFromNow = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);

    // Find all tutors who have at least one student with remaining tokens
    const tutorsWithBalances = await this.prisma.tutorTokenBalance.groupBy({
      by: ['tutorId'],
      where: { balance: { gt: 0 } },
    });

    if (!tutorsWithBalances.length) {
      this.logger.log('No tutors with active token balances — skipping.');
      return;
    }

    let sentCount = 0;

    for (const { tutorId } of tutorsWithBalances) {
      // Count upcoming availability slots
      const totalSlots = await this.prisma.availabilitySlot.count({
        where: {
          tutorId,
          startTime: { gte: now, lte: tenDaysFromNow },
        },
      });

      // Count confirmed/completed bookings in the same window
      const bookedCount = await this.prisma.booking.count({
        where: {
          tutorId,
          status: { in: ['CONFIRMED', 'COMPLETED'] },
          startTime: { gte: now, lte: tenDaysFromNow },
        },
      });

      const openSlots = totalSlots - bookedCount;
      if (openSlots >= 2) continue; // Enough availability

      // Get tutor info
      const tutor = await this.prisma.tutor.findUnique({
        where: { id: tutorId },
        select: { user: { select: { email: true, name: true } } },
      });
      if (!tutor?.user?.email) continue;

      // Get students with remaining balance for this tutor
      const tokenBalances = await this.prisma.tutorTokenBalance.findMany({
        where: { tutorId, balance: { gt: 0 } },
        select: {
          balance: true,
          student: { select: { user: { select: { name: true } } } },
        },
      });

      const students = tokenBalances.map((tb) => ({
        name: tb.student?.user?.name || 'Student',
        remainingTokens: Number(tb.balance),
      }));

      if (!students.length) continue;

      this.notifications
        .lowAvailabilityReminderEmail({
          tutorEmail: tutor.user.email,
          tutorName: tutor.user.name ?? undefined,
          upcomingSlotCount: Math.max(0, openSlots),
          students,
        })
        .catch((err) =>
          this.logger.error(`Low-availability email to ${tutor.user.email} failed: ${err?.message ?? err}`),
        );

      // Also send in-app notification
      const tutorUser = await this.prisma.user.findFirst({
        where: { tutor: { id: tutorId } },
        select: { id: true },
      });
      if (tutorUser) {
        await this.notifications.create({
          userId: tutorUser.id,
          type: NotificationType.REMINDER,
          title: 'Add your availability',
          message: `You have ${students.length} student${students.length === 1 ? '' : 's'} with unused tokens but only ${Math.max(0, openSlots)} open slot${openSlots === 1 ? '' : 's'} in the next 10 days. Please update your availability.`,
        }).catch((err) =>
          this.logger.error(`Low-availability in-app notification failed: ${err?.message ?? err}`),
        );
      }

      sentCount++;
    }

    this.logger.log(`Low-availability reminders sent to ${sentCount} tutor(s).`);
  }
}
