import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BookingStatus, TutorStatus } from '@prisma/client';

@Injectable()
export class StatsService {
  constructor(private prisma: PrismaService) {}

  async getPublicStats() {
    const [students, tutors, sessionsCompleted, countries] = await Promise.all([
      this.prisma.student.count(),
      this.prisma.tutor.count({ where: { status: TutorStatus.APPROVED } }),
      this.prisma.booking.count({ where: { status: BookingStatus.COMPLETED } }),
      this.prisma.tutor.findMany({
        where: { country: { not: null } },
        distinct: ['country'],
        select: { country: true },
      }),
    ]);

    return {
      students,
      tutors,
      countries: countries.filter((c) => c.country && String(c.country).trim()).length,
      sessionsCompleted,
    };
  }
}
