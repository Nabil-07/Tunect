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
    const key = this.cfg.get<string>('LIVEKIT_API_KEY') || '';
    if (!key) {
      this.logger.warn('LIVEKIT_API_KEY is empty or not set');
    }
    return key;
  }

  private getApiSecret() {
    const secret = this.cfg.get<string>('LIVEKIT_API_SECRET') || '';
    if (!secret) {
      this.logger.warn('LIVEKIT_API_SECRET is empty or not set');
    }
    return secret;
  }

  async createToken(userId: string, bookingId: string, tutorId?: string, studentId?: string) {
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

    // Check if user is tutor or student by comparing tutorId/studentId from JWT
    // If not provided, fallback to looking up by userId
    let isTutor = false;
    let isStudent = false;

    if (tutorId) {
      isTutor = booking.tutorId === tutorId;
    }
    if (studentId) {
      isStudent = booking.studentId === studentId;
    }

    // Fallback: if tutorId/studentId not provided, look up from userId
    if (!isTutor && !isStudent) {
      const [tutor, student] = await Promise.all([
        this.prisma.tutor.findUnique({ where: { userId }, select: { id: true } }),
        this.prisma.student.findUnique({ where: { userId }, select: { id: true } }),
      ]);

      if (tutor) {
        isTutor = booking.tutorId === tutor.id;
      }
      if (student) {
        isStudent = booking.studentId === student.id;
      }
    }

    if (!isTutor && !isStudent) {
      throw new ForbiddenException('You are not part of this booking');
    }

    const apiKey = this.getApiKey();
    const apiSecret = this.getApiSecret();
    if (!apiKey || !apiSecret) {
      this.logger.error(`LiveKit API credentials missing - Key: ${apiKey ? 'present' : 'missing'}, Secret: ${apiSecret ? 'present' : 'missing'}`);
      this.logger.error(`Environment check - LIVEKIT_API_KEY exists: ${!!this.cfg.get<string>('LIVEKIT_API_KEY')}, LIVEKIT_API_SECRET exists: ${!!this.cfg.get<string>('LIVEKIT_API_SECRET')}`);
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

    // toJwt() is async in livekit-server-sdk v2.15+ and returns a Promise<string>
    let jwtToken: string;
    try {
      const jwtResult = token.toJwt();
      // Always await since toJwt() returns Promise<string> in v2.15+
      jwtToken = await jwtResult;
    } catch (error) {
      this.logger.error('Failed to generate JWT token:', error);
      throw new ForbiddenException('Failed to generate token');
    }
    
    // Ensure we return a string
    if (typeof jwtToken !== 'string' || jwtToken.length === 0) {
      this.logger.error('Token.toJwt() did not return a valid string:', typeof jwtToken, jwtToken);
      throw new ForbiddenException('Failed to generate token');
    }
    
    return {
      token: jwtToken,
      room: bookingId,
      identity: userId,
    };
  }
}
