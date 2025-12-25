// src/users/users.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type UpdateMeInput = {
  email?: string;
  name?: string;
  avatarUrl?: string | null;
  preferredCurrency?: string;
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        name: true,
        avatarUrl: true,
        phone: true,
        preferredCurrency: true,
        createdAt: true,
        updatedAt: true,
        // personas → let frontend decide routing correctly
        student: { select: { id: true, createdAt: true } },
        tutor:   { select: { id: true, createdAt: true, status: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  // alias if anything still calls me()
  async me(userId: string) {
    return this.findMe(userId);
  }

  async updateMe(userId: string, data: UpdateMeInput) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.email ? { email: data.email.toLowerCase().trim() } : {}),
        ...(typeof data.name !== 'undefined' ? { name: data.name } : {}),
        ...(typeof data.avatarUrl !== 'undefined' ? { avatarUrl: data.avatarUrl } : {}),
        ...(data.preferredCurrency ? { preferredCurrency: data.preferredCurrency } : {}),
      },
      select: {
        id: true,
        email: true,
        role: true,
        name: true,
        avatarUrl: true,
        phone: true,
        preferredCurrency: true,
        createdAt: true,
        updatedAt: true,
        student: { select: { id: true, createdAt: true } },
        tutor:   { select: { id: true, createdAt: true, status: true } },
      },
    });
    return user;
  }

  async listAll() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async setRole(userId: string, role: 'ADMIN' | 'TUTOR' | 'STUDENT') {
    return this.prisma.user.update({
      where: { id: userId },
      data: { role },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
}
