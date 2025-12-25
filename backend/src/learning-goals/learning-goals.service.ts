import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';
import { UpdateMilestoneDto } from './dto/update-milestone.dto';

@Injectable()
export class LearningGoalsService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateGoalDto) {
    const student = await this.prisma.student.findUnique({
      where: { userId },
    });

    if (!student) {
      throw new NotFoundException('Student profile not found');
    }

    return this.prisma.learningGoal.create({
      data: {
        studentId: student.id,
        title: dto.title,
        description: dto.description,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : null,
      },
      include: {
        milestones: true,
      },
    });
  }

  async findStudentGoals(userId: string) {
    const student = await this.prisma.student.findUnique({
      where: { userId },
    });

    if (!student) {
      return [];
    }

    return this.prisma.learningGoal.findMany({
      where: { studentId: student.id },
      include: {
        milestones: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(goalId: string, userId: string) {
    const goal = await this.prisma.learningGoal.findUnique({
      where: { id: goalId },
      include: {
        student: {
          include: {
            user: true,
          },
        },
        milestones: true,
      },
    });

    if (!goal) {
      throw new NotFoundException('Goal not found');
    }

    if (goal.student.userId !== userId) {
      throw new ForbiddenException('You can only view your own goals');
    }

    return goal;
  }

  async update(goalId: string, userId: string, dto: UpdateGoalDto) {
    const goal = await this.prisma.learningGoal.findUnique({
      where: { id: goalId },
      include: {
        student: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!goal) {
      throw new NotFoundException('Goal not found');
    }

    if (goal.student.userId !== userId) {
      throw new ForbiddenException('You can only update your own goals');
    }

    return this.prisma.learningGoal.update({
      where: { id: goalId },
      data: {
        title: dto.title,
        description: dto.description,
        targetDate: dto.targetDate ? new Date(dto.targetDate) : undefined,
        status: dto.status,
        progress: dto.progress,
      },
      include: {
        milestones: true,
      },
    });
  }

  async delete(goalId: string, userId: string) {
    const goal = await this.prisma.learningGoal.findUnique({
      where: { id: goalId },
      include: {
        student: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!goal) {
      throw new NotFoundException('Goal not found');
    }

    if (goal.student.userId !== userId) {
      throw new ForbiddenException('You can only delete your own goals');
    }

    return this.prisma.learningGoal.delete({
      where: { id: goalId },
    });
  }

  async addMilestone(goalId: string, userId: string, title: string) {
    const goal = await this.findOne(goalId, userId);

    return this.prisma.milestone.create({
      data: {
        goalId,
        title,
      },
    });
  }

  async updateMilestone(milestoneId: string, userId: string, dto: UpdateMilestoneDto) {
    const milestone = await this.prisma.milestone.findUnique({
      where: { id: milestoneId },
      include: {
        goal: {
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

    if (!milestone) {
      throw new NotFoundException('Milestone not found');
    }

    if (milestone.goal.student.userId !== userId) {
      throw new ForbiddenException('You can only update your own milestones');
    }

    return this.prisma.milestone.update({
      where: { id: milestoneId },
      data: {
        title: dto.title,
        completed: dto.completed,
      },
    });
  }

  async deleteMilestone(milestoneId: string, userId: string) {
    const milestone = await this.prisma.milestone.findUnique({
      where: { id: milestoneId },
      include: {
        goal: {
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

    if (!milestone) {
      throw new NotFoundException('Milestone not found');
    }

    if (milestone.goal.student.userId !== userId) {
      throw new ForbiddenException('You can only delete your own milestones');
    }

    return this.prisma.milestone.delete({
      where: { id: milestoneId },
    });
  }
}
