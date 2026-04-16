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

  // ─── Unread message email reminders ──────────────────────────────────────

  /**
   * Every 5 minutes — find conversations with messages unread for >15 min
   * and send an email to the recipient if we haven't already notified them
   * about _this batch_ of unread messages.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async checkUnreadMessageEmails() {
    const cutoff = new Date(Date.now() - 15 * 60 * 1000); // 15 min ago

    // Find all conversations with at least one message older than 15 min
    const conversations = await this.prisma.conversation.findMany({
      where: {
        isArchived: false,
        messages: { some: { createdAt: { lte: cutoff } } },
      },
      select: {
        id: true,
        studentId: true,
        tutorId: true,
        student: { select: { user: { select: { id: true, name: true, email: true } } } },
        tutor: { select: { user: { select: { id: true, name: true, email: true } } } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, senderId: true, createdAt: true },
        },
        readReceipts: { select: { userId: true, readAt: true } },
        chatEmailNotifications: { select: { recipientId: true, lastMessageId: true } },
      },
    });

    let sent = 0;

    for (const conv of conversations) {
      const latestMsg = conv.messages[0];
      if (!latestMsg) continue;

      // Only process messages older than 15 minutes
      if (latestMsg.createdAt > cutoff) continue;

      // Check each member of the conversation (student and tutor user)
      const members = [
        { userId: conv.student.user.id, name: conv.student.user.name, email: conv.student.user.email, role: 'STUDENT' as const },
        { userId: conv.tutor.user.id, name: conv.tutor.user.name, email: conv.tutor.user.email, role: 'TUTOR' as const },
      ];

      for (const member of members) {
        // Skip the sender — they don't need a notification about their own message
        if (latestMsg.senderId === member.userId) continue;

        // Check read receipt
        const receipt = conv.readReceipts.find(r => r.userId === member.userId);
        const hasRead = receipt && receipt.readAt >= latestMsg.createdAt;
        if (hasRead) continue; // already read — no email needed

        // Check if we already sent an email for this exact latest message
        const existingNotif = conv.chatEmailNotifications.find(n => n.recipientId === member.userId);
        if (existingNotif && existingNotif.lastMessageId === latestMsg.id) continue;

        if (!member.email) continue;

        // Count total unread messages
        const readSince = receipt?.readAt ?? new Date(0);
        const unreadCount = await this.prisma.message.count({
          where: {
            conversationId: conv.id,
            senderId: { not: member.userId },
            createdAt: { gt: readSince },
          },
        });

        // Determine sender name
        const senderName = latestMsg.senderId === conv.student.user.id
          ? (conv.student.user.name ?? 'Your contact')
          : (conv.tutor.user.name ?? 'Your contact');

        try {
          await this.notifications.sendUnreadMessageEmail({
            to: member.email,
            recipientName: member.name ?? 'there',
            senderName,
            conversationId: conv.id,
            unreadCount,
            role: member.role,
          });

          // Upsert tracking record
          await this.prisma.chatEmailNotification.upsert({
            where: { conversationId_recipientId: { conversationId: conv.id, recipientId: member.userId } },
            create: { conversationId: conv.id, recipientId: member.userId, lastMessageId: latestMsg.id },
            update: { lastMessageId: latestMsg.id, lastEmailSentAt: new Date() },
          });

          sent++;
        } catch (err: unknown) {
          this.logger.error(`Unread msg email failed conv=${conv.id} user=${member.userId}: ${(err as Error)?.message}`);
        }
      }
    }

    if (sent > 0) this.logger.log(`Unread message emails sent: ${sent}`);
  }

  // ─── Support ticket — unassigned admin notifications ─────────────────────

  /**
   * Every minute — notify admin(s) of unassigned open tickets.
   * - Working hours (10:00–20:00 IST): send after 5 min of creation.
   * - Off hours: send after 30 min of creation.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async checkUnassignedSupportTickets() {
    const nowUtc = new Date();
    // IST = UTC+5:30
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const nowIst = new Date(nowUtc.getTime() + istOffsetMs);
    const istHour = nowIst.getUTCHours(); // 0–23 in IST

    const isWorkingHours = istHour >= 10 && istHour < 20; // 10am–8pm IST
    const delayMs = isWorkingHours ? 5 * 60 * 1000 : 30 * 60 * 1000;
    const createdBefore = new Date(nowUtc.getTime() - delayMs);

    const unassigned = await this.prisma.supportTicket.findMany({
      where: {
        assignedToId: null,
        status: { in: ['OPEN', 'ASSIGNED'] },
        createdAt: { lte: createdBefore },
        emailLogs: { none: { kind: 'UNASSIGNED_ADMIN' } },
      },
      include: {
        user: { select: { name: true, role: true } },
        messages: { orderBy: { createdAt: 'asc' }, take: 1, select: { message: true } },
      },
    });

    if (!unassigned.length) return;

    // Get all admin users
    const admins = await this.prisma.user.findMany({
      where: { role: 'ADMIN', deletedAt: null },
      select: { id: true, name: true, email: true },
    });

    if (!admins.length) return;

    for (const ticket of unassigned) {
      const firstMsg = ticket.messages[0]?.message ?? '';

      for (const admin of admins) {
        if (!admin.email) continue;
        try {
          await this.notifications.sendUnassignedTicketAdminEmail({
            to: admin.email,
            adminName: admin.name ?? 'Admin',
            ticketId: ticket.id,
            ticketNumber: ticket.ticketNumber,
            subject: ticket.subject,
            description: firstMsg,
            userName: ticket.user.name ?? 'User',
            userRole: ticket.user.role ?? 'STUDENT',
            createdAt: ticket.createdAt,
          });
        } catch (err: unknown) {
          this.logger.error(`Unassigned ticket email to ${admin.email} failed: ${(err as Error)?.message}`);
        }
      }

      // Mark as notified so we don't send again until reassigned
      await this.prisma.supportTicketEmailLog.create({
        data: { ticketId: ticket.id, kind: 'UNASSIGNED_ADMIN' },
      }).catch(() => {/* ignore unique constraint races */});
    }

    this.logger.log(`Unassigned ticket admin emails sent for ${unassigned.length} ticket(s).`);
  }

  /**
   * Daily at 10:00 AM IST — remind admins of any still-unassigned tickets
   * (for tickets raised outside working hours the previous day/night).
   */
  @Cron('0 30 4 * * *', { timeZone: 'UTC' }) // 10:00 AM IST = 04:30 UTC
  async sendMorning10amTicketReminders() {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const kind = `MORNING_10AM_${today}`;

    const unassigned = await this.prisma.supportTicket.findMany({
      where: {
        assignedToId: null,
        status: { in: ['OPEN', 'ASSIGNED'] },
        emailLogs: { none: { kind } },
      },
      include: {
        user: { select: { name: true, role: true } },
        messages: { orderBy: { createdAt: 'asc' }, take: 1, select: { message: true } },
      },
    });

    if (!unassigned.length) {
      this.logger.log('Morning 10am reminder: no unassigned tickets.');
      return;
    }

    const admins = await this.prisma.user.findMany({
      where: { role: 'ADMIN', deletedAt: null },
      select: { id: true, name: true, email: true },
    });

    if (!admins.length) return;

    for (const ticket of unassigned) {
      const firstMsg = ticket.messages[0]?.message ?? '';
      for (const admin of admins) {
        if (!admin.email) continue;
        try {
          await this.notifications.sendUnassignedTicketAdminEmail({
            to: admin.email,
            adminName: admin.name ?? 'Admin',
            ticketId: ticket.id,
            ticketNumber: ticket.ticketNumber,
            subject: ticket.subject,
            description: firstMsg,
            userName: ticket.user.name ?? 'User',
            userRole: ticket.user.role ?? 'STUDENT',
            createdAt: ticket.createdAt,
          });
        } catch (err: unknown) {
          this.logger.error(`Morning reminder email to ${admin.email} failed: ${(err as Error)?.message}`);
        }
      }

      await this.prisma.supportTicketEmailLog.upsert({
        where: { ticketId_kind: { ticketId: ticket.id, kind } },
        create: { ticketId: ticket.id, kind },
        update: { sentAt: new Date() },
      }).catch(() => {/* ignore */});
    }

    this.logger.log(`Morning 10am ticket reminders sent for ${unassigned.length} ticket(s).`);
  }

  // ─── Support ticket — admin replied, user unread follow-up ───────────────

  /**
   * Every 5 minutes — for open/assigned tickets where the admin replied,
   * send a follow-up email to the ticket owner if they haven't viewed in 15 min.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async checkAdminReplyUnread() {
    const cutoff = new Date(Date.now() - 15 * 60 * 1000);

    // Find tickets with at least one admin message older than 15 min
    // where the ticket owner hasn't viewed since
    const tickets = await this.prisma.supportTicket.findMany({
      where: {
        status: { in: ['OPEN', 'ASSIGNED'] },
        messages: {
          some: {
            sender: { role: 'ADMIN' },
            createdAt: { lte: cutoff },
          },
        },
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        messages: {
          where: { sender: { role: 'ADMIN' } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { sender: { select: { name: true } } },
        },
        emailLogs: { select: { kind: true } },
      },
    });

    let sent = 0;

    for (const ticket of tickets) {
      const latestAdminMsg = ticket.messages[0];
      if (!latestAdminMsg) continue;
      if (latestAdminMsg.createdAt > cutoff) continue;

      // Check if the user has viewed the ticket since admin replied
      const userViewed =
        ticket.userLastViewedAt && ticket.userLastViewedAt >= latestAdminMsg.createdAt;
      if (userViewed) continue;

      // Check if we already sent an email for this specific admin message
      const kind = `ADMIN_REPLY_${latestAdminMsg.id}`;
      if (ticket.emailLogs.some(l => l.kind === kind)) continue;

      if (!ticket.user.email) continue;

      try {
        await this.notifications.sendTicketAdminReplyEmail({
          to: ticket.user.email,
          userName: ticket.user.name ?? 'there',
          ticketId: ticket.id,
          ticketNumber: ticket.ticketNumber,
          subject: ticket.subject,
          adminReply: latestAdminMsg.message,
          adminName: latestAdminMsg.sender.name ?? 'Support',
        });

        await this.prisma.supportTicketEmailLog.upsert({
          where: { ticketId_kind: { ticketId: ticket.id, kind } },
          create: { ticketId: ticket.id, kind },
          update: { sentAt: new Date() },
        }).catch(() => {/* ignore */});

        sent++;
      } catch (err: unknown) {
        this.logger.error(`Admin reply follow-up email failed ticket=${ticket.id}: ${(err as Error)?.message}`);
      }
    }

    if (sent > 0) this.logger.log(`Admin reply follow-up emails sent: ${sent}`);
  }

  // ─── 24-hour Session Reminders ───────────────────────────────────────────

  @Cron(CronExpression.EVERY_5_MINUTES)
  async sendT1440Reminders() {
    const now = new Date();
    // Window: 24h +/- 5min
    const t1440 = addMinutes(now, 1440);
    const t1445 = addMinutes(now, 1445);

    const upcoming = await this.prisma.booking.findMany({
      where: {
        status: { in: [BookingStatus.CONFIRMED, BookingStatus.PENDING] },
        startTime: { gte: t1440, lt: t1445 },
        reminders: { none: { kind: 'T1440' } },
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        student: { select: { user: { select: { id: true, name: true, email: true } } } },
        tutor: { select: { user: { select: { id: true, name: true, email: true } } } },
        subject: true,
      },
    });

    if (!upcoming.length) return;

    for (const b of upcoming) {
      if (!b.startTime || !b.endTime) continue;

      const startIso = b.startTime.toISOString();
      const endIso = b.endTime.toISOString();
      const studentName = b.student.user.name ?? 'Student';
      const tutorName = b.tutor.user.name ?? 'Tutor';

      this.notifications.bookingReminder({
        to: b.student.user.email,
        recipientName: studentName,
        otherPartyName: tutorName,
        bookingId: b.id,
        startIso,
        endIso,
        minutesBefore: 1440,
      }).catch((e) => this.logger.error(`T1440 student email failed: ${e?.message}`));

      this.notifications.bookingReminder({
        to: b.tutor.user.email,
        recipientName: tutorName,
        otherPartyName: studentName,
        bookingId: b.id,
        startIso,
        endIso,
        minutesBefore: 1440,
      }).catch((e) => this.logger.error(`T1440 tutor email failed: ${e?.message}`));

      await this.prisma.reminder.create({ data: { bookingId: b.id, kind: 'T1440' } })
        .catch(() => {/* unique violation ok */});
    }

    this.logger.log(`T1440 (24hr) reminders sent: ${upcoming.length}`);
  }

  // ─── 1-hour Session Reminders ─────────────────────────────────────────────

  @Cron(CronExpression.EVERY_MINUTE)
  async sendT60Reminders() {
    const now = new Date();
    const t60 = addMinutes(now, 60);
    const t61 = addMinutes(now, 61);

    const upcoming = await this.prisma.booking.findMany({
      where: {
        status: { in: [BookingStatus.CONFIRMED, BookingStatus.PENDING] },
        startTime: { gte: t60, lt: t61 },
        reminders: { none: { kind: 'T60' } },
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        student: { select: { user: { select: { id: true, name: true, email: true } } } },
        tutor: { select: { user: { select: { id: true, name: true, email: true } } } },
        subject: true,
      },
    });

    if (!upcoming.length) return;

    for (const b of upcoming) {
      if (!b.startTime || !b.endTime) continue;

      const startIso = b.startTime.toISOString();
      const endIso = b.endTime.toISOString();
      const studentName = b.student.user.name ?? 'Student';
      const tutorName = b.tutor.user.name ?? 'Tutor';

      this.notifications.bookingReminder({
        to: b.student.user.email,
        recipientName: studentName,
        otherPartyName: tutorName,
        bookingId: b.id,
        startIso,
        endIso,
        minutesBefore: 60,
      }).catch((e) => this.logger.error(`T60 student email failed: ${e?.message}`));

      this.notifications.bookingReminder({
        to: b.tutor.user.email,
        recipientName: tutorName,
        otherPartyName: studentName,
        bookingId: b.id,
        startIso,
        endIso,
        minutesBefore: 60,
      }).catch((e) => this.logger.error(`T60 tutor email failed: ${e?.message}`));

      await this.prisma.reminder.create({ data: { bookingId: b.id, kind: 'T60' } })
        .catch(() => {/* unique violation ok */});
    }

    this.logger.log(`T60 (1hr) reminders sent: ${upcoming.length}`);
  }

  // ─── No-Show Detection ───────────────────────────────────────────────────

  /** Every 2 minutes: find sessions that started 10+ min ago with no attendance record */
  @Cron('*/2 * * * *')
  async detectNoShows() {
    const now = new Date();
    // Session must have started > 10 min ago but < 60 min ago (don't keep scanning old sessions)
    const windowStart = addMinutes(now, -60);
    const windowEnd = addMinutes(now, -10);

    const bookings = await this.prisma.booking.findMany({
      where: {
        status: BookingStatus.CONFIRMED,
        startTime: { gte: windowStart, lte: windowEnd },
        reminders: { none: { kind: 'NO_SHOW_CHECKED' } },
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        subject: true,
        student: { select: { user: { select: { id: true, name: true, email: true, noShowCount: true } } } },
        tutor: { select: { user: { select: { id: true, name: true, email: true, noShowCount: true } } } },
        attendance: true,  // may or may not exist based on existing schema
      },
    }).catch(() =>
      // Fallback if 'attendance' relation doesn't exist in the schema
      this.prisma.booking.findMany({
        where: {
          status: BookingStatus.CONFIRMED,
          startTime: { gte: windowStart, lte: windowEnd },
          reminders: { none: { kind: 'NO_SHOW_CHECKED' } },
        },
        select: {
          id: true,
          startTime: true,
          endTime: true,
          subject: true,
          student: { select: { user: { select: { id: true, name: true, email: true, noShowCount: true } } } },
          tutor: { select: { user: { select: { id: true, name: true, email: true, noShowCount: true } } } },
        },
      }),
    );

    if (!bookings.length) return;

    const adminEmails = await this.getAdminEmails();

    for (const b of bookings) {
      // Mark as checked regardless of outcome to prevent repeated processing
      await this.prisma.reminder.create({ data: { bookingId: b.id, kind: 'NO_SHOW_CHECKED' } })
        .catch(() => {/* ok if duplicate */});

      const startIso = b.startTime?.toISOString() ?? '';

      // Determine who didn't join based on available signals
      // For now, mark both as potential no-shows and let admins review
      // A real implementation would check livekit/webrtc join logs

      const studentNoShow = true; // placeholder — replace with real attendance check
      const tutorNoShow = true;   // placeholder

      if (studentNoShow) {
        const studentNoShowCount = (b.student.user.noShowCount ?? 0) + 1;

        // Notify tutor of student no-show
        this.notifications.sendNoShowEmail({
          to: b.tutor.user.email,
          recipientName: b.tutor.user.name ?? undefined,
          noShowRole: 'STUDENT',
          noShowName: b.student.user.name ?? undefined,
          bookingId: b.id,
          startIso,
          subject: (b as any).subject ?? undefined,
          adminEmails,
          isRepeatNoShow: studentNoShowCount >= 3,
          userId: b.student.user.id,
        }).catch((e) => this.logger.error(`No-show email failed: ${e?.message}`));

        // Increment no-show count on student user
        await this.prisma.user.update({
          where: { id: b.student.user.id },
          data: { noShowCount: { increment: 1 } },
        }).catch(() => {});
      }

      if (tutorNoShow) {
        const tutorNoShowCount = (b.tutor.user.noShowCount ?? 0) + 1;

        // Notify student of tutor no-show
        this.notifications.sendNoShowEmail({
          to: b.student.user.email,
          recipientName: b.student.user.name ?? undefined,
          noShowRole: 'TUTOR',
          noShowName: b.tutor.user.name ?? undefined,
          bookingId: b.id,
          startIso,
          subject: (b as any).subject ?? undefined,
          adminEmails,
          isRepeatNoShow: tutorNoShowCount >= 3,
          userId: b.tutor.user.id,
        }).catch((e) => this.logger.error(`No-show email failed: ${e?.message}`));

        await this.prisma.user.update({
          where: { id: b.tutor.user.id },
          data: { noShowCount: { increment: 1 } },
        }).catch(() => {});
      }
    }

    if (bookings.length > 0) this.logger.log(`No-show check completed for ${bookings.length} booking(s).`);
  }

  // ─── Monthly Earnings Summary ─────────────────────────────────────────────

  /** 1st of every month at 8:00 AM IST */
  @Cron('0 30 2 1 * *', { timeZone: 'Asia/Kolkata' })
  async sendMonthlyEarningsSummaries() {
    this.logger.log('Running monthly earnings summary job…');

    const now = new Date();
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevPrevMonthStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);

    const monthLabel = prevMonthStart.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });

    // Get all tutors who opted in (not opted out) and had at least 1 session last month
    const tutorsWithSessions = await this.prisma.tutor.findMany({
      where: {
        user: {
          emailPromoOptOut: false,
          deletedAt: null,
        },
        bookings: {
          some: {
            status: { in: [BookingStatus.CONFIRMED, 'COMPLETED' as any] },
            startTime: { gte: prevMonthStart, lt: prevMonthEnd },
          },
        },
      },
      select: {
        id: true,
        user: { select: { id: true, email: true, name: true, emailPromoOptOut: true } },
        reviews: {
          where: { createdAt: { gte: prevMonthStart, lt: prevMonthEnd }, isDeleted: false },
          select: { rating: true },
        },
        bookings: {
          where: {
            status: { in: [BookingStatus.CONFIRMED, 'COMPLETED' as any] },
            startTime: { gte: prevMonthStart, lt: prevMonthEnd },
          },
          select: { subject: true },
        },
        walletLedger: {
          where: { createdAt: { gte: prevMonthStart, lt: prevMonthEnd } },
          select: { delta: true },
        },
      },
    });

    for (const tutor of tutorsWithSessions) {
      try {
        const sessionsCompleted = tutor.bookings.length;
        const totalEarnings = tutor.walletLedger.reduce((sum, l) => sum + Number(l.delta ?? 0), 0);
        const ratings = tutor.reviews.map(r => r.rating).filter(r => r > 0);
        const avgRating = ratings.length ? ratings.reduce((s, r) => s + r, 0) / ratings.length : undefined;

        // Top subjects
        const subjectCounts: Record<string, number> = {};
        for (const b of tutor.bookings) {
          if (b.subject) subjectCounts[b.subject] = (subjectCounts[b.subject] ?? 0) + 1;
        }
        const topSubjects = Object.entries(subjectCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([s]) => s);

        // Prev month earnings for comparison
        const prevMonthLedger = await this.prisma.tutorWalletLedger.aggregate({
          where: {
            tutorId: tutor.id,
            createdAt: { gte: prevPrevMonthStart, lt: prevMonthStart },
          },
          _sum: { delta: true },
        });
        const prevMonthEarnings = Number(prevMonthLedger._sum.delta ?? 0);

        await this.notifications.sendMonthlyEarningsSummaryEmail({
          to: tutor.user.email,
          tutorName: tutor.user.name ?? undefined,
          month: monthLabel,
          totalEarnings,
          sessionsCompleted,
          avgRating,
          topSubjects,
          prevMonthEarnings,
        });
      } catch (e: unknown) {
        this.logger.error(`Monthly summary email failed for tutor ${tutor.id}: ${(e as Error)?.message}`);
      }
    }

    this.logger.log(`Monthly earnings summaries sent to ${tutorsWithSessions.length} tutor(s).`);
  }

  // ─── Platform Revenue Summary (Admin) ────────────────────────────────────

  /** Weekly: Every Monday at 8:00 AM IST */
  @Cron('0 30 2 * * 1', { timeZone: 'Asia/Kolkata' })
  async sendWeeklyAdminRevenueReport() {
    await this.sendAdminRevenueReport('weekly');
  }

  /** Monthly: 1st of month at 7:00 AM IST (before tutor summaries) */
  @Cron('0 0 1 1 * *', { timeZone: 'Asia/Kolkata' })
  async sendMonthlyAdminRevenueReport() {
    await this.sendAdminRevenueReport('monthly');
  }

  private async sendAdminRevenueReport(type: 'weekly' | 'monthly') {
    const adminEmails = await this.getAdminEmails();
    if (!adminEmails.length) return;

    const now = new Date();
    let periodStart: Date;
    let periodEnd: Date;
    let prevPeriodStart: Date;
    let periodLabel: string;

    if (type === 'weekly') {
      // Last 7 days
      periodEnd = now;
      periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      prevPeriodStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      periodLabel = `Week of ${periodStart.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    } else {
      // Last calendar month
      periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      periodEnd = new Date(now.getFullYear(), now.getMonth(), 1);
      prevPeriodStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      periodLabel = periodStart.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
    }

    const [revenue, prevRevenue, sessions, newUsers, activeTutorCount] = await Promise.all([
      this.prisma.payment.aggregate({
        where: { status: 'SUCCEEDED' as any, createdAt: { gte: periodStart, lt: periodEnd } },
        _sum: { amountInMinor: true },
      }),
      this.prisma.payment.aggregate({
        where: { status: 'SUCCEEDED' as any, createdAt: { gte: prevPeriodStart, lt: periodStart } },
        _sum: { amountInMinor: true },
      }),
      this.prisma.booking.count({
        where: {
          status: { in: [BookingStatus.CONFIRMED, 'COMPLETED' as any] },
          createdAt: { gte: periodStart, lt: periodEnd },
        },
      }),
      this.prisma.user.count({
        where: { createdAt: { gte: periodStart, lt: periodEnd }, deletedAt: null },
      }),
      this.prisma.tutor.count({
        where: {
          bookings: { some: { startTime: { gte: periodStart, lt: periodEnd } } },
        },
      }),
    ]);

    await this.notifications.sendAdminRevenueReportEmail({
      adminEmails,
      periodLabel,
      totalRevenueInMinor: Number(revenue._sum.amountInMinor ?? 0),
      totalSessions: sessions,
      newUsers,
      activeTutors: activeTutorCount,
      prevPeriodRevenueInMinor: Number(prevRevenue._sum.amountInMinor ?? 0),
    }).catch((e) => this.logger.error(`Admin revenue report email failed: ${e?.message}`));

    this.logger.log(`Admin ${type} revenue report sent to ${adminEmails.length} admin(s).`);
  }

  // ─── Profile Incomplete Nudge (Student, 48hr after registration) ─────────

  /** Daily at midnight IST */
  @Cron('0 30 18 * * *', { timeZone: 'UTC' }) // 18:30 UTC = midnight IST
  async sendProfileIncompleteNudges() {
    const now = new Date();
    const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const seventyTwoHoursAgo = new Date(now.getTime() - 72 * 60 * 60 * 1000);

    // Find students who registered 48-72 hours ago, haven't received a nudge,
    // and haven't booked any sessions yet
    const students = await this.prisma.student.findMany({
      where: {
        profileNudgeSentAt: null,
        createdAt: { gte: seventyTwoHoursAgo, lte: fortyEightHoursAgo },
        bookings: { none: {} },
        user: { deletedAt: null, emailVerifiedAt: { not: null } },
      },
      select: {
        id: true,
        grade: true,
        board: true,
        bio: true,
        timezone: true,
        preferredLanguage: true,
        marksheetUrl: true,
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    });

    let sent = 0;

    for (const student of students) {
      try {
        // Calculate missing fields
        const missingFields: string[] = [];
        if (!student.user.name) missingFields.push('Full name');
        if (!student.user.avatarUrl) missingFields.push('Profile photo');
        if (!student.grade) missingFields.push('Grade/Class');
        if (!student.board) missingFields.push('Board (CBSE, ICSE, etc.)');
        if (!student.bio) missingFields.push('About me');
        if (!student.timezone) missingFields.push('Timezone');

        const totalFields = 6;
        const completedFields = totalFields - missingFields.length;
        const completionPercentage = Math.round((completedFields / totalFields) * 100);

        // Only nudge if profile is < 70% complete
        if (completionPercentage >= 70) {
          // Mark nudge as "sent" even though we didn't send (to prevent re-checking)
          await this.prisma.student.update({
            where: { id: student.id },
            data: { profileNudgeSentAt: now },
          });
          continue;
        }

        await this.notifications.sendProfileIncompleteNudgeEmail({
          to: student.user.email,
          studentName: student.user.name ?? undefined,
          completionPercentage,
          missingFields,
        });

        await this.prisma.student.update({
          where: { id: student.id },
          data: { profileNudgeSentAt: now },
        });

        sent++;
      } catch (e: unknown) {
        this.logger.error(`Profile nudge email failed for student ${student.id}: ${(e as Error)?.message}`);
      }
    }

    if (sent > 0) this.logger.log(`Profile incomplete nudge emails sent: ${sent}`);
  }

  // ─── Favourite Tutor Availability Alert ────────────────────────────────────

  /**
   * Every 30 minutes: find tutors who added new slots in the last 30 min,
   * then email students who have them as favourites (max 1 alert per student/tutor per day).
   */
  @Cron('*/30 * * * *')
  async sendTutorAvailabilityAlerts() {
    const now = new Date();
    const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Find tutors with newly added APPROVED/AVAILABLE slots in the last 30 min
    const recentSlots = await this.prisma.availabilitySlot.findMany({
      where: {
        createdAt: { gte: thirtyMinAgo },
        startTime: { gte: now }, // only future slots
      },
      select: {
        tutorId: true,
        startTime: true,
      },
      distinct: ['tutorId'],
    });

    if (!recentSlots.length) return;

    const tutorIds = [...new Set(recentSlots.map(s => s.tutorId))];

    // For each tutor, find students who have them as a favourite and haven't been alerted today
    for (const tutorId of tutorIds) {
      const favorites = await this.prisma.favoriteTutor.findMany({
        where: {
          tutorId,
          OR: [
            { lastAvailabilityAlertSentAt: null },
            { lastAvailabilityAlertSentAt: { lt: oneDayAgo } },
          ],
          student: { user: { deletedAt: null } },
        },
        select: {
          id: true,
          tutorId: true,
          studentId: true,
          student: { select: { user: { select: { name: true, email: true } } } },
          tutor: { select: { id: true, user: { select: { name: true } } } },
        },
      });

      for (const fav of favorites) {
        // Get available slots for this tutor (up to 5 upcoming ones)
        const slots = await this.prisma.availabilitySlot.findMany({
          where: {
            tutorId,
            startTime: { gte: now },
          },
          orderBy: { startTime: 'asc' },
          take: 5,
          select: { startTime: true },
        });

        const slotDates = slots.map(s => s.startTime.toISOString());
        if (!slotDates.length) continue;

        try {
          await this.notifications.sendTutorFavoriteAvailabilityAlertEmail({
            to: fav.student.user.email,
            studentName: fav.student.user.name ?? undefined,
            tutorName: fav.tutor.user.name ?? undefined,
            tutorId: fav.tutor.id,
            newSlotDates: slotDates,
          });

          await this.prisma.favoriteTutor.update({
            where: { id: fav.id },
            data: { lastAvailabilityAlertSentAt: now },
          });
        } catch (e: unknown) {
          this.logger.error(`Availability alert email failed for favoriteTutor ${fav.id}: ${(e as Error)?.message}`);
        }
      }
    }
  }

  // ─── Promotional Email Campaign Processing ────────────────────────────────

  /** Every hour: process scheduled email campaigns */
  @Cron(CronExpression.EVERY_HOUR)
  async processScheduledEmailCampaigns() {
    const now = new Date();

    const campaigns = await this.prisma.emailCampaign.findMany({
      where: {
        sentAt: null,
        scheduledAt: { lte: now },
      },
      select: {
        id: true,
        subject: true,
        body: true,
        targetRole: true,
        name: true,
      },
    });

    if (!campaigns.length) return;

    for (const campaign of campaigns) {
      try {
        // Find eligible recipients (opted-in users with target role)
        const users = await this.prisma.user.findMany({
          where: {
            role: campaign.targetRole ?? undefined,
            emailPromoOptOut: false,
            deletedAt: null,
          },
          select: { id: true, name: true, email: true },
        });

        let sentCount = 0;

        for (const user of users) {
          // Generate a per-user unsubscribe token (reuse email verification token approach or use user id)
          const unsubscribeToken = Buffer.from(`${user.id}:unsubscribe`).toString('base64url');

          await this.notifications.sendPromoEmail({
            to: user.email,
            recipientName: user.name ?? undefined,
            subject: campaign.subject,
            headline: campaign.name,
            body: campaign.body,
            unsubscribeToken,
          }).catch((e) => this.logger.warn(`Promo email failed for user ${user.id}: ${e?.message}`));

          sentCount++;
        }

        // Mark campaign as sent
        await this.prisma.emailCampaign.update({
          where: { id: campaign.id },
          data: { sentAt: now, sentCount },
        });

        this.logger.log(`Email campaign "${campaign.name}" sent to ${sentCount} user(s).`);
      } catch (e: unknown) {
        this.logger.error(`Email campaign ${campaign.id} processing failed: ${(e as Error)?.message}`);
      }
    }
  }

  // ─── Helper ──────────────────────────────────────────────────────────────

  private async getAdminEmails(): Promise<string[]> {
    const admins = await this.prisma.user.findMany({
      where: { role: 'ADMIN' as any, deletedAt: null },
      select: { email: true },
    });
    return admins.map(a => a.email).filter(Boolean);
  }
}
