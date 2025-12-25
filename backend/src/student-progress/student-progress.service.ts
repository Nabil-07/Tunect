import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class StudentProgressService {
  constructor(private prisma: PrismaService) {}

  async getProgress(studentId: string) {
    return this.prisma.studentProgress.findMany({
      where: { studentId },
      orderBy: { subject: 'asc' },
    });
  }

  async getProgressBySubject(studentId: string, subject: string) {
    return this.prisma.studentProgress.findUnique({
      where: { studentId_subject: { studentId, subject } },
    });
  }

  async updateProgress(studentId: string, subject: string, hoursToAdd: number) {
    const existing = await this.getProgressBySubject(studentId, subject);
    
    const newHours = existing 
      ? Number(existing.hoursSpent) + hoursToAdd 
      : hoursToAdd;
    
    const xpGained = Math.floor(hoursToAdd * 100);
    const newXp = existing ? existing.xp + xpGained : xpGained;
    const newLevel = Math.floor(newXp / 1000) + 1;

    return this.prisma.studentProgress.upsert({
      where: { studentId_subject: { studentId, subject } },
      create: {
        studentId,
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
  }

  async getTotalHours(studentId: string): Promise<number> {
    const progress = await this.prisma.studentProgress.findMany({
      where: { studentId },
    });
    
    return progress.reduce((sum, p) => sum + Number(p.hoursSpent), 0);
  }

  async getProgressByUserId(userId: string) {
    const student = await this.prisma.student.findUnique({
      where: { userId },
    });
    
    if (!student) {
      return [];
    }

    return this.getProgress(student.id);
  }

  async getTotalHoursByUserId(userId: string): Promise<number> {
    const student = await this.prisma.student.findUnique({
      where: { userId },
    });
    
    if (!student) {
      return 0;
    }

    return this.getTotalHours(student.id);
  }
}
