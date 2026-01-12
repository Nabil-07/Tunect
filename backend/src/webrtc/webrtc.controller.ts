import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WebrtcService } from './webrtc.service';
import { MediasoupService } from '../mediasoup/mediasoup.service';

@ApiTags('webrtc')
@ApiBearerAuth()
@Controller('webrtc')
export class WebrtcController {
  constructor(private readonly webrtc: WebrtcService, private readonly mediasoup: MediasoupService) {}

  @UseGuards(JwtAuthGuard)
  @Get('ice-config')
  getIceConfig(@Req() req: any) {
    const userId = req.user?.userId || req.user?.sub;
    return this.webrtc.getIceConfig(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('mediasoup/status')
  getMediasoupStatus() {
    return this.mediasoup.getStatus();
  }

  @UseGuards(JwtAuthGuard)
  @Get('mediasoup/rtp-capabilities')
  getRtpCapabilities() {
    return this.mediasoup.getRtpCapabilities();
  }
}
