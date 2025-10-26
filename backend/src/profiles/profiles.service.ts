import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role, TutorStatus } from '@prisma/client';

@Injectable()
export class ProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  async chooseRole(userId: string, role: Role) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) throw new NotFoundException('User not found');

    return this.prisma.$transaction(async (tx) => {
      let next = '/choose-role';

      if (role === 'STUDENT') {
        await tx.student.upsert({
          where: { userId },
          create: { userId, tokens: 0 },
          update: {},
        });

        await tx.user.update({
          where: { id: userId },
          data: {
            role: Role.STUDENT,
            hasChosenRole: true,
          },
        });

        next = '/student/dashboard';
      } else if (role === 'TUTOR') {
        await tx.tutor.upsert({
          where: { userId },
          create: {
            userId,
            subjects: [],
            hourlyRate: 0,
            status: TutorStatus.PENDING,
            isTrending: false,
          },
          update: {},
        });

        await tx.user.update({
          where: { id: userId },
          data: {
            role: Role.TUTOR,
            hasChosenRole: true,
          },
        });

        next = '/tutor/kyc';
      }

      return {
        ok: true,
        role,
        next,
      };
    });
  }
}
