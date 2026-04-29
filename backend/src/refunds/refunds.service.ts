import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { extractAuditInfo } from '../common/audit-helper';
import { Request } from 'express';
import { NotificationType } from '../notifications/dto/create-notification.dto';
import { BookingStatus } from '@prisma/client';
import { drainLotsWithoutConsumption } from '../tutors/token-lots.helper';

@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Create a token transfer request (student requests to transfer tokens from Tutor A to Tutor B/C)
   */
  async createTokenTransferRequest(
    studentId: string,
    fromTutorId: string,
    toTutorId: string,
    tokenAmount: number,
    reason?: string,
  ) {
    if (!Number.isFinite(tokenAmount) || tokenAmount <= 0) {
      throw new BadRequestException('Token amount must be greater than 0');
    }

    if (fromTutorId === toTutorId) {
      throw new BadRequestException('From and To tutor cannot be the same');
    }

    // Verify student has tokens with fromTutor
    const balance = await this.prisma.tutorTokenBalance.findUnique({
      where: {
        studentId_tutorId: {
          studentId,
          tutorId: fromTutorId,
        },
      },
    });

    if (!balance || Number(balance.balance) < tokenAmount) {
      throw new BadRequestException('Insufficient tokens with this tutor');
    }

    // Transfer must move full tutor balance to avoid stale assignment with previous tutor
    const availableBalance = Number(balance.balance);
    if (Math.abs(availableBalance - Number(tokenAmount)) > 0.000001) {
      throw new BadRequestException(
        `Transfer must be for full available balance (${availableBalance.toFixed(2)} tokens)`,
      );
    }

    // Verify tutors exist
    const [fromTutor, toTutor] = await Promise.all([
      this.prisma.tutor.findUnique({ where: { id: fromTutorId } }),
      this.prisma.tutor.findUnique({ where: { id: toTutorId } }),
    ]);

    if (!fromTutor || !toTutor) {
      throw new NotFoundException('Tutor not found');
    }

    const purchasePricePerToken = Number(balance.pricePerToken);
    const toTutorRate = Number(toTutor.hourlyRate || 0);
    if (!Number.isFinite(toTutorRate) || toTutorRate <= 0) {
      throw new BadRequestException('Target tutor pricing is invalid');
    }
    if (toTutorRate > purchasePricePerToken) {
      throw new BadRequestException(
        `Target tutor rate (₹${toTutorRate}) exceeds purchase rate cap (₹${purchasePricePerToken})`,
      );
    }

    const existingPending = await this.prisma.tokenTransferRequest.findFirst({
      where: {
        studentId,
        fromTutorId,
        status: 'PENDING',
      },
      select: { id: true },
    });

    if (existingPending) {
      throw new BadRequestException('A transfer request for this tutor is already pending');
    }

    // Create transfer request
    const request = await this.prisma.tokenTransferRequest.create({
      data: {
        studentId,
        fromTutorId,
        toTutorId,
        tokenAmount,
        reason,
        status: 'PENDING',
      },
      include: {
        student: {
          include: { user: true },
        },
        fromTutor: {
          include: { user: true },
        },
        toTutor: {
          include: { user: true },
        },
      },
    });

    // Notify admins
    const admins = await this.prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { id: true },
    });

    for (const admin of admins) {
      await this.notifications.create({
        userId: admin.id,
        type: NotificationType.SYSTEM,
        title: 'Token Transfer Request',
        message: `Student ${request.student.user.email} requested to transfer ${tokenAmount} tokens from ${request.fromTutor.user?.name} to ${request.toTutor.user?.name}`,
      });
    }

    this.logger.log(`Created token transfer request ${request.id} for student ${studentId}`);
    return request;
  }

  /**
   * Admin approves or rejects token transfer request
   */
  async processTokenTransferRequest(
    requestId: string,
    adminId: string,
    approved: boolean,
    adminNotes?: string,
    req?: Request,
  ) {
    const request = await this.prisma.tokenTransferRequest.findUnique({
      where: { id: requestId },
      include: {
        student: {
          include: { user: true },
        },
        fromTutor: {
          include: { user: true },
        },
        toTutor: {
          include: { user: true },
        },
      },
    });

    if (!request) {
      throw new NotFoundException('Transfer request not found');
    }

    if (request.status !== 'PENDING') {
      throw new BadRequestException('Request already processed');
    }

    if (approved) {
      // Transfer tokens
      await this.prisma.$transaction(async (tx) => {
        const fromBalance = await tx.tutorTokenBalance.findUnique({
          where: {
            studentId_tutorId: {
              studentId: request.studentId,
              tutorId: request.fromTutorId,
            },
          },
        });

        if (!fromBalance || Number(fromBalance.balance) < Number(request.tokenAmount)) {
          throw new BadRequestException('Insufficient source balance to process transfer');
        }

        const purchasePricePerToken = Number(fromBalance.pricePerToken);
        const latestToTutor = await tx.tutor.findUnique({
          where: { id: request.toTutorId },
          select: { hourlyRate: true },
        });
        const latestToTutorRate = Number(latestToTutor?.hourlyRate || 0);
        if (!Number.isFinite(latestToTutorRate) || latestToTutorRate <= 0) {
          throw new BadRequestException('Target tutor pricing is invalid');
        }
        if (latestToTutorRate > purchasePricePerToken) {
          throw new BadRequestException(
            `Target tutor rate (₹${latestToTutorRate}) exceeds purchase rate cap (₹${purchasePricePerToken})`,
          );
        }

        // Deduct from fromTutor balance
        await tx.tutorTokenBalance.update({
          where: {
            studentId_tutorId: {
              studentId: request.studentId,
              tutorId: request.fromTutorId,
            },
          },
          data: {
            balance: {
              decrement: request.tokenAmount,
            },
          },
        });

        // Add to toTutor balance (or create if doesn't exist)
        const toBalance = await tx.tutorTokenBalance.findUnique({
          where: {
            studentId_tutorId: {
              studentId: request.studentId,
              tutorId: request.toTutorId,
            },
          },
        });

        if (toBalance) {
          await tx.tutorTokenBalance.update({
            where: {
              studentId_tutorId: {
                studentId: request.studentId,
                tutorId: request.toTutorId,
              },
            },
            data: {
              balance: {
                increment: request.tokenAmount,
              },
            },
          });
        } else {
          await tx.tutorTokenBalance.create({
            data: {
              studentId: request.studentId,
              tutorId: request.toTutorId,
              balance: request.tokenAmount,
              pricePerToken: fromBalance?.pricePerToken || 0,
            },
          });
        }

        // Reassign any unscheduled bookings from old tutor to new tutor.
        // This ensures future slot assignment happens only with the new tutor.
        await tx.booking.updateMany({
          where: {
            studentId: request.studentId,
            tutorId: request.fromTutorId,
            OR: [
              { status: BookingStatus.PENDING_SLOT },
              { status: BookingStatus.PENDING, startTime: null },
            ],
          },
          data: {
            tutorId: request.toTutorId,
          },
        });

        // Move waitlist requests as well so old tutor can no longer allocate new slots for this pending path.
        await tx.waitlist.updateMany({
          where: {
            studentId: request.studentId,
            tutorId: request.fromTutorId,
            status: 'WAITING',
          },
          data: {
            tutorId: request.toTutorId,
          },
        });
      });

      // Notify student
      await this.notifications.create({
        userId: request.student.userId,
        type: NotificationType.SYSTEM,
        title: 'Token Transfer Approved',
        message: `Your request to transfer ${request.tokenAmount} tokens has been approved. New unscheduled bookings are now assigned to ${request.toTutor.user?.name || 'the selected tutor'}.`,
      });

      // Send refund processed email (re-use method since token transfer = credit back to student for new tutor)
      if (request.student.user?.email) {
        this.notifications.sendRefundProcessedEmail({
          to: request.student.user.email,
          studentName: request.student.user.name ?? undefined,
          tokensRefunded: Number(request.tokenAmount),
          processedAt: new Date().toISOString(),
        }).catch(() => {/* non-critical */});
      }
    } else {
      // Notify student of rejection
      await this.notifications.create({
        userId: request.student.userId,
        type: NotificationType.SYSTEM,
        title: 'Token Transfer Rejected',
        message: `Your request to transfer tokens has been rejected. ${adminNotes || ''}`,
      });
    }

    // Update request status
    const updated = await this.prisma.tokenTransferRequest.update({
      where: { id: requestId },
      data: {
        status: approved ? 'APPROVED' : 'REJECTED',
        adminId,
        adminNotes,
        processedAt: new Date(),
      },
    });

    // Audit log
    const auditInfo = req ? extractAuditInfo(req) : { endpoint: undefined, ipAddress: undefined };
    this.audit.log({
      adminId,
      action: approved ? 'TOKEN_TRANSFER_APPROVED' : 'TOKEN_TRANSFER_REJECTED',
      entityType: 'TOKEN_TRANSFER_REQUEST' as any,
      entityId: requestId,
      beforeData: { status: 'PENDING' },
      afterData: { status: updated.status, adminNotes },
      endpoint: auditInfo.endpoint,
      ipAddress: auditInfo.ipAddress,
    });

    this.logger.log(`Processed token transfer request ${requestId}: ${updated.status}`);
    return updated;
  }

  /**
   * Create a 7-day refund request (student requests refund if tutor hasn't posted slots)
   */
  async createRefundRequest(
    studentId: string,
    tutorId: string,
    tokenAmount: number,
    purchaseDate: Date,
    reason?: string,
  ) {
    // Verify student has tokens with tutor
    const balance = await this.prisma.tutorTokenBalance.findUnique({
      where: {
        studentId_tutorId: {
          studentId,
          tutorId,
        },
      },
    });

    if (!balance || Number(balance.balance) < tokenAmount) {
      throw new BadRequestException('Insufficient tokens');
    }

    // Check if 7 days have passed since purchase
    const daysSincePurchase = (Date.now() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSincePurchase < 7) {
      throw new BadRequestException('Refund only available after 7 days from purchase');
    }

    // Check if tutor has posted slots in last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentSlots = await this.prisma.availabilitySlot.findFirst({
      where: {
        tutorId,
        createdAt: { gte: sevenDaysAgo },
      },
    });

    if (recentSlots) {
      throw new BadRequestException('Tutor has posted availability in the last 7 days');
    }

    // Create refund request
    const request = await this.prisma.refundRequest.create({
      data: {
        studentId,
        tutorId,
        tokenAmount,
        purchaseDate,
        reason,
        status: 'PENDING',
      },
      include: {
        student: {
          include: { user: true },
        },
        tutor: {
          include: { user: true },
        },
      },
    });

    // Notify admins
    const admins = await this.prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: { id: true },
    });

    for (const admin of admins) {
      await this.notifications.create({
        userId: admin.id,
        type: NotificationType.SYSTEM,
        title: 'Refund Request',
        message: `Student ${request.student.user.email} requested refund of ${tokenAmount} tokens from ${request.tutor.user?.name}`,
      });
    }

    this.logger.log(`Created refund request ${request.id} for student ${studentId}`);
    return request;
  }

  /**
   * Admin approves or rejects refund request
   */
  async processRefundRequest(
    requestId: string,
    adminId: string,
    approved: boolean,
    adminNotes?: string,
    req?: Request,
  ) {
    const request = await this.prisma.refundRequest.findUnique({
      where: { id: requestId },
      include: {
        student: {
          include: { user: true },
        },
      },
    });

    if (!request) {
      throw new NotFoundException('Refund request not found');
    }

    if (request.status !== 'PENDING') {
      throw new BadRequestException('Request already processed');
    }

    if (approved) {
      // Refund tokens (add back to student's overall token balance)
      await this.prisma.$transaction(async (tx) => {
        // Deduct from tutor-specific balance
        await tx.tutorTokenBalance.update({
          where: {
            studentId_tutorId: {
              studentId: request.studentId,
              tutorId: request.tutorId,
            },
          },
          data: {
            balance: {
              decrement: request.tokenAmount,
            },
          },
        });

        // Drain matching qty FIFO from this student's lots for the tutor so
        // lot.remainingQty stays in sync with TutorTokenBalance.balance.
        // (No BookingLotConsumption row — these tokens are leaving the pool.)
        await drainLotsWithoutConsumption(tx, {
          studentId: request.studentId,
          tutorId: request.tutorId,
          qty: Number(request.tokenAmount),
        });

        // Add to student's overall token balance
        await tx.student.update({
          where: { id: request.studentId },
          data: {
            tokens: {
              increment: Number(request.tokenAmount),
            },
          },
        });
      });

      // Notify student
      await this.notifications.create({
        userId: request.student.userId,
        type: NotificationType.SYSTEM,
        title: 'Refund Approved',
        message: `Your refund request for ${request.tokenAmount} tokens has been approved. Tokens have been added to your account.`,
      });

      // Send refund processed email
      if (request.student.user?.email) {
        this.notifications.sendRefundProcessedEmail({
          to: request.student.user.email,
          studentName: request.student.user.name ?? undefined,
          tokensRefunded: Number(request.tokenAmount),
          processedAt: new Date().toISOString(),
        }).catch(() => {/* non-critical */});
      }
    } else {
      // Notify student of rejection
      await this.notifications.create({
        userId: request.student.userId,
        type: NotificationType.SYSTEM,
        title: 'Refund Rejected',
        message: `Your refund request has been rejected. ${adminNotes || ''}`,
      });
    }

    // Update request status
    const updated = await this.prisma.refundRequest.update({
      where: { id: requestId },
      data: {
        status: approved ? 'APPROVED' : 'REJECTED',
        adminId,
        adminNotes,
        processedAt: new Date(),
      },
    });

    // Audit log
    const auditInfo = req ? extractAuditInfo(req) : { endpoint: undefined, ipAddress: undefined };
    this.audit.log({
      adminId,
      action: approved ? 'REFUND_APPROVED' : 'REFUND_REJECTED',
      entityType: 'REFUND_REQUEST' as any,
      entityId: requestId,
      beforeData: { status: 'PENDING' },
      afterData: { status: updated.status, adminNotes },
      endpoint: auditInfo.endpoint,
      ipAddress: auditInfo.ipAddress,
    });

    this.logger.log(`Processed refund request ${requestId}: ${updated.status}`);
    return updated;
  }

  /**
   * Get all pending transfer requests (for admin)
   */
  async getPendingTransferRequests() {
    return this.prisma.tokenTransferRequest.findMany({
      where: { status: 'PENDING' },
      include: {
        student: {
          include: { user: true },
        },
        fromTutor: {
          include: { user: true },
        },
        toTutor: {
          include: { user: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get all pending refund requests (for admin)
   */
  async getPendingRefundRequests() {
    return this.prisma.refundRequest.findMany({
      where: { status: 'PENDING' },
      include: {
        student: {
          include: { user: true },
        },
        tutor: {
          include: { user: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get student's refund requests
   */
  async getMyRefundRequests(studentId: string) {
    return this.prisma.refundRequest.findMany({
      where: { studentId },
      include: {
        tutor: {
          include: { user: true },
        },
        admin: {
          select: { email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get student's transfer requests
   */
  async getMyTransferRequests(studentId: string) {
    return this.prisma.tokenTransferRequest.findMany({
      where: { studentId },
      include: {
        fromTutor: {
          include: { user: true },
        },
        toTutor: {
          include: { user: true },
        },
        admin: {
          select: { email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
