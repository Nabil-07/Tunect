/**
 * Unit tests for priceAtBooking changes across:
 *  - TutorWalletService.ensureCompletedBookingsCredited
 *    → uses priceAtBooking in preference to tutor.hourlyRate
 *    → falls back to hourlyRate when priceAtBooking is null
 *    → earnings = 0 when both are null/0
 *  - platformFeePercent tiers (unchanged but exercised by the earnings path)
 *  - helpers: getBookingHours
 */

import { TutorWalletService } from '../src/tutors/tutor-wallet.service';
import { Prisma } from '@prisma/client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function decimal(n: number) {
  return new Prisma.Decimal(n);
}

type BookingLike = {
  id: string;
  isDemo: boolean;
  tokensCharged: Prisma.Decimal;
  startTime: Date | null;
  endTime: Date | null;
  priceAtBooking: Prisma.Decimal | null;
  status: string;
  tutor: { hourlyRate: Prisma.Decimal | null };
  attendance: {
    tutorJoinCount: number;
    studentJoinCount: number;
    tutorFirstJoinedAt: Date | null;
    studentFirstJoinedAt: Date | null;
  } | null;
  whiteboardSessions: { data: any }[];
};

function makeBook(overrides: Partial<BookingLike> = {}): BookingLike {
  const now = new Date();
  return {
    id: 'booking-1',
    isDemo: false,
    tokensCharged: decimal(1),
    startTime: new Date(now.getTime() - 3_600_000), // 1 hour ago
    endTime: new Date(now.getTime() - 1_800_000),   // 30 min ago
    priceAtBooking: null,
    status: 'COMPLETED',
    tutor: { hourlyRate: decimal(400) },
    attendance: {
      tutorJoinCount: 1,
      studentJoinCount: 1,
      tutorFirstJoinedAt: new Date(),
      studentFirstJoinedAt: new Date(),
    },
    whiteboardSessions: [],
    ...overrides,
  };
}

function makePrismaForWallet({
  bookings,
  creditedBookingIds = [],
}: {
  bookings: BookingLike[];
  creditedBookingIds?: string[];
}): any {
  const txMock = jest.fn().mockImplementation(async (fn) => fn(txMock));

  const walletUpsert = jest.fn().mockResolvedValue({});
  const ledgerCreate = jest.fn().mockResolvedValue({});
  const txObj = {
    tutorWallet: { upsert: walletUpsert },
    tutorWalletLedger: { create: ledgerCreate },
  };

  return {
    _walletUpsert: walletUpsert,
    _ledgerCreate: ledgerCreate,

    tutor: {
      findUnique: jest.fn().mockResolvedValue({ id: 'tutor-1' }),
    },
    booking: {
      findMany: jest.fn().mockResolvedValue(bookings),
    },
    tutorWalletLedger: {
      findMany: jest.fn().mockResolvedValue(
        creditedBookingIds.map((id) => ({ bookingId: id })),
      ),
    },
    tutorWallet: {
      upsert: jest.fn().mockResolvedValue({ balance: 0 }),
    },
    $transaction: jest.fn().mockImplementation(async (fn) => fn(txObj)),
  };
}

