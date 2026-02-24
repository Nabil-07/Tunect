import { Body, Controller, Post, Param, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ChooseRoleDto } from './dto/choose-role.dto';
import { ProfilesService } from './profiles.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('profiles')
@Controller('profiles')
export class ProfilesController {
  constructor(
    private readonly svc: ProfilesService,
    private readonly jwt: JwtService,
    private readonly cfg: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post('choose-role')
  async chooseRole(@Req() req: any, @Body() dto: ChooseRoleDto) {
    const userId = req.user?.sub || req.user?.id;
    const result = await this.svc.chooseRole(userId, dto.role);
    
    // Fetch updated user to get the new role
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true },
    });
    
    if (!user) {
      throw new Error('User not found');
    }
    
    // Generate new JWT token with updated role
    const payload = { sub: user.id, email: user.email, role: user.role };
    const access_token = await this.jwt.signAsync(payload, {
      secret: this.cfg.get('JWT_SECRET'),
      expiresIn: this.cfg.get('JWT_ACCESS_TTL'),
    });
    
    return { ...result, access_token };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('switch-role/:userId')
  async switchRole(@Param('userId') userId: string) {
    const result = await this.svc.switchRole(userId);

    // Fetch updated user to get the new role
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Generate new JWT token with updated role
    const payload = { sub: user.id, email: user.email, role: user.role };
    const access_token = await this.jwt.signAsync(payload, {
      secret: this.cfg.get('JWT_SECRET'),
      expiresIn: this.cfg.get('JWT_ACCESS_TTL'),
    });

    return { ...result, access_token };
  }
}
