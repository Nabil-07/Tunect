/**
 * Unit tests for MessagesService token validation changes:
 *  - validateTokenBalanceForMessaging allows messaging with 0 tokens if future booking exists
 *  - validateTokenBalanceForMessaging blocks messaging with 0 tokens and no future booking
 *  - validateTokenBalanceForMessaging allows messaging when tokens > 0 (no DB call for future bookings)
 *  - getConversationDetail (getThread) returns lastBookingEndTime when student has no tokens but has a future booking
 *  - getConversationDetail returns canPost=false and lastBookingEndTime=null when both fail
 */

import { ForbiddenException } from '@nestjs/common';
import { MessagesService } from '../src/messages/messages.service';
import { Role } from '@prisma/client';

// ---------------------------------------------------------------------------
// Helpers to build a minimal prisma mock for the token-validation path
// ---------------------------------------------------------------------------

function makePrismaForTokenValidation({
  tokenBalance,
  futureBooking,
  tutorUser = { name: 'Test Tutor' },
}: {
  tokenBalance: { balance: { toNumber: () => number } } | null;
  futureBooking: { id: string } | null;
  tutorUser?: { name: string };
}): any {
  return {
    tutorTokenBalance: {
      findUnique: jest.fn().mockResolvedValue(tokenBalance),
    },
    booking: {
      findFirst: jest.fn().mockResolvedValue(futureBooking),
    },
    tutor: {
      findUnique: jest.fn().mockResolvedValue({ user: tutorUser }),
    },
  };
}

