import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, Role, BanScope, BanForfeitureType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BanUserDto } from './dto/ban-user.dto';
import { UnbanDto } from './dto/unban.dto';

@Injectable()
export class BansService {
  private readonly logger = new Logger(BansService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getActiveBan(userId: string) {
    return this.prisma.banLedger.findFirst({
      where: { userId, isActive: true },
      orderBy: { bannedAt: 'desc' },
    });
  }

  async list(userId: string) {
    return this.prisma.banLedger.findMany({
      where: { userId },
      orderBy: { bannedAt: 'desc' },
      include: { forfeitures: true },
    });
  }

  async assertNotBanned(userId: string, scopes: Array<BanScope | 'ALL' | 'BOOKINGS' | 'PAYOUTS' | 'MESSAGING'>) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isBanned: true, bannedScope: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (!user.isBanned) return;
    if (!user.bannedScope) throw new ForbiddenException('User is banned');
    if (user.bannedScope === 'ALL' || scopes.includes(user.bannedScope)) {
      throw new ForbiddenException('User is banned for this action');
    }
  }

  async banUser(actorId: string, dto: BanUserDto) {
    return this.prisma.$transaction(async (tx) => {
      const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true } });
      if (!actor || actor.role !== Role.ADMIN) {
        throw new ForbiddenException('Only admins can ban users');
      }

      const user = await tx.user.findUnique({
        where: { id: dto.userId },
        include: { student: true, tutor: true },
      });
      if (!user) throw new NotFoundException('User not found');

      const existing = await tx.banLedger.findFirst({ where: { userId: dto.userId, isActive: true } });
      if (existing) throw new ConflictException('User already has an active ban');

      const ban = await tx.banLedger.create({
        data: {
          userId: dto.userId,
          actorId,
          actorRole: Role.ADMIN,
          scope: dto.scope as BanScope,
          reason: dto.reason,
          note: dto.note,
        },
      });

      const forfeitures: any[] = [];

      // Student token forfeiture
      if (user.student && (dto.scope === 'ALL' || dto.scope === 'BOOKINGS')) {
        const balances = await tx.tutorTokenBalance.findMany({
          where: { studentId: user.student.id, balance: { gt: new Prisma.Decimal(0) } },
          select: { id: true, balance: true, pricePerToken: true },
        });

        for (const bal of balances) {
          const amount = new Prisma.Decimal(bal.balance).mul(bal.pricePerToken);
          if (amount.lessThanOrEqualTo(0)) continue;

          await tx.tutorTokenBalance.update({
            where: { id: bal.id },
            data: { balance: new Prisma.Decimal(0) },
          });

          const forfeiture = await tx.banForfeitureLedger.create({
            data: {
              userId: dto.userId,
              amount,
              type: BanForfeitureType.STUDENT_TOKEN_FORFEIT,
              banLedgerId: ban.id,
            },
          });
          forfeitures.push(forfeiture);
        }
      }

      // Tutor payable forfeiture
      if (user.tutor && (dto.scope === 'ALL' || dto.scope === 'PAYOUTS')) {
        const wallet = await tx.tutorWallet.findUnique({ where: { tutorId: user.tutor.id } });
        const balance = wallet?.balance ?? new Prisma.Decimal(0);
        if (balance.greaterThan(0)) {
          await tx.tutorWallet.upsert({
            where: { tutorId: user.tutor.id },
            update: { balance: new Prisma.Decimal(0) },
            create: { tutorId: user.tutor.id, balance: new Prisma.Decimal(0) },
          });

          await tx.tutorWalletLedger.create({
            data: {
              tutorId: user.tutor.id,
              delta: balance.mul(-1),
              reason: 'ADJUSTMENT',
              note: `Forfeiture due to ban ${ban.id}`,
            },
          });

          const forfeiture = await tx.banForfeitureLedger.create({
            data: {
              userId: dto.userId,
              amount: balance,
              type: BanForfeitureType.TUTOR_EARNING_FORFEIT,
              banLedgerId: ban.id,
            },
          });
          forfeitures.push(forfeiture);
        }
      }

      const updatedUser = await tx.user.update({
        where: { id: dto.userId },
        data: {
          isBanned: true,
          bannedScope: dto.scope as BanScope,
          bannedAt: ban.bannedAt,
        },
        select: { id: true, isBanned: true, bannedScope: true, bannedAt: true },
      });

      this.logger.log(`User ${dto.userId} banned by ${actorId} scope=${dto.scope}`);
      return { ban, user: updatedUser, forfeitures };
    });
  }

  async unbanUser(actorId: string, dto: UnbanDto) {
    return this.prisma.$transaction(async (tx) => {
      const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true } });
      if (!actor || actor.role !== Role.ADMIN) {
        throw new ForbiddenException('Only admins can unban users');
      }

      const active = await tx.banLedger.findFirst({
        where: { userId: dto.userId, isActive: true },
        orderBy: { bannedAt: 'desc' },
      });
      if (!active) throw new NotFoundException('No active ban to lift');

      const lifted = await tx.banLedger.update({
        where: { id: active.id },
        data: {
          isActive: false,
          liftedAt: new Date(),
          liftReason: dto.liftReason ?? 'Unbanned',
        },
      });

      const updatedUser = await tx.user.update({
        where: { id: dto.userId },
        data: {
          isBanned: false,
          bannedScope: null,
          bannedAt: null,
        },
        select: { id: true, isBanned: true, bannedScope: true, bannedAt: true },
      });

      this.logger.log(`User ${dto.userId} unbanned by ${actorId}`);
      return { ban: lifted, user: updatedUser };
    });
  }
}
