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
    const userId = req.user?.sub || req.user?.id || req.user?.userId;
    const tutorId = req.user?.tutorId;
    const studentId = req.user?.studentId;
    const role = req.user?.role;
    const isAdmin = role === 'ADMIN' || req.user?.isDirector;
    
    // Log for debugging (remove in production)
    if (process.env.NODE_ENV !== 'production') {
      console.log('[LiveKit] Token request:', {
        userId,
        tutorId,
        studentId,
        role,
        isAdmin,
        bookingId: body?.bookingId,
        user: req.user,
      });
    }
    
    return this.livekit.createToken(userId, body?.bookingId, tutorId, studentId, isAdmin);
  }
}
