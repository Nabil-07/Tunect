// src/users/users.controller.ts
import { Body, Controller, Get, Patch, UseGuards, Req, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { IsOptional, IsString, Length } from 'class-validator';

class ChangePasswordDto {
  @IsOptional()
  @IsString()
  @Length(6, 200)
  currentPassword?: string;

  @IsString()
  @Length(6, 200)
  newPassword!: string;
}

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard) // <-- only JWT here
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  async me(@Req() req: any) {
    // JWT strategy should set payload as { sub, email, role } (we'll mirror id=sub too)
    const userId: string = req.user?.sub ?? req.user?.id;
    return this.users.findMe(userId);
  }

  @Patch('me')
  async updateMe(
    @Req() req: any,
    @Body() body: { email?: string; name?: string; avatarUrl?: string; preferredCurrency?: string },
  ) {
    const userId: string = req.user?.sub ?? req.user?.id;
    return this.users.updateMe(userId, body);
  }

  @Patch('me/password')
  async changePassword(
    @Req() req: any,
    @Body() body: ChangePasswordDto,
  ) {
    const userId: string = req.user?.sub ?? req.user?.id;
    return this.users.changePassword(userId, body.currentPassword, body.newPassword);
  }

  // Admin-only routes
  @Get()
  @Roles('ADMIN')
  @UseGuards(JwtAuthGuard, RolesGuard) // <-- add RolesGuard only where needed
  async listAll() {
    return this.users.listAll();
  }

  @Patch(':id/role')
  @Roles('ADMIN')
  @UseGuards(JwtAuthGuard, RolesGuard) // <-- add RolesGuard only where needed
  async setRole(
    @Param('id') id: string,
    @Body() body: { role: 'ADMIN' | 'TUTOR' | 'STUDENT' },
  ) {
    return this.users.setRole(id, body.role);
  }
}
