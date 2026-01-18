import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { BookingStatus } from '@prisma/client';
import { addMinutes } from 'date-fns';
import { AccessToken } from 'livekit-server-sdk';

@Injectable()
export class LivekitService {
  private readonly logger = new Logger(LivekitService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cfg: ConfigService,
  ) {}

  private getApiKey() {
    return this.cfg.get<string>('LIVEKIT_API_KEY') || '';
  }

  private getApiSecret() {
    return this.cfg.get<string>('LIVEKIT_API_SECRET') || '';
  }

  async createToken(userId: string, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        tutorId: true,
        studentId: true,
        startTime: true,
        endTime: true,
        status: true,
        isGroupSession: true,
        isDemo: true,
      },
    });

    if (!booking) {
      throw new ForbiddenException('Booking not found');
    }

    if (booking.isGroupSession) {
      throw new ForbiddenException('Group sessions are not supported yet');
    }

    const isAllowedStatus =
      booking.status === BookingStatus.CONFIRMED ||
      booking.isDemo;
    if (!isAllowedStatus) {
      throw new ForbiddenException('Booking is not active');
    }

    if (!booking.startTime || !booking.endTime) {
      throw new ForbiddenException('Booking time is not set');
    }

    const now = new Date();
    const earliest = addMinutes(booking.startTime, -5);
    const latest = addMinutes(booking.endTime, 10);
    if (now < earliest || now > latest) {
      throw new ForbiddenException('Call window not active');
    }

    const isTutor = booking.tutorId === userId;
    const isStudent = booking.studentId === userId;
    if (!isTutor && !isStudent) {
      throw new ForbiddenException('You are not part of this booking');
    }

    const apiKey = this.getApiKey();
    const apiSecret = this.getApiSecret();
    if (!apiKey || !apiSecret) {
      this.logger.error('LiveKit API credentials missing');
      throw new ForbiddenException('LiveKit is not configured');
    }

    const token = new AccessToken(apiKey, apiSecret, {
      identity: userId,
      ttl: 60 * 60, // 1 hour
    });

    token.addGrant({
      room: bookingId,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    return {
      token: token.toJwt(),
      room: bookingId,
      identity: userId,
    };
  }
}
