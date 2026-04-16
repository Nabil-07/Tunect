import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class DisputesService {
  private readonly logger = new Logger(DisputesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotificationsService,
  ) {}

  async fileDispute(
    reporterId: string,
    dto: { bookingId: string; reason: string; description: string },
  ) {
    // Validate booking belongs to reporter (as student or tutor)
    const booking = await this.prisma.booking.findUnique({
      where: { id: dto.bookingId },
      select: {
        id: true,
        startTime: true,
        student: { select: { userId: true } },
        tutor: { select: { userId: true, user: { select: { name: true } } } },
      },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    const reporter = await this.prisma.user.findUnique({
      where: { id: reporterId },
      select: { id: true, name: true, role: true, email: true },
    });
    if (!reporter) throw new NotFoundException('Reporter not found');

    const isStudent = booking.student?.userId === reporterId;
    const isTutor = booking.tutor?.userId === reporterId;
    if (!isStudent && !isTutor) {
      throw new ForbiddenException('You are not a participant in this booking');
    }

    const dispute = await this.prisma.dispute.create({
      data: {
        bookingId: dto.bookingId,
        reporterId,
        reason: dto.reason,
        description: dto.description,
      },
    });

    // Determine the reported party name
    const reportedName = isStudent
      ? (booking.tutor?.user?.name ?? 'Tutor')
      : 'Student';

    // Notify the reporter (acknowledgement)
    if (reporter.email) {
      this.notify.sendDisputeAcknowledgementEmail({
        to: reporter.email,
        reporterName: reporter.name ?? undefined,
        reason: dto.reason,
        bookingId: dto.bookingId,
      }).catch((e) => this.logger.warn(`Dispute ack email failed for ${reporter.email}: ${e?.message}`));
    }

    // Notify all admins
    const adminEmails = await this.prisma.user
      .findMany({ where: { role: 'ADMIN', deletedAt: null }, select: { email: true } })
      .then((rows) => rows.map((r) => r.email).filter(Boolean) as string[]);

    if (adminEmails.length) {
      this.notify.sendDisputeFiledAdminEmail({
        adminEmails,
        disputeId: dispute.id,
        reporterName: reporter.name ?? undefined,
        reporterRole: reporter.role ?? undefined,
        reportedName,
        bookingId: dto.bookingId,
        sessionDate: booking.startTime?.toISOString(),
        reason: dto.reason,
        description: dto.description,
      }).catch((e) => this.logger.warn(`Dispute admin email failed: ${e?.message}`));
    }

    return dispute;
  }

  async listMyDisputes(userId: string) {
    return this.prisma.dispute.findMany({
      where: { reporterId: userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        bookingId: true,
        reason: true,
        status: true,
        resolution: true,
        createdAt: true,
        resolvedAt: true,
      },
    });
  }
}
