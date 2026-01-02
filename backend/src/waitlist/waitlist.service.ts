import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../notifications/email.service';
import { AddToWaitlistDto } from './dto/add-to-waitlist.dto';
import { addHours } from 'date-fns';
import { NotificationType } from '../notifications/dto/create-notification.dto';

@Injectable()
export class WaitlistService {
  private readonly NOTIFICATION_EXPIRY_HOURS = Number(
    process.env.WAITLIST_NOTIFICATION_EXPIRY_HOURS ?? 24,
  );

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private emailService: EmailService,
  ) {}

  async addToWaitlist(dto: AddToWaitlistDto, studentId: string) {
    const { tutorId, requestedStartTime, requestedEndTime, subject, priority, notes } = dto;

    // Verify tutor exists
    const tutor = await this.prisma.tutor.findUnique({
      where: { id: tutorId },
      include: { user: true },
    });

    if (!tutor) {
      throw new NotFoundException('Tutor not found');
    }

    // Verify student exists
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: { user: true },
    });

    if (!student) {
      throw new NotFoundException('Student account not found');
    }

    // Check if already on waitlist for this tutor and time
    const existing = await this.prisma.waitlist.findFirst({
      where: {
        studentId,
        tutorId,
        requestedStartTime: new Date(requestedStartTime),
        status: 'WAITING',
      },
    });

    if (existing) {
      throw new BadRequestException('You are already on the waitlist for this time slot');
    }

    // Create waitlist entry
    const waitlistEntry = await this.prisma.waitlist.create({
      data: {
        studentId,
        tutorId,
        requestedStartTime: new Date(requestedStartTime),
        requestedEndTime: requestedEndTime ? new Date(requestedEndTime) : new Date(requestedStartTime),
        subject,
        priority: priority ?? 1,
        status: 'WAITING',
      },
      include: {
        tutor: { include: { user: true } },
        student: { include: { user: true } },
      },
    });

    // Send notification to tutor
    await this.notifications.create({
      userId: tutor.userId,
      type: NotificationType.SYSTEM,
      title: 'New Waitlist Request',
      message: `${student.user.name} has joined your waitlist for ${new Date(requestedStartTime).toLocaleString()}`,
    });

    // Send confirmation email to student
    // NOTE (release): waitlist notification emails are disabled
    // await this.emailService.sendWaitlistNotificationEmail(
    //   student.user.email,
    //   tutor.user.name || 'Tutor',
    //   student.user.name || 'Student',
    // );

    return waitlistEntry;
  }

  async getMyWaitlist(studentId: string) {
    return this.prisma.waitlist.findMany({
      where: { studentId },
      include: {
        tutor: { include: { user: { select: { name: true, avatarUrl: true } } } },
      },
      orderBy: [{ status: 'asc' }, { priority: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async getTutorWaitlist(tutorId: string) {
    return this.prisma.waitlist.findMany({
      where: { tutorId, status: 'WAITING' },
      include: {
        student: { include: { user: { select: { name: true, email: true, avatarUrl: true } } } },
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async notifyWhenAvailable(waitlistId: string, tutorId: string, bookingId: string) {
    const entry = await this.prisma.waitlist.findUnique({
      where: { id: waitlistId },
      include: {
        student: { include: { user: true } },
        tutor: { include: { user: true } },
      },
    });

    if (!entry) {
      throw new NotFoundException('Waitlist entry not found');
    }

    if (entry.tutorId !== tutorId) {
      throw new ForbiddenException('You can only notify students on your waitlist');
    }

    if (entry.status !== 'WAITING') {
      throw new BadRequestException('This waitlist entry is not in WAITING status');
    }

    // Set expiration time
    const expiresAt = addHours(new Date(), this.NOTIFICATION_EXPIRY_HOURS);

    // Update status
    const updated = await this.prisma.waitlist.update({
      where: { id: waitlistId },
      data: {
        status: 'NOTIFIED',
        notifiedAt: new Date(),
        expiresAt,
      },
    });

    // Send notification to student
    await this.notifications.create({
      userId: entry.student.userId,
      type: NotificationType.SYSTEM,
      title: 'Waitlist Slot Available!',
      message: `A slot is now available with ${entry.tutor.user.name}. Book within ${this.NOTIFICATION_EXPIRY_HOURS} hours!`,
      bookingId,
    });

    // Send email notification
    // NOTE (release): waitlist notification emails are disabled
    // await this.emailService.sendSlotAvailableEmail(
    //   entry.student.user.email,
    //   entry.tutor.user.name || 'Tutor',
    //   entry.student.user.name || 'Student',
    // );

    return updated;
  }

  // Notify all waiting students for a tutor when new availability is added
  async notifyWaitingStudentsForTutor(tutorId: string) {
    const waitingStudents = await this.prisma.waitlist.findMany({
      where: {
        tutorId,
        status: 'WAITING',
      },
      include: {
        student: { include: { user: true } },
        tutor: { include: { user: true } },
      },
    });

    if (waitingStudents.length === 0) {
      return { notifiedCount: 0 };
    }

    // Send notifications to all waiting students
    for (const entry of waitingStudents) {
      await this.notifications.create({
        userId: entry.student.userId,
        type: NotificationType.SYSTEM,
        title: 'New Slots Available!',
        message: `${entry.tutor.user.name} has added new availability. Schedule your class now!`,
      });

      // Send email notification
      // NOTE (release): waitlist notification emails are disabled
      // await this.emailService.sendSlotAvailableEmail(
      //   entry.student.user.email,
      //   entry.tutor.user.name || 'Tutor',
      //   entry.student.user.name || 'Student',
      // );
    }

    return { notifiedCount: waitingStudents.length };
  }

  async bookFromWaitlist(waitlistId: string, studentId: string) {
    const entry = await this.prisma.waitlist.findUnique({
      where: { id: waitlistId },
    });

    if (!entry) {
      throw new NotFoundException('Waitlist entry not found');
    }

    if (entry.studentId !== studentId) {
      throw new ForbiddenException('This is not your waitlist entry');
    }

    if (entry.status !== 'NOTIFIED') {
      throw new BadRequestException('No slot has been offered for this waitlist entry');
    }

    if (entry.expiresAt && new Date() > entry.expiresAt) {
      // Expired - mark as expired
      await this.prisma.waitlist.update({
        where: { id: waitlistId },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException('This waitlist offer has expired');
    }

    if (!entry.bookingId) {
      throw new BadRequestException('No booking is associated with this waitlist entry');
    }

    // Mark as booked
    await this.prisma.waitlist.update({
      where: { id: waitlistId },
      data: { status: 'BOOKED' },
    });

    // Return the booking
    const booking = await this.prisma.booking.findUnique({
      where: { id: entry.bookingId },
    });

    return booking;
  }

  async removeFromWaitlist(waitlistId: string, studentId: string) {
    const entry = await this.prisma.waitlist.findUnique({
      where: { id: waitlistId },
    });

    if (!entry) {
      throw new NotFoundException('Waitlist entry not found');
    }

    if (entry.studentId !== studentId) {
      throw new ForbiddenException('You can only remove your own waitlist entries');
    }

    await this.prisma.waitlist.delete({
      where: { id: waitlistId },
    });

    return { message: 'Removed from waitlist successfully' };
  }

  async processExpiredNotifications() {
    const expired = await this.prisma.waitlist.updateMany({
      where: {
        status: 'NOTIFIED',
        expiresAt: { lt: new Date() },
      },
      data: { status: 'EXPIRED' },
    });

    return { expiredCount: expired.count };
  }
}
