import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FavoritesService {
  constructor(private prisma: PrismaService) {}

  async addFavorite(userId: string, tutorId: string) {
    // Get student ID from user ID
    const student = await this.prisma.student.findUnique({
      where: { userId },
    });

    if (!student) {
      throw new NotFoundException('Student profile not found');
    }

    // Check if tutor exists
    const tutor = await this.prisma.tutor.findUnique({
      where: { id: tutorId },
    });

    if (!tutor) {
      throw new NotFoundException('Tutor not found');
    }

    // Check if already favorited
    const existing = await this.prisma.favoriteTutor.findUnique({
      where: {
        studentId_tutorId: {
          studentId: student.id,
          tutorId,
        },
      },
    });

    if (existing) {
      throw new ConflictException('Tutor already in favorites');
    }

    return this.prisma.favoriteTutor.create({
      data: {
        studentId: student.id,
        tutorId,
      },
      include: {
        tutor: {
          include: {
            user: {
              select: {
                name: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });
  }

  async removeFavorite(userId: string, tutorId: string) {
    const student = await this.prisma.student.findUnique({
      where: { userId },
    });

    if (!student) {
      throw new NotFoundException('Student profile not found');
    }

    const favorite = await this.prisma.favoriteTutor.findUnique({
      where: {
        studentId_tutorId: {
          studentId: student.id,
          tutorId,
        },
      },
    });

    if (!favorite) {
      throw new NotFoundException('Favorite not found');
    }

    await this.prisma.favoriteTutor.delete({
      where: { id: favorite.id },
    });

    return { success: true };
  }

  async getFavorites(userId: string) {
    const student = await this.prisma.student.findUnique({
      where: { userId },
    });

    if (!student) {
      return [];
    }

    return this.prisma.favoriteTutor.findMany({
      where: { studentId: student.id },
      include: {
        tutor: {
          include: {
            user: {
              select: {
                name: true,
                avatarUrl: true,
                email: true,
              },
            },
            reviews: {
              select: {
                rating: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async isFavorite(userId: string, tutorId: string): Promise<boolean> {
    const student = await this.prisma.student.findUnique({
      where: { userId },
    });

    if (!student) {
      return false;
    }

    const favorite = await this.prisma.favoriteTutor.findUnique({
      where: {
        studentId_tutorId: {
          studentId: student.id,
          tutorId,
        },
      },
    });

    return !!favorite;
  }
}
