import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LivekitService } from './livekit.service';

type LivekitTokenRequest = {
  bookingId: string;
};

@ApiTags('livekit')
@ApiBearerAuth()
@Controller('livekit')
export class LivekitController {
  constructor(private readonly livekit: LivekitService) {}

  @UseGuards(JwtAuthGuard)
  @Post('token')
  async createToken(@Req() req: any, @Body() body: LivekitTokenRequest) {
    const userId = req.user?.userId || req.user?.sub;
    return this.livekit.createToken(userId, body?.bookingId);
  }
}
