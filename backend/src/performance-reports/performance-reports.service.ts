import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportDto } from './dto/update-report.dto';

@Injectable()
export class PerformanceReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateReportDto) {
    const tutor = await this.prisma.tutor.findUnique({
      where: { userId },
    });

    if (!tutor) {
      throw new NotFoundException('Tutor profile not found');
    }

    // Verify the student exists and has had sessions with this tutor
    const student = await this.prisma.student.findUnique({
      where: { id: dto.studentId },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    return this.prisma.performanceReport.create({
      data: {
        studentId: dto.studentId,
        tutorId: tutor.id,
        period: dto.period,
        data: dto.data,
      },
      include: {
        student: {
          include: {
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });
  }

  async findTutorReports(userId: string) {
    const tutor = await this.prisma.tutor.findUnique({
      where: { userId },
    });

    if (!tutor) {
      return [];
    }

    return this.prisma.performanceReport.findMany({
      where: { tutorId: tutor.id },
      include: {
        student: {
          include: {
            user: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(userId: string, reportId: string, dto: UpdateReportDto) {
    const tutor = await this.prisma.tutor.findUnique({ where: { userId } });
    if (!tutor) throw new NotFoundException('Tutor profile not found');

    const report = await this.prisma.performanceReport.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Performance report not found');
    if (report.tutorId !== tutor.id) {
      throw new ForbiddenException('You can only update your own performance reports');
    }

    const updateData: { period?: string; data?: Record<string, any> } = {};
    if (dto.period === undefined) {
      // no-op
    } else {
      updateData.period = dto.period;
    }
    if (dto.data === undefined) {
      // no-op
    } else {
      updateData.data = dto.data;
    }

    return this.prisma.performanceReport.update({
      where: { id: reportId },
      data: updateData,
      include: {
        student: {
          include: {
            user: {
              select: { name: true, email: true },
            },
          },
        },
      },
    });
  }

  async remove(userId: string, reportId: string) {
    const tutor = await this.prisma.tutor.findUnique({ where: { userId } });
    if (!tutor) throw new NotFoundException('Tutor profile not found');

    const report = await this.prisma.performanceReport.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Performance report not found');
    if (report.tutorId !== tutor.id) {
      throw new ForbiddenException('You can only delete your own performance reports');
    }

    await this.prisma.performanceReport.delete({ where: { id: reportId } });
    return { ok: true };
  }

  async findStudentReports(userId: string) {
    const student = await this.prisma.student.findUnique({
      where: { userId },
    });

    if (!student) {
      return [];
    }

    return this.prisma.performanceReport.findMany({
      where: { studentId: student.id },
      include: {
        tutor: {
          include: {
            user: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getStudentPerformanceByTutor(tutorUserId: string, studentId: string) {
    const tutor = await this.prisma.tutor.findUnique({
      where: { userId: tutorUserId },
    });

    if (!tutor) {
      throw new NotFoundException('Tutor profile not found');
    }

    // Get all bookings between this tutor and student
    const bookings = await this.prisma.booking.findMany({
      where: {
        tutorId: tutor.id,
        studentId: studentId,
        status: 'COMPLETED',
      },
      include: {
        sessionNotes: true,
      },
      orderBy: { startTime: 'asc' },
    });

    // Get all performance reports
    const reports = await this.prisma.performanceReport.findMany({
      where: {
        tutorId: tutor.id,
        studentId: studentId,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Calculate summary statistics
    const totalSessions = bookings.length;
    const totalHours = bookings.reduce((sum, booking) => {
      if (booking.startTime && booking.endTime) {
        const hours = (new Date(booking.endTime).getTime() - new Date(booking.startTime).getTime()) / (1000 * 60 * 60);
        return sum + hours;
      }
      return sum;
    }, 0);

    return {
      studentId,
      tutorId: tutor.id,
      totalSessions,
      totalHours,
      bookings,
      reports,
    };
  }
}
