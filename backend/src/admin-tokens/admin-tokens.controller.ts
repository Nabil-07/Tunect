// src/admin-tokens/admin-tokens.controller.ts
import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/role.enum';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

@ApiTags('Admin Tokens')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/tokens')
export class AdminTokensController {
  constructor(private prisma: PrismaService) {}

  @ApiOperation({ summary: 'Admin: adjust student tokens (+/-)' })
  @Roles(Role.ADMIN)
  @Post('adjust')
  async adjust(@Body() dto: { studentId: string; delta: number; note?: string }) {
    const student = await this.prisma.student.findUnique({ where: { id: dto.studentId } });
    if (!student) throw new Error('Student not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.student.update({
        where: { id: dto.studentId },
        data: { tokens: { increment: dto.delta } },
      });
      await tx.tokenLedger.create({
        data: {
          studentId: dto.studentId,
          delta: new Decimal(dto.delta),
          reason: 'ADMIN_ADJUSTMENT',
          bookingId: null,
          paymentId: null,
        },
      });
    });

    return { ok: true };
  }
}
