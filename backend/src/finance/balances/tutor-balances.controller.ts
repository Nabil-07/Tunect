import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { TutorBalancesService } from './tutor-balances.service';
import { AdjustBalanceDto } from './dto/adjust-balance.dto';
import { HoldReleaseDto } from './dto/hold-release.dto';

@Controller('admin/finance/tutor-balances')
export class TutorBalancesController {
  constructor(private readonly svc: TutorBalancesService) {}

  @Get()
  async list(@Query('tutorId') tutorId?: string, @Query('month') month?: string) {
    return this.svc.list(tutorId, month);
  }

  @Patch(':tutorId/adjust')
  async adjust(@Param('tutorId') tutorId: string, @Body() dto: AdjustBalanceDto) {
    return this.svc.adjust(tutorId, dto);
  }

  @Patch(':tutorId/hold')
  async hold(@Param('tutorId') tutorId: string, @Body() dto: HoldReleaseDto) {
    return this.svc.hold(tutorId, dto);
  }

  @Patch(':tutorId/release')
  async release(@Param('tutorId') tutorId: string, @Body() dto: HoldReleaseDto) {
    return this.svc.release(tutorId, dto);
  }
}
