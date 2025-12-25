import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CertificateType } from '@prisma/client';

interface CertificateTier {
  type: CertificateType;
  hours: number;
}

@Injectable()
export class CertificatesService {
  private readonly CERTIFICATE_TIERS: CertificateTier[] = [
    { type: 'BRONZE', hours: 15 },
    { type: 'SILVER', hours: 30 },
    { type: 'GOLD', hours: 50 },
    { type: 'PLATINUM', hours: 100 },
  ];

  constructor(private prisma: PrismaService) {}

  async checkAndGenerateCertificates(studentId: string, subject: string) {
    // Get student progress for the subject
    const progress = await this.prisma.studentProgress.findUnique({
      where: { studentId_subject: { studentId, subject } },
    });

    if (!progress) {
      return [];
    }

    const hoursSpent = Number(progress.hoursSpent);
    const newCertificates = [];

    // Check each tier
    for (const tier of this.CERTIFICATE_TIERS) {
      if (hoursSpent >= tier.hours) {
        // Check if certificate already exists
        const existing = await this.prisma.certificate.findFirst({
          where: {
            studentId,
            subject,
            type: tier.type,
          },
        });

        // Generate if doesn't exist
        if (!existing) {
          const certificate = await this.prisma.certificate.create({
            data: {
              studentId,
              subject,
              type: tier.type,
              hours: tier.hours,
            },
          });
          newCertificates.push(certificate);
        }
      }
    }

    return newCertificates;
  }

  async getStudentCertificates(userId: string) {
    const student = await this.prisma.student.findUnique({
      where: { userId },
    });

    if (!student) {
      return [];
    }

    return this.prisma.certificate.findMany({
      where: { studentId: student.id },
      include: {
        tutor: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: { issuedAt: 'desc' },
    });
  }

  async getCertificateById(certificateId: string, userId: string) {
    const certificate = await this.prisma.certificate.findUnique({
      where: { id: certificateId },
      include: {
        student: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        tutor: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!certificate) {
      throw new NotFoundException('Certificate not found');
    }

    if (certificate.student.userId !== userId) {
      throw new NotFoundException('Certificate not found');
    }

    return certificate;
  }

  async getCertificatesBySubject(userId: string, subject: string) {
    const student = await this.prisma.student.findUnique({
      where: { userId },
    });

    if (!student) {
      return [];
    }

    return this.prisma.certificate.findMany({
      where: {
        studentId: student.id,
        subject,
      },
      orderBy: { issuedAt: 'desc' },
    });
  }

  async getEligibleCertificates(userId: string) {
    const student = await this.prisma.student.findUnique({
      where: { userId },
    });

    if (!student) {
      return [];
    }

    // Get all progress records
    const progressRecords = await this.prisma.studentProgress.findMany({
      where: { studentId: student.id },
    });

    const eligible = [];

    for (const progress of progressRecords) {
      const hoursSpent = Number(progress.hoursSpent);

      for (const tier of this.CERTIFICATE_TIERS) {
        if (hoursSpent >= tier.hours) {
          // Check if already earned
          const existing = await this.prisma.certificate.findFirst({
            where: {
              studentId: student.id,
              subject: progress.subject,
              type: tier.type,
            },
          });

          if (!existing) {
            eligible.push({
              subject: progress.subject,
              type: tier.type,
              hoursRequired: tier.hours,
              hoursCompleted: hoursSpent,
            });
          }
        }
      }
    }

    return eligible;
  }

  // Call this after each booking completion
  async processBookingCompletion(bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        student: true,
      },
    });

    if (!booking || booking.status !== 'COMPLETED' || !booking.startTime || !booking.endTime) {
      return [];
    }

    // Calculate hours for this booking
    const startTime = new Date(booking.startTime);
    const endTime = new Date(booking.endTime);
    const hours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);

    const subject = 'General'; // Since booking doesn't have subject field

    // Update progress
    const progress = await this.prisma.studentProgress.findUnique({
      where: {
        studentId_subject: {
          studentId: booking.studentId,
          subject,
        },
      },
    });

    const newHours = progress
      ? Number(progress.hoursSpent) + hours
      : hours;

    const xpGained = Math.floor(hours * 100);
    const newXp = progress ? progress.xp + xpGained : xpGained;
    const newLevel = Math.floor(newXp / 1000) + 1;

    await this.prisma.studentProgress.upsert({
      where: {
        studentId_subject: {
          studentId: booking.studentId,
          subject,
        },
      },
      create: {
        studentId: booking.studentId,
        subject,
        hoursSpent: newHours,
        xp: newXp,
        level: newLevel,
      },
      update: {
        hoursSpent: newHours,
        xp: newXp,
        level: newLevel,
      },
    });

    // Check and generate certificates
    return this.checkAndGenerateCertificates(
      booking.studentId,
      subject,
    );
  }
}
