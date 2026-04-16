import { Controller, Post, Get, Body, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DisputesService } from './disputes.service';

@ApiTags('Disputes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('disputes')
export class DisputesController {
  constructor(private readonly disputes: DisputesService) {}

  @ApiOperation({ summary: 'File a dispute for a booking' })
  @Post()
  async file(
    @Req() req: any,
    @Body() dto: { bookingId: string; reason: string; description: string },
  ) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    return this.disputes.fileDispute(userId, dto);
  }

  @ApiOperation({ summary: 'List my filed disputes' })
  @Get('mine')
  async mine(@Req() req: any) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    return this.disputes.listMyDisputes(userId);
  }
}
