import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChooseRoleDto } from './dto/choose-role.dto';
import { ProfilesService } from './profiles.service';

@ApiTags('profiles')
@Controller('profiles')
export class ProfilesController {
  constructor(private readonly svc: ProfilesService) {}

  @UseGuards(JwtAuthGuard)
  @Post('choose-role')
  async chooseRole(@Req() req: any, @Body() dto: ChooseRoleDto) {
    const userId = req.user?.sub || req.user?.id; // adjust based on your JWT strategy
    return this.svc.chooseRole(userId, dto.role);
  }
}
