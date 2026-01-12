import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BookingStatus, Role } from '@prisma/client';
import { WebrtcService } from './webrtc.service';

const now = Date.now();
const start = new Date(now - 60_000); // started 1 min ago
const end = new Date(now + 60_000); // ends in 1 min

const prismaMock = {
  booking: {
    findUnique: jest.fn(),
  },
} as any;

const bookingsMock = {
  markTechnicalFailure: jest.fn(),
} as any;

const configMock = {
  get: jest.fn(),
} as unknown as ConfigService;

describe('WebrtcService', () => {
  let service: WebrtcService;

  beforeEach(() => {
    jest.useFakeTimers({ now });
    prismaMock.booking.findUnique.mockReset();
    bookingsMock.markTechnicalFailure.mockReset();
    service = new WebrtcService(prismaMock, configMock, bookingsMock);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('validates a confirmed booking participant within the join window', async () => {
    prismaMock.booking.findUnique.mockResolvedValue({
      id: 'b1',
      tutorId: 't1',
      studentId: 's1',
      startTime: start,
      endTime: end,
      status: BookingStatus.CONFIRMED,
      isGroupSession: false,
    });

    const ctx = await service.validateParticipant('b1', 's1', 'STUDENT' as Role);

    expect(ctx).toEqual({
      bookingId: 'b1',
      userId: 's1',
      role: 'STUDENT',
      peerUserId: 't1',
    });
  });

  it('rejects when outside join window', async () => {
    prismaMock.booking.findUnique.mockResolvedValue({
      id: 'b1',
      tutorId: 't1',
      studentId: 's1',
      startTime: new Date(now + 60_000 * 10),
      endTime: new Date(now + 60_000 * 70),
      status: BookingStatus.CONFIRMED,
      isGroupSession: false,
    });

    await expect(service.validateParticipant('b1', 's1', 'STUDENT' as Role)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('records technical failure without throwing', async () => {
    bookingsMock.markTechnicalFailure.mockResolvedValue({});
    await service.recordTechnicalFailure('b1', 'reason');
    expect(bookingsMock.markTechnicalFailure).toHaveBeenCalledWith('b1', 'reason');
  });
});
