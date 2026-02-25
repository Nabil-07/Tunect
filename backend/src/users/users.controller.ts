// src/users/users.controller.ts
import { BadRequestException, Body, Controller, Get, Patch, Post, Delete, UseGuards, Req, Param, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import { FinalizeAvatarDto } from './dto/finalize-avatar.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { IsOptional, IsString, Length } from 'class-validator';

class AcceptTermsDto {
  @IsOptional()
  version?: number;
}

class ChangePasswordDto {
  @IsOptional()
  @IsString()
  @Length(6, 200)
  currentPassword?: string;

  @IsString()
  @Length(6, 200)
  newPassword!: string;
}

const MAX_AVATAR_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const AVATAR_ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

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

  @Post('me/avatar')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', {
    limits: {
      fileSize: MAX_AVATAR_FILE_SIZE_BYTES,
    },
    fileFilter: (_req, file, cb) => {
      if (AVATAR_ALLOWED_MIMES.has(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new BadRequestException('Unsupported avatar file type'), false);
      }
    },
  }))
  async uploadAvatar(@Req() req: any, @UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Avatar file is required');
    }
    const userId: string = req.user?.sub ?? req.user?.id;
    const reposition = req.body?.reposition === 'true' || req.body?.reposition === true;
    return this.users.uploadAvatar(userId, file, reposition);
  }

  @Post('me/avatar/finalize')
  async finalizeAvatar(@Req() req: any, @Body() dto: FinalizeAvatarDto) {
    const userId: string = req.user?.sub ?? req.user?.id;
    const userRole: string | undefined = req.user?.role;
    const keyOrUrl = dto.key ?? dto.avatarKey ?? dto.avatarUrl;
    if (!keyOrUrl) {
      throw new BadRequestException('avatar key/url is required');
    }
    return this.users.finalizeAvatarUpload(userId, keyOrUrl, userRole, dto.reposition);
  }

  @Patch('me/password')
  async changePassword(
    @Req() req: any,
    @Body() body: ChangePasswordDto,
  ) {
    const userId: string = req.user?.sub ?? req.user?.id;
    return this.users.changePassword(userId, body.currentPassword, body.newPassword);
  }

  @Post('me/terms/accept')
  async acceptTerms(
    @Req() req: any,
    @Body() body: AcceptTermsDto,
  ) {
    const userId: string = req.user?.sub ?? req.user?.id;
    const userRole: string | undefined = req.user?.role;
    return this.users.acceptTermsForCurrentRole(userId, userRole, req, body?.version);
  }

  @Delete('me')
  async deleteAccount(
    @Req() req: any,
    @Body() body: { password?: string },
  ) {
    const userId: string = req.user?.sub ?? req.user?.id;
    return this.users.softDeleteAccount(userId, body?.password);
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  async setRole(
    @Param('id') id: string,
    @Body() body: { role: 'ADMIN' | 'TUTOR' | 'STUDENT' },
  ) {
    return this.users.setRole(id, body.role);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async adminDeleteUser(@Param('id') id: string) {
    return this.users.softDeleteAccount(id, undefined, true);
  }
}
