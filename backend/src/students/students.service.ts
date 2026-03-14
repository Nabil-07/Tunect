import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BookingStatus, Prisma, TokenReason } from '@prisma/client';
import { UploadsService } from '../uploads/uploads.service';
import { EncryptionService } from '../common/services/encryption.service';
import { NotificationsService } from '../notifications/notifications.service';

function toNum(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  return Number((v as any)?.toString?.() ?? v ?? 0);
}

function parseAttendance(data: unknown): { studentJoinedAt?: string; tutorJoinedAt?: string } {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const attendance = (data as any).attendance;
  if (!attendance || typeof attendance !== 'object' || Array.isArray(attendance)) return {};
  const att = attendance as Record<string, unknown>;
  return {
    studentJoinedAt: typeof att.studentJoinedAt === 'string' ? att.studentJoinedAt : undefined,
    tutorJoinedAt: typeof att.tutorJoinedAt === 'string' ? att.tutorJoinedAt : undefined,
  };
}

function hasVerifiedAttendance(data: unknown): boolean {
  const attendance = parseAttendance(data);
  return !!attendance.studentJoinedAt && !!attendance.tutorJoinedAt;
}

function hasStudentAttendance(data: unknown): boolean {
  const attendance = parseAttendance(data);
  return !!attendance.studentJoinedAt;
}

function hasStudentAttendanceDb(attendanceRow: any): boolean {
  return (
    !!attendanceRow?.studentFirstJoinedAt ||
    (Number(attendanceRow?.studentJoinCount ?? 0) > 0)
  );
}

function buildUserUpdates(
  data: { name?: string; phone?: string },
  canEdit: (field: string) => boolean,
): { name?: string; phone?: string | null } {
  const updates: { name?: string; phone?: string | null } = {};
  if (typeof data.name === 'string' && canEdit('name')) updates.name = data.name;
  if (data.phone !== undefined && canEdit('phone')) updates.phone = data.phone || null;
  return updates;
}

function buildStudentUpdates(
  data: { grade?: string; board?: string; bio?: string; timezone?: string; preferredLanguage?: string; marksheetUrl?: string },
  canEdit: (field: string) => boolean,
): {
  grade?: string; board?: string; bio?: string;
  timezone?: string | null; preferredLanguage?: string | null; marksheetUrl?: string | null;
} {
  const updates: ReturnType<typeof buildStudentUpdates> = {};
  if (data.grade !== undefined && canEdit('grade')) updates.grade = data.grade;
  if (data.board !== undefined && canEdit('board')) updates.board = data.board;
  if (typeof data.bio === 'string' && canEdit('bio')) updates.bio = data.bio;
  if (data.timezone !== undefined && canEdit('timezone')) updates.timezone = data.timezone || null;
  if (data.preferredLanguage !== undefined && canEdit('preferredLanguage'))
    updates.preferredLanguage = data.preferredLanguage || null;
  if (data.marksheetUrl !== undefined && canEdit('marksheet'))
    updates.marksheetUrl = data.marksheetUrl || null;
  return updates;
}

