import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { BansService } from './bans.service';
import { BanUserDto } from './dto/ban-user.dto';
import { UnbanDto } from './dto/unban.dto';

@Controller('admin/bans')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class BansController {
  constructor(private readonly bans: BansService) {}

  @Get(':userId')
  async list(@Param('userId') userId: string) {
    return this.bans.list(userId);
  }

  @Get(':userId/active')
  async active(@Param('userId') userId: string) {
    return this.bans.getActiveBan(userId);
  }

  @Post()
  async ban(@Body() dto: BanUserDto, @CurrentUser('sub') actorId: string) {
    return this.bans.banUser(actorId, dto);
  }

  @Post(':userId/unban')
  async unban(
    @Param('userId') userId: string,
    @Body() body: { liftReason?: string },
    @CurrentUser('sub') actorId: string,
  ) {
    const dto: UnbanDto = { userId, liftReason: body?.liftReason };
    return this.bans.unbanUser(actorId, dto);
  }
}
