// src/admin-tokens/admin-tokens.controller.ts
import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/role.enum';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { Decimal } from '@prisma/client/runtime/library';
import { TokenReason } from '@prisma/client';
import { AuditEntityType } from '@prisma/client';

@ApiTags('Admin Tokens')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/tokens')
export class AdminTokensController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  @ApiOperation({ summary: 'Admin: adjust student tokens (+/-)' })
  @Roles(Role.ADMIN)
  @Post('adjust')
  async adjust(
    @Body() dto: { studentId: string; delta: number; note?: string },
    @Req() req: { user?: { id: string } },
  ) {
    const student = await this.prisma.student.findUnique({
      where: { id: dto.studentId },
      select: { id: true, tokens: true },
    });
    if (!student) throw new Error('Student not found');

    const beforeTokens = Number(student.tokens);

    await this.prisma.$transaction(async (tx) => {
      await tx.student.update({
        where: { id: dto.studentId },
        data: { tokens: { increment: dto.delta } },
      });
      await tx.tokenLedger.create({
        data: {
          studentId: dto.studentId,
          delta: new Decimal(dto.delta),
          reason: TokenReason.ADMIN_ADJUSTMENT,
          bookingId: null,
          paymentId: null,
        },
      });
    });

    const afterTokens = beforeTokens + dto.delta;
    this.audit.log({
      adminId: req.user!.id,
      action: 'TOKEN_ADJUSTMENT',
      entityType: AuditEntityType.TOKEN,
      entityId: dto.studentId,
      beforeData: { tokens: beforeTokens, studentId: dto.studentId },
      afterData: { tokens: afterTokens, delta: dto.delta, note: dto.note },
    });

    return { ok: true };
  }
}