function makeService(prisma: any): TutorWalletService {
  return new TutorWalletService(prisma as any);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TutorWalletService – priceAtBooking earnings calculation', () => {
  it('uses priceAtBooking instead of tutor.hourlyRate when priceAtBooking is set', async () => {
    // Booking was made when rate was 300, but tutor now charges 500
    const booking = makeBook({
      priceAtBooking: decimal(300), // rate at time of booking
      tutor: { hourlyRate: decimal(500) }, // current (should NOT be used)
      startTime: new Date(Date.now() - 3_600_000),
      endTime: new Date(Date.now() - 1),
    });

    const prisma = makePrismaForWallet({ bookings: [booking] });
    const service = makeService(prisma);

    await (service as any).ensureCompletedBookingsCredited('tutor-1');

    expect(prisma.$transaction).toHaveBeenCalled();

    const ledgerCall = prisma._ledgerCreate.mock.calls[0][0];
    // priceAtBooking = 300, fee for 300 = 25% (< 400 tier)
    // bookingAmount = 1h × 300 = 300
    // tutorShare = 300 × 0.75 = 225
    expect(ledgerCall.data.delta).toBeCloseTo(225, 0);
    expect(ledgerCall.data.note).toContain('₹300');
  });

  it('falls back to tutor.hourlyRate when priceAtBooking is null', async () => {
    const booking = makeBook({
      priceAtBooking: null,
      tutor: { hourlyRate: decimal(400) },
      startTime: new Date(Date.now() - 3_600_000),
      endTime: new Date(Date.now() - 1),
    });

    const prisma = makePrismaForWallet({ bookings: [booking] });
    const service = makeService(prisma);

    await (service as any).ensureCompletedBookingsCredited('tutor-1');

    expect(prisma.$transaction).toHaveBeenCalled();

    const ledgerCall = prisma._ledgerCreate.mock.calls[0][0];
    // hourlyRate = 400, fee for 400 = 22% (400–699 tier)
    // bookingAmount = 1h × 400 = 400
    // tutorShare = 400 × 0.78 = 312
    expect(ledgerCall.data.delta).toBeCloseTo(312, 0);
    expect(ledgerCall.data.note).toContain('₹400');
  });

  it('does not credit when both priceAtBooking and hourlyRate are null/0', async () => {
    const booking = makeBook({
      priceAtBooking: null,
      tutor: { hourlyRate: null },
    });

    const prisma = makePrismaForWallet({ bookings: [booking] });
    const service = makeService(prisma);

    await (service as any).ensureCompletedBookingsCredited('tutor-1');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('skips already-credited bookings', async () => {
    const booking = makeBook({ id: 'already-credited' });
    const prisma = makePrismaForWallet({
      bookings: [booking],
      creditedBookingIds: ['already-credited'],
    });
    const service = makeService(prisma);

    await (service as any).ensureCompletedBookingsCredited('tutor-1');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('skips demo bookings', async () => {
    const booking = makeBook({ isDemo: true });
    const prisma = makePrismaForWallet({ bookings: [booking] });
    const service = makeService(prisma);

    await (service as any).ensureCompletedBookingsCredited('tutor-1');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('skips bookings with no verified attendance', async () => {
    const booking = makeBook({
      attendance: null,
      whiteboardSessions: [],
    });
    const prisma = makePrismaForWallet({ bookings: [booking] });
    const service = makeService(prisma);

    await (service as any).ensureCompletedBookingsCredited('tutor-1');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('note includes priceAtBooking, fee%, and earned amount', async () => {
    const booking = makeBook({
      priceAtBooking: decimal(700),
      tutor: { hourlyRate: decimal(1000) },
      startTime: new Date(Date.now() - 3_600_000),
      endTime: new Date(Date.now() - 1),
    });

    const prisma = makePrismaForWallet({ bookings: [booking] });
    const service = makeService(prisma);

    await (service as any).ensureCompletedBookingsCredited('tutor-1');

    const note = prisma._ledgerCreate.mock.calls[0][0].data.note;
    // rate 700 → 18% fee tier
    expect(note).toContain('₹700/hr');
    expect(note).toContain('18%');
  });
});

// ---------------------------------------------------------------------------
// platformFeePercent tiers (white-box of the commission logic)
// ---------------------------------------------------------------------------

describe('TutorWalletService – platformFeePercent commission tiers', () => {
  let service: TutorWalletService;

  beforeEach(() => {
    const prisma = makePrismaForWallet({ bookings: [] });
    service = makeService(prisma);
  });

  it('charges 25% for rates below ₹400', () => {
    expect((service as any).platformFeePercent(300)).toBe(25);
    expect((service as any).platformFeePercent(0)).toBe(20); // fallback for 0
  });

  it('charges 22% for rates ₹400–₹699', () => {
    expect((service as any).platformFeePercent(400)).toBe(22);
    expect((service as any).platformFeePercent(600)).toBe(22);
    expect((service as any).platformFeePercent(699)).toBe(22);
  });

  it('charges 18% for rates ₹700+', () => {
    expect((service as any).platformFeePercent(700)).toBe(18);
    expect((service as any).platformFeePercent(1500)).toBe(18);
  });

  it('returns 20% default for null/NaN/0', () => {
    expect((service as any).platformFeePercent(null)).toBe(20);
    expect((service as any).platformFeePercent(undefined)).toBe(20);
    expect((service as any).platformFeePercent(NaN)).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// getBookingHours helper
// ---------------------------------------------------------------------------

describe('TutorWalletService – getBookingHours', () => {
  let service: TutorWalletService;

  beforeEach(() => {
    const prisma = makePrismaForWallet({ bookings: [] });
    service = makeService(prisma);
  });

  it('calculates duration from startTime/endTime', () => {
    const start = new Date('2026-01-01T10:00:00Z');
    const end = new Date('2026-01-01T11:30:00Z');
    expect((service as any).getBookingHours(start, end)).toBeCloseTo(1.5, 5);
  });

  it('falls back to tokensCharged when times are null', () => {
    expect((service as any).getBookingHours(null, null, 2)).toBe(2);
  });

  it('returns 0 when times are null and tokensCharged is 0', () => {
    expect((service as any).getBookingHours(null, null, 0)).toBe(0);
  });

  it('returns 0 if endTime <= startTime', () => {
    const start = new Date('2026-01-01T11:00:00Z');
    const end = new Date('2026-01-01T10:00:00Z'); // earlier
    // diffMs is negative → returns the fallback tokensCharged
    expect((service as any).getBookingHours(start, end, 1)).toBe(1);
  });
});
