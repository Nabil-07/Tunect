// src/admin-controls/admin-controls.controller.ts
import { Controller, Get, Patch, Body, UseGuards, Req, Post, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AdminControlsService } from './admin-controls.service';
import { IsBoolean, IsOptional, IsString, IsEmail, MinLength, ValidateNested, IsDateString, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

// ─── DTOs ──────────────────────────────────────

class MaintenanceBreakDto {
  @IsBoolean()
  enabled!: boolean;

  @IsString()
  @IsOptional()
  message?: string;

  @ValidateIf(o => o.startTime !== '' && o.startTime !== null && o.startTime !== undefined)
  @IsDateString()
  @IsOptional()
  startTime?: string;

  @ValidateIf(o => o.endTime !== '' && o.endTime !== null && o.endTime !== undefined)
  @IsDateString()
  @IsOptional()
  endTime?: string;
}

class UpdateAdminControlsDto {
  @IsBoolean()
  @IsOptional()
  tutorRoleEnabled?: boolean;

  @IsBoolean()
  @IsOptional()
  studentRoleEnabled?: boolean;

  @ValidateNested()
  @Type(() => MaintenanceBreakDto)
  @IsOptional()
  maintenanceBreak?: MaintenanceBreakDto;
}

class CreateAdminUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @IsOptional()
  @MinLength(8)
  password?: string;
}

@ApiTags('admin-controls')
@Controller('admin-controls')
export class AdminControlsController {
  constructor(
    private readonly svc: AdminControlsService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * PUBLIC endpoint – no auth required.
   * Returns current role toggles + maintenance info.
   * Used by the choose-role page and maintenance modal.
   */
  @Get('public')
  getPublicControls() {
    return this.svc.getPublicControls();
  }

  // ─── Admin-only endpoints ──────────────────────

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get()
  getAdminControls() {
    return this.svc.getAdminControls();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch()
  updateAdminControls(@Body() dto: UpdateAdminControlsDto, @Req() req: any) {
    return this.svc.updateControls(dto as any, req.user!.id, req);
  }

  /**
   * Create a new admin user.
   * If no password is supplied, a random one is generated (the admin
   * can ask the new user to use "Forgot Password" to set their own).
   */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('create-admin')
  async createAdminUser(@Body() dto: CreateAdminUserDto) {
    const email = dto.email.toLowerCase().trim();

    // Check if user already exists
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new BadRequestException(`User with email ${email} already exists`);
    }

    // Generate random password if none provided
    const rawPassword =
      dto.password ||
      Array.from({ length: 16 }, () =>
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%'[
          Math.floor(Math.random() * 67)
        ],
      ).join('');

    const hashedPassword = await bcrypt.hash(rawPassword, 10);

    const user = await this.prisma.user.create({
      data: {
        email,
        name: dto.name.trim(),
        password: hashedPassword,
        role: 'ADMIN',
        hasChosenRole: true,
      },
    });

    return {
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      temporaryPassword: dto.password ? undefined : rawPassword,
      note: dto.password
        ? 'Admin user created with the provided password.'
        : 'Admin user created. Share the temporary password securely. The user should change it immediately.',
    };
  }
}
