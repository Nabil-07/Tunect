// src/users/users.service.ts
import { Injectable, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

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
        isDirector: true,
        isBanned: true,
        bannedScope: true,
        bannedAt: true,
        createdAt: true,
        updatedAt: true,
        password: true,
        // personas → let frontend decide routing correctly
        student: { select: { id: true, createdAt: true } },
        tutor:   { select: { id: true, createdAt: true, status: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const activeBan = await this.prisma.banLedger.findFirst({
      where: { userId, isActive: true },
      orderBy: { bannedAt: 'desc' },
      select: { scope: true, reason: true, bannedAt: true },
    });

    const piiStrikes = await this.prisma.piiViolationLog.count({ where: { userId } });
    const piiMaxStrikes = 3;
    const isBannedForMessaging =
      user.isBanned ||
      user.bannedScope === 'MESSAGING' ||
      user.bannedScope === 'ALL' ||
      activeBan?.scope === 'MESSAGING' ||
      activeBan?.scope === 'ALL';
    const messagingBlocked = piiStrikes >= piiMaxStrikes || isBannedForMessaging;

    const { password, ...safeUser } = user;

    return {
      ...safeUser,
      hasPassword: Boolean(password && password.length > 0),
      piiStrikes,
      piiMaxStrikes,
      messagingBlocked,
      banReason: activeBan?.reason ?? null,
      bannedScope: activeBan?.scope ?? user.bannedScope,
      bannedAt: activeBan?.bannedAt ?? user.bannedAt,
    };
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

  async changePassword(userId: string, currentPassword: string | undefined, newPassword: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const hasPassword = Boolean(user.password && user.password.length > 0);

    if (hasPassword) {
      if (!currentPassword || !currentPassword.trim()) {
        throw new BadRequestException('Current password is required');
      }
      const ok = await bcrypt.compare(currentPassword, user.password);
      if (!ok) throw new UnauthorizedException('Current password is incorrect');
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hash },
    });

    return { ok: true, hasPassword: true };
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