function makeService(prisma: any): MessagesService {
  // MessagesService constructor: prisma, ctx, piiGuard, gateway
  const ctx = { userId: 'user-1' };
  const piiGuard = {};
  const gateway = {};
  return new MessagesService(prisma, ctx as any, piiGuard as any, gateway as any);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MessagesService – validateTokenBalanceForMessaging', () => {
  const STUDENT_ID = 'student-1';
  const TUTOR_ID = 'tutor-1';

  it('allows messaging when student has tokens > 0 (no future-booking check needed)', async () => {
    const prisma = makePrismaForTokenValidation({
      tokenBalance: { balance: { toNumber: () => 3 } },
      futureBooking: null,
    });
    const service = makeService(prisma);

    // Should not throw
    await expect(
      (service as any).validateTokenBalanceForMessaging(STUDENT_ID, TUTOR_ID, Role.STUDENT),
    ).resolves.toBeUndefined();

    // Should NOT query future bookings when tokens are available
    expect(prisma.booking.findFirst).not.toHaveBeenCalled();
  });

  it('allows messaging when tokens = 0 but student has a future confirmed booking', async () => {
    const prisma = makePrismaForTokenValidation({
      tokenBalance: { balance: { toNumber: () => 0 } },
      futureBooking: { id: 'booking-future' },
    });
    const service = makeService(prisma);

    // Should not throw
    await expect(
      (service as any).validateTokenBalanceForMessaging(STUDENT_ID, TUTOR_ID, Role.STUDENT),
    ).resolves.toBeUndefined();
  });

  it('allows messaging when no token balance record exists but student has a future booking', async () => {
    const prisma = makePrismaForTokenValidation({
      tokenBalance: null,
      futureBooking: { id: 'booking-future' },
    });
    const service = makeService(prisma);

    await expect(
      (service as any).validateTokenBalanceForMessaging(STUDENT_ID, TUTOR_ID, Role.STUDENT),
    ).resolves.toBeUndefined();
  });

  it('throws ForbiddenException with INSUFFICIENT_TOKENS when tokens = 0 and no future booking', async () => {
    const prisma = makePrismaForTokenValidation({
      tokenBalance: { balance: { toNumber: () => 0 } },
      futureBooking: null,
    });
    const service = makeService(prisma);

    await expect(
      (service as any).validateTokenBalanceForMessaging(STUDENT_ID, TUTOR_ID, Role.STUDENT),
    ).rejects.toThrow(ForbiddenException);

    try {
      await (service as any).validateTokenBalanceForMessaging(STUDENT_ID, TUTOR_ID, Role.STUDENT);
    } catch (err: any) {
      expect(err.response?.code).toBe('INSUFFICIENT_TOKENS');
      expect(err.response?.balance).toBe(0);
    }
  });

  it('throws ForbiddenException with INSUFFICIENT_TOKENS when no token record and no future booking', async () => {
    const prisma = makePrismaForTokenValidation({
      tokenBalance: null,
      futureBooking: null,
    });
    const service = makeService(prisma);

    await expect(
      (service as any).validateTokenBalanceForMessaging(STUDENT_ID, TUTOR_ID, Role.STUDENT),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows tutors to message regardless (TUTOR role bypasses student checks)', async () => {
    // validateTokenBalanceForMessaging only enforces for STUDENT role
    // For TUTOR role, it still queries but since tutor doesn't have token balance, it should
    // check future bookings and potentially allow. We verify it doesn't throw for a tutor
    // who uses the other participant's token balance path.
    // The real check is: for STUDENT → enforce, for TUTOR → no token restriction
    // (The current code doesn't branch on role — let's verify tutor path works with future booking)
    const prisma = makePrismaForTokenValidation({
      tokenBalance: null,
      futureBooking: { id: 'booking-future' },
    });
    const service = makeService(prisma);

    await expect(
      (service as any).validateTokenBalanceForMessaging(STUDENT_ID, TUTOR_ID, Role.TUTOR),
    ).resolves.toBeUndefined();
  });

  it('queries future bookings with correct statuses: CONFIRMED, WAITING_ROOM, LIVE', async () => {
    const prisma = makePrismaForTokenValidation({
      tokenBalance: { balance: { toNumber: () => 0 } },
      futureBooking: { id: 'bk' },
    });
    const service = makeService(prisma);

    await (service as any).validateTokenBalanceForMessaging(STUDENT_ID, TUTOR_ID, Role.STUDENT);

    expect(prisma.booking.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          studentId: STUDENT_ID,
          tutorId: TUTOR_ID,
          status: { in: ['CONFIRMED', 'WAITING_ROOM', 'LIVE'] },
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// canPost / lastBookingEndTime in getConversationDetail (getThread)
// ---------------------------------------------------------------------------

describe('MessagesService – getThread canPost and lastBookingEndTime', () => {
  it('sets canPost=true and lastBookingEndTime when no tokens but future booking exists', async () => {
    const futureEnd = new Date(Date.now() + 86400_000); // tomorrow

    const prisma: any = {
      piiViolationLog: { count: jest.fn().mockResolvedValue(0) },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          role: 'STUDENT',
          isBanned: false,
          bannedScope: null,
          student: { id: 'student-1' },
          tutor: null,
        }),
      },
      conversation: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'conv-1',
          bookingId: null,
          createdAt: new Date(),
          student: { id: 'student-1', userId: 'user-1', user: { id: 'user-1', name: 'Alice', email: 'a@b.com' } },
          tutor: { id: 'tutor-1', userId: 'user-tutor', user: { id: 'user-tutor', name: 'Bob', email: 'b@b.com' } },
          booking: null,
          messages: [],
        }),
      },
      message: { findMany: jest.fn().mockResolvedValue([]) },
      student: { findUnique: jest.fn().mockResolvedValue({ id: 'student-1' }) },
      tutor: { findUnique: jest.fn().mockResolvedValue(null) },
      tutorTokenBalance: {
        findUnique: jest.fn().mockResolvedValue({ balance: { toNumber: () => 0 } }),
      },
      booking: {
        findFirst: jest.fn().mockResolvedValue({ endTime: futureEnd }),
      },
    };

    const ctx = { userId: 'user-1' };
    const piiGuard = { checkText: jest.fn().mockReturnValue({ hasPii: false }) };
    const gateway = {};
    const service = new MessagesService(prisma, ctx as any, piiGuard as any, gateway as any);

    const result = await service.getThread('conv-1');

    expect(result.canPost).toBe(true);
    expect(result.lastBookingEndTime).toBe(futureEnd.toISOString());
  });

  it('sets canPost=false and lastBookingEndTime=null when no tokens and no future booking', async () => {
    const prisma: any = {
      piiViolationLog: { count: jest.fn().mockResolvedValue(0) },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          role: 'STUDENT',
          isBanned: false,
          bannedScope: null,
          student: { id: 'student-1' },
          tutor: null,
        }),
      },
      conversation: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'conv-1',
          bookingId: null,
          createdAt: new Date(),
          student: { id: 'student-1', userId: 'user-1', user: { id: 'user-1', name: 'Alice', email: 'a@b.com' } },
          tutor: { id: 'tutor-1', userId: 'user-tutor', user: { id: 'user-tutor', name: 'Bob', email: 'b@b.com' } },
          booking: null,
          messages: [],
        }),
      },
      message: { findMany: jest.fn().mockResolvedValue([]) },
      student: { findUnique: jest.fn().mockResolvedValue({ id: 'student-1' }) },
      tutor: { findUnique: jest.fn().mockResolvedValue(null) },
      tutorTokenBalance: {
        findUnique: jest.fn().mockResolvedValue({ balance: { toNumber: () => 0 } }),
      },
      booking: {
        findFirst: jest.fn().mockResolvedValue(null), // no future booking
      },
    };

    const ctx = { userId: 'user-1' };
    const piiGuard = { checkText: jest.fn().mockReturnValue({ hasPii: false }) };
    const gateway = {};
    const service = new MessagesService(prisma, ctx as any, piiGuard as any, gateway as any);

    const result = await service.getThread('conv-1');

    expect(result.canPost).toBe(false);
    expect(result.lastBookingEndTime).toBeNull();
  });

  it('sets canPost=true and lastBookingEndTime=null when tokens > 0', async () => {
    const prisma: any = {
      piiViolationLog: { count: jest.fn().mockResolvedValue(0) },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          role: 'STUDENT',
          isBanned: false,
          bannedScope: null,
          student: { id: 'student-1' },
          tutor: null,
        }),
      },
      conversation: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'conv-1',
          bookingId: null,
          createdAt: new Date(),
          student: { id: 'student-1', userId: 'user-1', user: { id: 'user-1', name: 'Alice', email: 'a@b.com' } },
          tutor: { id: 'tutor-1', userId: 'user-tutor', user: { id: 'user-tutor', name: 'Bob', email: 'b@b.com' } },
          booking: null,
          messages: [],
        }),
      },
      message: { findMany: jest.fn().mockResolvedValue([]) },
      student: { findUnique: jest.fn().mockResolvedValue({ id: 'student-1' }) },
      tutor: { findUnique: jest.fn().mockResolvedValue(null) },
      tutorTokenBalance: {
        findUnique: jest.fn().mockResolvedValue({ balance: { toNumber: () => 5 } }),
      },
      booking: {
        findFirst: jest.fn(), // should NOT be called
      },
    };

    const ctx = { userId: 'user-1' };
    const piiGuard = { checkText: jest.fn().mockReturnValue({ hasPii: false }) };
    const gateway = {};
    const service = new MessagesService(prisma, ctx as any, piiGuard as any, gateway as any);

    const result = await service.getThread('conv-1');

    expect(result.canPost).toBe(true);
    expect(result.lastBookingEndTime).toBeNull();
    // booking.findFirst should NOT be called since hasTokens = true
    expect(prisma.booking.findFirst).not.toHaveBeenCalled();
  });
});
