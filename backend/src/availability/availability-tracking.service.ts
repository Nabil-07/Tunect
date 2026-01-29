import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/dto/create-notification.dto';

@Injectable()
export class AvailabilityTrackingService {
  private readonly logger = new Logger(AvailabilityTrackingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Calculate and update tutor availability metrics
   */
  async updateTutorAvailabilityMetrics(tutorId: string) {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // Get all availability slots in the last 7 days
    const recentSlots = await this.prisma.availabilitySlot.findMany({
      where: {
        tutorId,
        createdAt: { gte: sevenDaysAgo },
      },
      select: {
        startTime: true,
        endTime: true,
        createdAt: true,
      },
    });

    // Calculate total hours in the last 7 days
    const totalHours = recentSlots.reduce((sum, slot) => {
      const duration = (slot.endTime.getTime() - slot.startTime.getTime()) / (1000 * 60 * 60);
      return sum + duration;
    }, 0);

    // Get last active date (most recent slot creation)
    const lastActiveDate = recentSlots.length > 0
      ? recentSlots.reduce((latest, slot) => 
          slot.createdAt > latest ? slot.createdAt : latest, 
          recentSlots[0].createdAt
        )
      : null;

    // Calculate availability consistency (percentage of days with slots in last 14 days)
    const daysWithSlots = new Set<string>();
    const slots14Days = await this.prisma.availabilitySlot.findMany({
      where: {
        tutorId,
        createdAt: { gte: fourteenDaysAgo },
      },
      select: { createdAt: true },
    });

    slots14Days.forEach(slot => {
      const day = slot.createdAt.toISOString().split('T')[0];
      daysWithSlots.add(day);
    });

    const consistency = (daysWithSlots.size / 14) * 100;

    // Update tutor record
    await this.prisma.tutor.update({
      where: { id: tutorId },
      data: {
        lastActiveDate,
        weeklyAvailabilityHours: totalHours,
        availabilityConsistency: consistency,
        lastAvailabilityUpdate: now,
        // Update Featured/Verified status based on 10 hours/week requirement
        isFeatured: totalHours >= 10 && consistency >= 50,
        isVerified: totalHours >= 10 && consistency >= 70,
      },
    });

    this.logger.log(`Updated availability metrics for tutor ${tutorId}: ${totalHours}h/week, ${consistency.toFixed(1)}% consistency`);
  }

  /**
   * Check for inactive tutors and send alerts to students
   */
  async checkInactiveTutorsAndAlert() {
    const now = new Date();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // Find tutors who haven't posted availability in 14+ days
    const inactiveTutors = await this.prisma.tutor.findMany({
      where: {
        status: 'APPROVED',
        OR: [
          { lastActiveDate: null },
          { lastActiveDate: { lt: fourteenDaysAgo } },
        ],
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        balances: {
          where: {
            balance: { gt: 0 },
          },
          include: {
            student: {
              include: {
                user: true,
              },
            },
          },
        },
      },
    });

    for (const tutor of inactiveTutors) {
      // Send alerts to students who have tokens with this tutor
      for (const balance of tutor.balances) {
        // Check if alert already sent recently (within last 7 days)
        const recentAlert = await this.prisma.tutorAvailabilityAlert.findFirst({
          where: {
            tutorId: tutor.id,
            studentId: balance.studentId,
            alertType: 'INACTIVE_14_DAYS',
            sentAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
          },
        });

        if (!recentAlert) {
          // Send notification to student
          await this.notifications.create({
            userId: balance.student.userId,
            type: NotificationType.SYSTEM,
            title: 'Tutor Inactive - Refund Available',
            message: `${tutor.user?.name || 'Your tutor'} hasn't posted availability in over 14 days. You have ${balance.balance} tokens. Would you like a refund?`,
          });

          // Record alert
          await this.prisma.tutorAvailabilityAlert.create({
            data: {
              tutorId: tutor.id,
              studentId: balance.studentId,
              alertType: 'INACTIVE_14_DAYS',
              tokenAmount: balance.balance,
            },
          });

          this.logger.log(`Sent inactive tutor alert to student ${balance.student.user.email} for tutor ${tutor.id}`);
        }
      }
    }
  }

  /**
   * Check for tutors with pending tokens and send 48-hour warnings
   */
  async checkPendingTokensAndWarn() {
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    // Find tutors who haven't posted slots in 48 hours but have students with tokens
    const tutorsWithPendingTokens = await this.prisma.tutor.findMany({
      where: {
        status: 'APPROVED',
        OR: [
          { lastActiveDate: null },
          { lastActiveDate: { lt: twoDaysAgo } },
        ],
        balances: {
          some: {
            balance: { gt: 0 },
          },
        },
      },
      include: {
        balances: {
          where: {
            balance: { gt: 0 },
          },
          include: {
            student: {
              include: {
                user: true,
              },
            },
          },
        },
        user: true,
      },
    });

    for (const tutor of tutorsWithPendingTokens) {
      // Calculate total pending tokens
      const totalTokens = tutor.balances.reduce((sum, b) => sum + Number(b.balance), 0);
      const studentCount = tutor.balances.length;

      // Check if warning already sent recently (within last 24 hours)
      const recentWarning = await this.prisma.tutorAvailabilityAlert.findFirst({
        where: {
          tutorId: tutor.id,
          alertType: 'PENDING_TOKENS_48H',
          sentAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        },
      });

      if (!recentWarning) {
        // Send email to tutor
        // TODO: Implement email service call
        this.logger.log(`Should send email to tutor ${tutor.user?.email}: ${studentCount} students have ${totalTokens} tokens waiting. Post slots within 48 hours or tokens will be refunded.`);

        // Record alert
        await this.prisma.tutorAvailabilityAlert.create({
          data: {
            tutorId: tutor.id,
            studentId: tutor.balances[0].studentId, // Use first student as reference
            alertType: 'PENDING_TOKENS_48H',
            tokenAmount: totalTokens,
          },
        });
      }
    }
  }

  /**
   * Get tutor availability info for profile display
   */
  async getTutorAvailabilityInfo(tutorId: string) {
    const tutor = await this.prisma.tutor.findUnique({
      where: { id: tutorId },
      select: {
        lastActiveDate: true,
        availabilityConsistency: true,
        weeklyAvailabilityHours: true,
        isFeatured: true,
        isVerified: true,
      },
    });

    if (!tutor) return null;

    return {
      lastActive: tutor.lastActiveDate,
      consistencyPercentage: tutor.availabilityConsistency || 0,
      weeklyHours: tutor.weeklyAvailabilityHours || 0,
      isFeatured: tutor.isFeatured,
      isVerified: tutor.isVerified,
    };
  }
}
