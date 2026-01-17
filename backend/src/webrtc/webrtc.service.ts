import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { BookingStatus, Role } from '@prisma/client';
import { addMinutes } from 'date-fns';
import { createHmac } from 'crypto';
import { BookingsService } from '../bookings/bookings.service';

export interface ParticipantContext {
  bookingId: string;
  userId: string;
  role: Role;
  peerUserId: string | null;
}

interface IceConfig {
  iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }>;
  ttlSeconds: number;
  turnEnabled: boolean;
}

@Injectable()
export class WebrtcService {
  private readonly logger = new Logger(WebrtcService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cfg: ConfigService,
    private readonly bookings: BookingsService,
  ) {}

  async validateParticipant(bookingId: string, userId: string, role: Role) {
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
      throw new ForbiddenException('Group sessions are not supported for 1-on-1 WebRTC');
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

    // Allow either tutor OR student by userId regardless of role claim
    const isTutor = booking.tutorId === userId;
    const isStudent = booking.studentId === userId;
    if (!isTutor && !isStudent) {
      throw new ForbiddenException('You are not part of this booking');
    }

    return {
      bookingId,
      userId,
      role,
      peerUserId: isTutor ? booking.studentId : booking.tutorId,
    } satisfies ParticipantContext;
  }

  getIceConfig(userId: string): IceConfig {
    const turnEnabled = this.cfg.get<string>('TURN_ENABLED') === 'true';
    const ttlSecondsEnv = this.cfg.get<string>('TURN_TTL_SECONDS') ?? this.cfg.get<string>('TURN_TTL');
    const ttlSeconds = Number(ttlSecondsEnv ?? '600') || 600;
    const stunList = (this.cfg.get<string>('STUN_SERVERS') ?? 'stun:stun.l.google.com:19302')
      .split(',')
      .map((url) => url.trim())
      .filter(Boolean);

    const iceServers: IceConfig['iceServers'] = stunList.map((urls) => ({ urls }));

    if (turnEnabled) {
      const turnSecret = this.cfg.get<string>('TURN_REST_SECRET') ?? this.cfg.get<string>('TURN_SECRET');
      const turnUrls = (this.cfg.get<string>('TURN_URIS') ?? this.cfg.get<string>('TURN_URLS') ?? '')
        .split(',')
        .map((u) => u.trim())
        .filter(Boolean);

      if (turnSecret && turnUrls.length > 0) {
        const username = `${Math.floor(Date.now() / 1000) + ttlSeconds}:${userId}`;
        const hmac = createHmac('sha1', turnSecret).update(username).digest('base64');
        iceServers.push({
          urls: turnUrls,
          username,
          credential: hmac,
        });
      } else {
        this.logger.warn('TURN enabled but TURN_REST_SECRET (or TURN_SECRET) or TURN_URIS missing - returning STUN only');
      }
    }

    const debug = this.cfg.get<string>('WEBRTC_DEBUG') === 'true';
    if (debug) {
      this.logger.debug(
        `ICE config generated: turnEnabled=${turnEnabled} stunCount=${stunList.length} turnCount=${iceServers.length - stunList.length} ttl=${ttlSeconds}`,
      );
    }

    return { iceServers, ttlSeconds, turnEnabled };
  }

  async recordTechnicalFailure(bookingId: string, reason: string) {
    try {
      await this.bookings.markTechnicalFailure(bookingId, reason);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to mark booking ${bookingId} as technical failure: ${message}`);
    }
  }
}