@Injectable()
export class StudentsService {
  private readonly logger = new Logger(StudentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadsService: UploadsService,
    private readonly encryptionService: EncryptionService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Helper method to ensure student profile exists, auto-creating if needed
   * @param userId - The user ID to check
   * @returns The student ID
   */
  private async ensureStudentProfile(userId: string): Promise<string> {
    let student = await this.prisma.student.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!student) {
      // Verify user exists and has STUDENT role
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, role: true },
      });
      if (!user) {
        throw new NotFoundException(`User not found: ${userId}`);
      }
      if (user.role !== 'STUDENT') {
        throw new NotFoundException(`User ${user.email} (${userId}) has role ${user.role}, not STUDENT`);
      }

      // Auto-create student profile if it doesn't exist (defensive approach)
      student = await this.prisma.student.create({
        data: { userId, tokens: 0 },
        select: { id: true },
      });
    }

    return student.id;
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        name: true,
        phone: true,
        avatarUrl: true,
        createdAt: true,
        student: {
          select: {
            id: true,
            grade: true,
            board: true,
            tokens: true,
            bio: true,
            timezone: true,
            preferredLanguage: true,
            marksheetUrl: true,
            profileStatus: true,
            adminProfileNotes: true,
            resubmissionFields: true,
            createdAt: true,
            updatedAt: true,
          } as any,
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`User not found: ${userId}`);
    }

    if (user.role !== 'STUDENT') {
      throw new NotFoundException(`User ${user.email} (${userId}) has role ${user.role}, not STUDENT`);
    }

    // Auto-create student profile if it doesn't exist (defensive approach)
    let student = user.student;
    student ??= await this.prisma.student.create({
      data: { userId, tokens: 0 },
      select: {
        id: true,
        grade: true,
        board: true,
        tokens: true,
        bio: true,
        timezone: true,
        preferredLanguage: true,
        marksheetUrl: true,
        profileStatus: true,
        adminProfileNotes: true,
        resubmissionFields: true,
        createdAt: true,
        updatedAt: true,
      } as any,
    });

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const studentId = student.id as unknown as string;

    // Count sessions attended by student that are explicitly completed,
    // or ended sessions that remained confirmed/live states
    const completedBookings = await this.prisma.booking.findMany({
      where: {
        studentId,
        OR: [
          { status: BookingStatus.COMPLETED },
          {
            status: {
              in: [BookingStatus.CONFIRMED, BookingStatus.WAITING_ROOM, BookingStatus.LIVE],
            },
            endTime: { lt: now },
          },
        ],
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        status: true,
        attendance: {
          select: {
            studentJoinCount: true,
            studentFirstJoinedAt: true,
          },
        },
        whiteboardSessions: {
          take: 1,
          select: { data: true },
        },
      },
    });

    const completedWithAttendance = completedBookings.filter((b) => {
      const attended = hasStudentAttendanceDb(b.attendance) || hasStudentAttendance(b.whiteboardSessions?.[0]?.data);
      if (!attended) return false;
      if (b.status === BookingStatus.COMPLETED) return true;
      return !!b.endTime && b.endTime < now;
    });

    const completedCount = completedWithAttendance.length;
    const monthlyCompletedBookings = completedWithAttendance.filter(
      (b) => !!b.startTime && b.startTime >= startOfMonth,
    );

    const hoursStudied = monthlyCompletedBookings.reduce((sum, b) => {
      if (!b.startTime || !b.endTime) return sum;
      return sum + (b.endTime.getTime() - b.startTime.getTime()) / 3_600_000;
    }, 0);

    // Debug logging (remove in production if needed)
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[getMe] Student ID: ${typeof student.id === 'object' ? JSON.stringify(student.id) : student.id}, completedCount=${completedCount}, monthlyCompleted=${monthlyCompletedBookings.length}, hoursStudied=${hoursStudied.toFixed(2)}`);
    }

    const studentPayload = {
      ...student,
      tokens: toNum(student.tokens),
      hoursStudied: Math.round(hoursStudied * 10) / 10,
      sessionsCompleted: completedCount,
    };

    const readableAvatarUrl = user.avatarUrl
      ? await this.uploadsService.toReadableReference(user.avatarUrl, user.id, user.role ?? undefined)
      : null;

    const encryptedAvatarUrl = readableAvatarUrl
      ? this.encryptionService.encrypt(readableAvatarUrl)
      : readableAvatarUrl;

    // Decrypt phone for current user's own profile so they can see their own number
    let decryptedPhone = user.phone ?? null;
    if (decryptedPhone) {
      try {
        const tryDecrypt = this.encryptionService.decrypt(decryptedPhone);
        if (tryDecrypt) decryptedPhone = tryDecrypt;
      } catch {
        // If decryption fails, return as-is (phone may not be encrypted)
      }
    }

    // Resolve marksheet URL for readability
    const marksheetUrl = (student as any).marksheetUrl ?? null;
    let readableMarksheetUrl = marksheetUrl;
    if (marksheetUrl) {
      try {
        readableMarksheetUrl = await this.uploadsService.toReadableReference(marksheetUrl, user.id, user.role ?? undefined);
      } catch {
        // keep original if resolution fails
      }
    }

    return {
      id: student.id,
      userId: user.id,
      bio: student.bio ?? null,
      timezone: student.timezone ?? null,
      preferredLanguage: student.preferredLanguage ?? null,
      marksheetUrl: readableMarksheetUrl,
      profileStatus: (student as any).profileStatus ?? 'PENDING',
      adminProfileNotes: (student as any).adminProfileNotes ?? null,
      resubmissionFields: (student as any).resubmissionFields ?? [],
      user: {
        id: user.id,
        name: user.name ?? null,
        email: user.email,
        phone: decryptedPhone,
        avatarUrl: encryptedAvatarUrl,
        createdAt: user.createdAt,
      },
      student: studentPayload,
    };
  }

  async patchMe(
    userId: string,
    data: {
      grade?: string;
      board?: string;
      name?: string;
      phone?: string;
      bio?: string;
      timezone?: string;
      preferredLanguage?: string;
    },
  ) {
    const studentId = await this.ensureStudentProfile(userId);

    // Check if profile is locked (APPROVED status)
    const currentStudent = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { profileStatus: true, resubmissionFields: true } as any,
    });
    const currentStatus = (currentStudent as any)?.profileStatus;
    const allowedFields: string[] = (currentStudent as any)?.resubmissionFields ?? [];
    if (currentStatus === 'APPROVED') {
      throw new ForbiddenException('Profile is approved and locked. Request resubmission from admin to make changes.');
    }

    // When RESUBMISSION_REQUESTED with specific fields, only allow those fields
    const canEdit = (field: string) =>
      currentStatus !== 'RESUBMISSION_REQUESTED' || allowedFields.length === 0 || allowedFields.includes(field);

    const userUpdates = buildUserUpdates(data as any, canEdit);
    const studentUpdates = buildStudentUpdates(data as any, canEdit);

    if (Object.keys(userUpdates).length > 0) {
      await this.prisma.user.update({ where: { id: userId }, data: userUpdates });
    }
    if (Object.keys(studentUpdates).length > 0) {
      await this.prisma.student.update({ where: { id: studentId }, data: studentUpdates });
    }

    await this.handlePostPatchStatus(studentId, userId, currentStatus);

    const updated = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, grade: true, board: true, tokens: true, updatedAt: true },
    });
    return { ...updated, tokens: toNum(updated!.tokens) };
  }

  private async handlePostPatchStatus(studentId: string, userId: string, currentStatus: string | null) {
    if (currentStatus === 'RESUBMISSION_REQUESTED') {
      await this.prisma.student.update({
        where: { id: studentId },
        data: { profileStatus: 'PENDING', adminProfileNotes: null, resubmissionFields: [] } as any,
      });
    }
    if (currentStatus === 'RESUBMISSION_REQUESTED' || currentStatus === 'PENDING' || !currentStatus) {
      this.notifyAdminsProfilePending(studentId, userId).catch((err) =>
        this.logger.warn('Failed to notify admins about profile submission', err),
      );
    }
  }

  async requestResubmission(userId: string) {
    const studentId = await this.ensureStudentProfile(userId);
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { profileStatus: true } as any,
    });
    const status = (student as any)?.profileStatus;
    if (status !== 'APPROVED') {
      throw new ForbiddenException('You can only request resubmission when your profile is approved.');
    }
    await this.prisma.student.update({
      where: { id: studentId },
      data: { profileStatus: 'PENDING', adminProfileNotes: 'Student requested profile edit.' } as any,
    });
    return { ok: true, message: 'Resubmission request sent. Your profile is now pending review.' };
  }

  private async notifyAdminsProfilePending(studentId: string, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
    const studentName = user?.name || user?.email || 'A student';
    const admins = await this.prisma.user.findMany({
      where: { role: 'ADMIN', deletedAt: null },
      select: { id: true },
    });
    const link = `/admin/students/${studentId}`;
    await Promise.allSettled(
      admins.map((admin) =>
        this.notificationsService.createSystemNotification(
          admin.id,
          'Student Profile Pending Review',
          `${studentName} has submitted their profile for approval.`,
          link,
        ),
      ),
    );
  }

  // -------- Bookings with payment enrichment + unscheduled grouping --------
  async getMyBookings(userId: string) {
    const studentId = await this.ensureStudentProfile(userId);

    const now = new Date();

    // ✅ OPTIMIZED: Single query with joins instead of N+1
    const rawBookings = await this.prisma.booking.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        status: true,
        isDemo: true,
        tokensCharged: true,
        createdAt: true,
        subject: true,
        grade: true,
        module: true,
        tutor: {
          select: {
            id: true,
            hourlyRate: true,
            user: { select: { name: true, email: true } },
          },
        },
        tokenLedger: {
          where: { paymentId: { not: null } },
          select: {
            payment: {
              select: {
                id: true,
                amountInMinor: true,
                currency: true,
                status: true,
                createdAt: true,
                providerOrderId: true,
              },
            },
          },
          take: 1,
        },
      },
    });

    // ✅ Batch check attendance: Get all whiteboard sessions for these bookings in one query
    const bookingIds = rawBookings.map((b) => b.id);
    const whiteboardSessions = await this.prisma.whiteboardSession.findMany({
      where: {
        bookingId: { in: bookingIds },
      },
      select: {
        bookingId: true,
        data: true, // Include data to filter in JavaScript
      },
    });
    // Filter to only sessions with actual data (attendance evidence)
    const attendedBookingIds = new Set(
      whiteboardSessions
        .filter((ws) => hasStudentAttendance(ws.data))
        .map((ws) => ws.bookingId),
    );

    // ✅ Also check BookingAttendance DB table (primary attendance source)
    const dbAttendanceRecords = await this.prisma.bookingAttendance.findMany({
      where: {
        bookingId: { in: bookingIds },
        OR: [
          { studentJoinCount: { gt: 0 } },
          { studentFirstJoinedAt: { not: null } },
        ],
      },
      select: { bookingId: true },
    });
    for (const record of dbAttendanceRecords) {
      attendedBookingIds.add(record.bookingId);
    }

    // ✅ Map data (no additional queries needed)
    const enriched = rawBookings.map((b) => {
      const payment = b.tokenLedger[0]?.payment
        ? {
            ...b.tokenLedger[0].payment,
            amountInMinor: toNum(b.tokenLedger[0].payment.amountInMinor),
          }
        : null;

      // Check if student attended (whiteboardSession exists = student joined LiveKit room)
      // Note: whiteboardSession is used as attendance tracking mechanism for LiveKit participation
      const hasAttended = attendedBookingIds.has(b.id);

      return {
        id: b.id,
        startTime: b.startTime,
        endTime: b.endTime,
        status: b.status,
        isDemo: b.isDemo,
        createdAt: b.createdAt,
        tokensCharged: toNum(b.tokensCharged),
        hasAttended, // Flag indicating if student joined/attended the session
        subject: b.subject ?? null,
        grade: b.grade ?? null,
        module: b.module ?? null,
        tutor: {
          id: b.tutor.id,
          hourlyRate: b.tutor.hourlyRate,
          name: b.tutor.user?.name,
          email: b.tutor.user?.email,
        },
        payment,
      };
    });

    const unscheduled = enriched.filter(
      (b) => b.status === 'PENDING' || b.status === 'PENDING_SLOT',
    );

    const upcoming = enriched.filter(
      (b) =>
        b.status === 'CONFIRMED' &&
        b.startTime &&
        b.endTime &&
        new Date(b.endTime) > now,
    );

    // Include attended sessions that are completed or have already ended
    const completed = enriched.filter((b) => {
      if (!b.hasAttended) return false;
      const hasEnded = !!b.endTime && new Date(b.endTime) < now;
      if (!hasEnded) return false;
      return (
        b.status === 'COMPLETED' ||
        b.status === 'CONFIRMED' ||
        b.status === 'WAITING_ROOM' ||
        b.status === 'LIVE'
      );
    });

    return { unscheduled, upcoming, completed, all: enriched };
  }

  // -------- Other existing methods --------

  async listAll(params: { page?: number; pageSize?: number; q?: string }) {
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize || 20));
    const skip = (page - 1) * pageSize;

    const q = params.q?.trim();
    const where: Prisma.StudentWhereInput = q
      ? {
          OR: [
            {
              user: {
                email: {
                  contains: q,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
            },
            {
              grade: {
                contains: q,
                mode: Prisma.QueryMode.insensitive,
              },
            },
          ],
        }
      : {};

    const [itemsRaw, total] = await this.prisma.$transaction([
      this.prisma.student.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          grade: true,
          tokens: true,
          createdAt: true,
          user: { select: { id: true, email: true } },
        },
      }),
      this.prisma.student.count({ where }),
    ]);

    const items = itemsRaw.map((s) => ({ ...s, tokens: toNum(s.tokens) }));

    return {
      items,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async getByIdAdmin(studentId: string) {
    const s = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        grade: true,
        tokens: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { id: true, email: true } },
      },
    });

    if (!s) throw new NotFoundException('Student not found');

    return { ...s, tokens: toNum(s.tokens) };
  }

  async getTokenBalance(userId: string) {
    const studentId = await this.ensureStudentProfile(userId);
    
    const s = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { tokens: true },
    });

    if (!s) throw new NotFoundException('Student profile not found');

    return { tokens: toNum(s.tokens ?? 0) };
  }

  async getTokenLedger(userId: string, page = 1, pageSize = 20) {
    const studentId = await this.ensureStudentProfile(userId);

    const safePage = Math.max(1, page);
    const safePageSize = Math.max(1, pageSize);
    const skip = (safePage - 1) * safePageSize;

    const [itemsRaw, total] = await this.prisma.$transaction([
      this.prisma.tokenLedger.findMany({
        where: { studentId },
        skip,
        take: safePageSize,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          delta: true,
          reason: true,
          bookingId: true,
          paymentId: true,
          createdAt: true,
        },
      }),
      this.prisma.tokenLedger.count({ where: { studentId } }),
    ]);

    const items = itemsRaw.map((it) => ({ ...it, delta: toNum(it.delta) }));

    return {
      items,
      meta: {
        page: safePage,
        pageSize: safePageSize,
        total,
        totalPages: Math.ceil(total / safePageSize),
      },
    };
  }

  async getPayments(userId: string, page = 1, pageSize = 20) {
    const safePage = Math.max(1, page);
    const safePageSize = Math.max(1, pageSize);
    const skip = (safePage - 1) * safePageSize;

    const [itemsRaw, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where: { userId },
        skip,
        take: safePageSize,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          amountInMinor: true,
          currency: true,
          status: true,
          createdAt: true,
          providerOrderId: true,
        },
      }),
      this.prisma.payment.count({ where: { userId } }),
    ]);

    const items = itemsRaw.map((p) => ({
      ...p,
      amountInMinor: toNum(p.amountInMinor),
    }));

    return {
      items,
      meta: {
        page: safePage,
        pageSize: safePageSize,
        total,
        totalPages: Math.ceil(total / safePageSize),
      },
    };
  }

  async verifyTokenInvariant(userId: string) {
    const studentId = await this.ensureStudentProfile(userId);

    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, tokens: true },
    });
    if (!student) throw new NotFoundException('Student profile not found');

    const agg = await this.prisma.tokenLedger.aggregate({
      where: { studentId },
      _sum: { delta: true },
    });

    const sum = toNum(agg._sum.delta ?? 0);
    const tokens = toNum(student.tokens);

    return {
      tokensField: tokens,
      sumOfLedger: sum,
      ok: sum === tokens,
    };
  }

  // -------- Tutor: Get my students from bookings --------
  async getTutorStudents(userId: string) {
    const tutor = await this.prisma.tutor.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!tutor) throw new NotFoundException('Tutor profile not found');

    // Get distinct students from bookings
    const bookings = await this.prisma.booking.findMany({
      where: { tutorId: tutor.id },
      select: {
        student: {
          select: {
            id: true,
            grade: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
      distinct: ['studentId'],
    });

    return bookings.map((b) => ({
      id: b.student.id,
      name: b.student.user?.name,
      email: b.student.user?.email,
      grade: b.student.grade,
      user: b.student.user,
    }));
  }

  async getTutorTokenBalances(userId: string, studentId?: string) {
    // Use studentId from JWT if available, otherwise ensure profile exists
    const studentIdToUse = studentId || await this.ensureStudentProfile(userId);

    const balances = await this.prisma.tutorTokenBalance.findMany({
      where: { 
        studentId: studentIdToUse,
        balance: { gt: 0 }, // Only fetch non-zero balances
      },
      select: {
        id: true,
        tutorId: true,
        balance: true,
        pricePerToken: true,
        tutor: {
          select: {
            id: true,
            hourlyRate: true,
            user: {
              select: {
                name: true,
                email: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
      orderBy: { balance: 'desc' },
      take: 50, // Limit to top 50 tutors
    });

    // For each tutor, get the earliest expiration date of their purchased tokens
    const balancesWithExpiration = await Promise.all(
      balances.map(async (b) => {
        const earliestExpiry = await this.prisma.tokenLedger.findFirst({
          where: {
            studentId: studentIdToUse,
            tutorId: b.tutorId,
            reason: TokenReason.PURCHASED, // Only purchased tokens expire
            expiresAt: { not: null },
            delta: { gt: 0 }, // Only count added tokens
          },
          select: {
            expiresAt: true,
          },
          orderBy: { expiresAt: 'asc' },
        });

        return {
          ...b,
          balance: toNum(b.balance),
          pricePerToken: toNum(b.pricePerToken),
          expiresAt: earliestExpiry?.expiresAt || null,
          daysUntilExpiry: earliestExpiry?.expiresAt 
            ? Math.ceil((earliestExpiry.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
            : null,
          tutor: {
            ...b.tutor,
            hourlyRate: toNum(b.tutor.hourlyRate),
          },
        };
      }),
    );

    return balancesWithExpiration;
  }

  async getTokenLedgerAll(userId: string, studentId?: string) {
    // Use studentId from JWT if available, otherwise ensure profile exists
    const studentIdToUse = studentId || await this.ensureStudentProfile(userId);

    const ledger = await this.prisma.tokenLedger.findMany({
      where: { studentId: studentIdToUse },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        studentId: true,
        tutorId: true,
        delta: true,
        reason: true,
        createdAt: true,
        tutor: {
          select: {
            user: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    return ledger.map((l) => ({
      ...l,
      delta: toNum(l.delta),
    }));
  }
}
