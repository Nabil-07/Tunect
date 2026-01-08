import { Body, Controller, Get, Logger, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { TutorBalancesService } from './tutor-balances.service';
import { AdjustBalanceDto } from './dto/adjust-balance.dto';
import { HoldReleaseDto } from './dto/hold-release.dto';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { DirectorGuard } from '../../auth/director.guard';

@Controller('admin/finance/tutor-balances')
@UseGuards(JwtAuthGuard, DirectorGuard)
export class TutorBalancesController {
  private readonly logger = new Logger(TutorBalancesController.name);

  constructor(private readonly svc: TutorBalancesService) {}

  @Get()
  async list(@Query('tutorId') tutorId?: string, @Query('month') month?: string, @Req() req?: any) {
    this.logger.log(`Tutor balances listed by ${req?.user?.id ?? 'unknown'}`);
    return this.svc.list(tutorId, month);
  }

  @Patch(':tutorId/adjust')
  async adjust(@Param('tutorId') tutorId: string, @Body() dto: AdjustBalanceDto, @Req() req?: any) {
    this.logger.log(`Tutor balance adjust for ${tutorId} by ${req?.user?.id ?? 'unknown'}`);
    return this.svc.adjust(tutorId, dto);
  }

  @Patch(':tutorId/hold')
  async hold(@Param('tutorId') tutorId: string, @Body() dto: HoldReleaseDto, @Req() req?: any) {
    this.logger.log(`Tutor balance hold for ${tutorId} by ${req?.user?.id ?? 'unknown'}`);
    return this.svc.hold(tutorId, dto);
  }

  @Patch(':tutorId/release')
  async release(@Param('tutorId') tutorId: string, @Body() dto: HoldReleaseDto, @Req() req?: any) {
    this.logger.log(`Tutor balance release for ${tutorId} by ${req?.user?.id ?? 'unknown'}`);
    return this.svc.release(tutorId, dto);
  }
}
