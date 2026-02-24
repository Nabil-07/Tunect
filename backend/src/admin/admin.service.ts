import { Prisma, PrismaPromise, AuditEntityType, BookingStatus, PaymentStatus, TutorStatus, TokenReason, KycStatus } from '@prisma/client';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationDto } from './dto/pagination.dto';
import { SetTutorStatusDto } from './dto/set-tutor-status.dto';
import { AdjustTokensDto } from './dto/adjust-tokens.dto';
import { TokenLedgerService } from '../tokens/token-ledger.service';
import { AuditService } from '../audit/audit.service';
import { extractAuditInfo } from '../common/audit-helper';
import { Request } from 'express';
import { PolicyConfigService } from '../policy-config/policy-config.service';
import type { PolicyConfig } from '../policy-config/default-policy-config';

function toNum(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  return Number((v as any)?.toString?.() ?? v ?? 0);
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  private readonly cache = new Map<string, { value: unknown; expiresAt: number }>();
  private readonly cacheTtlMs = 30_000;
  private readonly studentTermsAction = 'TERMS_ACCEPTED_STUDENT';
  private readonly tutorTermsAction = 'TERMS_ACCEPTED_TUTOR';

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: TokenLedgerService,
    private readonly audit: AuditService,
    private readonly policyConfig: PolicyConfigService,
  ) {}

  private getFromCache<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      return undefined;
    }
    this.logger.debug(`cache hit: ${key}`);
    return entry.value as T;
  }

  private setCache(key: string, value: unknown) {
    this.cache.set(key, { value, expiresAt: Date.now() + this.cacheTtlMs });
  }

  private parseTermsVersion(afterData: unknown): number | null {
    if (!afterData || typeof afterData !== 'object') return null;
    const value = (afterData as any)?.version;
    if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value);
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return Math.floor(parsed);
    }
    return null;
  }

  private async getLatestTermsByUserIds(userIds: string[]) {
    if (!userIds.length) return new Map<string, { accepted: boolean; version: number | null; acceptedAt: Date | null }>();

    const rows = await this.prisma.auditLog.findMany({
      where: {
        adminId: { in: userIds },
        entityType: AuditEntityType.USER,
        action: { in: [this.studentTermsAction, this.tutorTermsAction] },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        adminId: true,
        action: true,
        createdAt: true,
        afterData: true,
      },
    });

    const map = new Map<string, { accepted: boolean; version: number | null; acceptedAt: Date | null }>();
    for (const row of rows) {
      const key = `${row.adminId}:${row.action}`;
      if (map.has(key)) continue;
      map.set(key, {
        accepted: true,
        version: this.parseTermsVersion(row.afterData),
        acceptedAt: row.createdAt,
      });
    }
    return map;
  }

  // ---------- Dashboard ----------
  async dashboard() {
    const cacheKey = 'GET /admin/dashboard';
    const cached = this.getFromCache<any>(cacheKey);
    if (cached) return cached;

    const [users, tutors, students, bookings, payments, revenueMinor] = await this.prisma.$transaction([
      this.prisma.user.count(),
      this.prisma.tutor.count(),
      this.prisma.student.count(),
      this.prisma.booking.count(),
      this.prisma.payment.count({ where: { status: PaymentStatus.SUCCEEDED } }),
      this.prisma.payment.aggregate({
        where: { status: PaymentStatus.SUCCEEDED },
        _sum: { amountInMinor: true },
      }),
    ]);

    const latestSignups = await this.prisma.user.findMany({
      orderBy: { createdAt: 'asc' }, // or 'desc' if you prefer newest first
      take: 10,
      select: { id: true, email: true, role: true, createdAt: true },
    });

    const pendingKyc = await this.prisma.kycDocument.count({
      where: { status: KycStatus.PENDING },
    });

    const result = {
      totals: {
        users, tutors, students, bookings, payments,
        revenueInMinor: revenueMinor._sum.amountInMinor ?? 0,
      },
      latestSignups,
      pendingKyc,
    };

    this.setCache(cacheKey, result);
    return result;
  }

  // ---------- Lists with pagination ----------
  private paginate(q: PaginationDto) {
    const page = Math.max(q.page ?? 1, 1);
    const pageSize = Math.min(100, Math.max(q.pageSize ?? 20, 1));
    const skip = (page - 1) * pageSize;
    return { page, pageSize, skip };
  }

  async listUsers(q: PaginationDto) {
    const { page, pageSize, skip } = this.paginate(q);

    const where: Prisma.UserWhereInput | undefined = q.q
      ? { email: { contains: q.q, mode: Prisma.QueryMode.insensitive } }
      : undefined;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where, skip, take: pageSize, orderBy: { createdAt: 'desc' },
        select: { id: true, email: true, role: true, createdAt: true },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  async listTutors(q: PaginationDto & { status?: TutorStatus }) {
    const cacheKey = `GET /admin/tutors ${JSON.stringify(q || {})}`;
    const cached = this.getFromCache<any>(cacheKey);
    if (cached) return cached;

    const { page, pageSize, skip } = this.paginate(q);

    const where: Prisma.TutorWhereInput = (() => {
      const w: Prisma.TutorWhereInput = {
        user: { is: { deletedAt: null } }, // exclude deactivated/deleted users
      };
      if (q.status) w.status = q.status;
      if (q.q) {
        w.OR = [
          { bio: { contains: q.q, mode: Prisma.QueryMode.insensitive } },
          { user: { is: { email: { contains: q.q, mode: Prisma.QueryMode.insensitive }, deletedAt: null } } },
        ];
      }
      return w;
    })();

    const [items, total] = await this.prisma.$transaction([
      this.prisma.tutor.findMany({
        where, skip, take: pageSize, orderBy: { updatedAt: 'desc' },
        select: {
          id: true, bio: true, hourlyRate: true, status: true, subjects: true, createdAt: true, demeritPoints: true, isTrending: true,
          user: { select: { id: true, email: true, name: true, isBanned: true, bannedScope: true, bannedAt: true } },
        },
      }),
      this.prisma.tutor.count({ where }),
    ]);

    const tutorUserIds = items.map((t) => t.user.id);
    const strikeCounts = tutorUserIds.length
      ? await this.prisma.piiViolationLog.groupBy({
          by: ['userId'],
          where: { userId: { in: tutorUserIds } },
          _count: { _all: true },
        })
      : [];
    const strikeMap = new Map(strikeCounts.map((row) => [row.userId, row._count._all]));
    const latestTermsMap = await this.getLatestTermsByUserIds(tutorUserIds);

    const enriched = items.map((item) => ({
      ...item,
      user: {
        ...item.user,
        piiStrikes: strikeMap.get(item.user.id) ?? 0,
        piiMaxStrikes: 3,
        terms: latestTermsMap.get(`${item.user.id}:${this.tutorTermsAction}`) ?? {
          accepted: false,
          version: null,
          acceptedAt: null,
        },
      },
    }));

    const result = { items: enriched, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
    this.setCache(cacheKey, result);
    return result;
  }

  async setTutorStatus(tutorId: string, dto: SetTutorStatusDto, adminId: string, req?: Request) {
    const before = await this.prisma.tutor.findUnique({ where: { id: tutorId }, select: { id: true, status: true } });
    if (!before) throw new NotFoundException('Tutor not found');
    const updated = await this.prisma.tutor.update({
      where: { id: tutorId },
      data: { status: dto.status },
      select: { id: true, status: true, updatedAt: true },
    });
    
    const auditInfo = req ? extractAuditInfo(req) : { endpoint: undefined, ipAddress: undefined };
    this.audit.log({
      adminId,
      action: 'TUTOR_STATUS_UPDATE',
      entityType: AuditEntityType.TUTOR,
      entityId: tutorId,
      beforeData: { status: before.status },
      afterData: { status: dto.status },
      endpoint: auditInfo.endpoint,
      ipAddress: auditInfo.ipAddress,
    });
    return updated;
  }

  async setTutorTrending(tutorId: string, isTrending: boolean, adminId: string, req?: Request) {
    const before = await this.prisma.tutor.findUnique({ where: { id: tutorId }, select: { id: true, isTrending: true } });
    if (!before) throw new NotFoundException('Tutor not found');
    const updated = await this.prisma.tutor.update({
      where: { id: tutorId },
      data: { isTrending },
      select: { id: true, isTrending: true, updatedAt: true },
    });

    const auditInfo = req ? extractAuditInfo(req) : { endpoint: undefined, ipAddress: undefined };
    this.audit.log({
      adminId,
      action: 'TUTOR_TRENDING_UPDATE',
      entityType: AuditEntityType.TUTOR,
      entityId: tutorId,
      beforeData: { isTrending: before.isTrending },
      afterData: { isTrending },
      endpoint: auditInfo.endpoint,
      ipAddress: auditInfo.ipAddress,
    });

    // Invalidate trending cache
    this.cache.delete('GET /admin/tutors {}');
    return updated;
  }

  async listStudents(q: PaginationDto) {
    const cacheKey = `GET /admin/students ${JSON.stringify(q || {})}`;
    const cached = this.getFromCache<any>(cacheKey);
    if (cached) return cached;

    const { page, pageSize, skip } = this.paginate(q);

    const where: Prisma.StudentWhereInput = (() => {
      const w: Prisma.StudentWhereInput = {
        user: { is: { deletedAt: null } }, // exclude deactivated/deleted users
      };
      if (q.q) {
        w.OR = [
          { user: { is: { email: { contains: q.q, mode: Prisma.QueryMode.insensitive }, deletedAt: null } } },
          { grade: { contains: q.q, mode: Prisma.QueryMode.insensitive } },
        ];
      }
      return w;
    })();

    const [items, total] = await this.prisma.$transaction([
      this.prisma.student.findMany({
        where, skip, take: pageSize, orderBy: { createdAt: 'desc' },
        select: {
          id: true, grade: true, tokens: true, createdAt: true,
          user: { select: { id: true, email: true, name: true, isBanned: true, bannedScope: true, bannedAt: true } },
        },
      }),
      this.prisma.student.count({ where }),
    ]);

    const studentIds = items.map((s) => s.id);
    const tokenSums = studentIds.length
      ? await this.prisma.tokenLedger.groupBy({
          by: ['studentId'],
          where: { studentId: { in: studentIds } },
          _sum: { delta: true },
        })
      : [];
    const tokenSumMap = new Map(tokenSums.map((row) => [row.studentId, toNum(row._sum.delta)]));

    const studentUserIds = items.map((s) => s.user.id);
    const studentStrikeCounts = studentUserIds.length
      ? await this.prisma.piiViolationLog.groupBy({
          by: ['userId'],
          where: { userId: { in: studentUserIds } },
          _count: { _all: true },
        })
      : [];
    const studentStrikeMap = new Map(studentStrikeCounts.map((row) => [row.userId, row._count._all]));
    const latestTermsMap = await this.getLatestTermsByUserIds(studentUserIds);

    const enriched = items.map((item) => ({
      ...item,
      tokens: tokenSumMap.get(item.id) ?? 0,
      user: {
        ...item.user,
        piiStrikes: studentStrikeMap.get(item.user.id) ?? 0,
        piiMaxStrikes: 3,
        terms: latestTermsMap.get(`${item.user.id}:${this.studentTermsAction}`) ?? {
          accepted: false,
          version: null,
          acceptedAt: null,
        },
      },
    }));

    const result = { items: enriched, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
    this.setCache(cacheKey, result);
    return result;
  }

  async getStudentDetail(studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            createdAt: true,
            updatedAt: true,
            isBanned: true,
            bannedScope: true,
            bannedAt: true,
          },
        },
        bookings: {
          orderBy: { createdAt: 'desc' },
          take: 100,
          include: {
            tutor: {
              include: {
                user: {
                  select: {
                    id: true,
                    email: true,
                    name: true,
                  },
                },
              },
            },
            review: {
              select: {
                rating: true,
                comment: true,
                createdAt: true,
              },
            },
          },
        },
        tutorTokenBalances: {
          include: {
            tutor: {
              include: {
                user: {
                  select: {
                    id: true,
                    email: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
        tokenLedger: {
          orderBy: { createdAt: 'desc' },
          take: 100,
          include: {
            tutor: {
              include: {
                user: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
        tokenTransferRequests: {
          orderBy: { createdAt: 'desc' },
          include: {
            fromTutor: {
              include: { user: { select: { name: true } } },
            },
            toTutor: {
              include: { user: { select: { name: true } } },
            },
            admin: {
              select: { email: true },
            },
          },
        },
        refundRequests: {
          orderBy: { createdAt: 'desc' },
          include: {
            tutor: {
              include: { user: { select: { name: true } } },
            },
            admin: {
              select: { email: true },
            },
          },
        },
        assignments: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: {
            tutor: {
              include: { user: { select: { name: true } } },
            },
          },
        },
        certificates: {
          orderBy: { issuedAt: 'desc' },
          include: {
            tutor: {
              include: { user: { select: { name: true } } },
            },
          },
        },
        progress: {
          orderBy: { updatedAt: 'desc' },
        },
      },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const tokenTotal = await this.prisma.tokenLedger.aggregate({
      where: { studentId },
      _sum: { delta: true },
    });
    const liveTokens = toNum(tokenTotal._sum.delta);

    const userId = student.user.id;

    // Enhance tutorTokenBalances with expiration info
    const tutorTokenBalancesWithExpiry = await Promise.all(
      student.tutorTokenBalances.map(async (balance) => {
        const earliestExpiry = await this.prisma.tokenLedger.findFirst({
          where: {
            studentId,
            tutorId: balance.tutorId,
            reason: 'PURCHASED' as TokenReason,
            expiresAt: { not: null },
            delta: { gt: 0 },
          },
          select: {
            expiresAt: true,
          },
          orderBy: { expiresAt: 'asc' },
        });

        return {
          ...balance,
          expiresAt: earliestExpiry?.expiresAt || null,
          daysUntilExpiry: earliestExpiry?.expiresAt 
            ? Math.ceil((earliestExpiry.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
            : null,
        };
      }),
    );

    // Get purchase history (payments)
    const payments = await this.prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        amountInMinor: true,
        currency: true,
        tokensPurchased: true,
        status: true,
        provider: true,
        providerOrderId: true,
        createdAt: true,
      },
    });

    // Get conversations and messages
    const conversations = await this.prisma.conversation.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        tutor: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
          },
        },
      },
    });

    return {
      ...student,
      tokens: liveTokens,
      tutorTokenBalances: tutorTokenBalancesWithExpiry,
      payments,
      conversations,
    };
  }

  async getTutorDetail(tutorId: string) {
    const tutor = await this.prisma.tutor.findUnique({
      where: { id: tutorId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            createdAt: true,
            updatedAt: true,
            isBanned: true,
            bannedScope: true,
            bannedAt: true,
          },
        },
        bookings: {
          orderBy: { createdAt: 'desc' },
          take: 100,
          include: {
            student: {
              include: {
                user: {
                  select: {
                    id: true,
                    email: true,
                    name: true,
                  },
                },
              },
            },
            review: {
              select: {
                rating: true,
                comment: true,
                createdAt: true,
              },
            },
          },
        },
        wallet: {
          select: {
            balance: true,
            updatedAt: true,
          },
        },
        walletLedger: {
          orderBy: { createdAt: 'desc' },
          take: 100,
          select: {
            id: true,
            delta: true,
            reason: true,
            createdAt: true,
            bookingId: true,
          },
        },
        payouts: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: {
            id: true,
            amount: true,
            status: true,
            reference: true,
            createdAt: true,
          },
        },
        reviews: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: {
            booking: {
              include: {
                student: {
                  include: {
                    user: {
                      select: {
                        email: true,
                        name: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        assignments: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: {
            student: {
              include: {
                user: {
                  select: {
                    email: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
        kycDocs: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            docType: true,
            url: true,
            status: true,
            notes: true,
            createdAt: true,
          },
        },
        kycApplications: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!tutor) {
      throw new NotFoundException('Tutor not found');
    }

    // Get conversations and messages
    const conversations = await this.prisma.conversation.findMany({
      where: { tutorId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        student: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
          },
        },
      },
    });

    return {
      ...tutor,
      conversations,
    };
  }

  async listBookings(q: PaginationDto & { status?: BookingStatus; type?: string; dateFrom?: string; dateTo?: string; sortBy?: string; sortDir?: string }) {
    const { page, pageSize, skip } = this.paginate(q);

    const where: Prisma.BookingWhereInput | undefined = (() => {
      const w: Prisma.BookingWhereInput = {};
      if (q.status) w.status = q.status;
      if (q.type === 'demo') w.isDemo = true;
      if (q.type === 'paid') w.isDemo = false;
      if (q.dateFrom || q.dateTo) {
        w.startTime = {};
        if (q.dateFrom) w.startTime.gte = new Date(q.dateFrom);
        if (q.dateTo) {
          const endDate = new Date(q.dateTo);
          endDate.setHours(23, 59, 59, 999);
          w.startTime.lte = endDate;
        }
      }
      if (q.q) {
        w.OR = [
          { tutor: { is: { user: { is: { email: { contains: q.q, mode: Prisma.QueryMode.insensitive } } } } } },
          { student: { is: { user: { is: { email: { contains: q.q, mode: Prisma.QueryMode.insensitive } } } } } },
          { tutor: { is: { user: { is: { name: { contains: q.q, mode: Prisma.QueryMode.insensitive } } } } } },
          { student: { is: { user: { is: { name: { contains: q.q, mode: Prisma.QueryMode.insensitive } } } } } },
        ];
      }
      return Object.keys(w).length ? w : undefined;
    })();

    // Build dynamic orderBy with null-aware sorting
    // asc: nulls first, then data ascending | desc: data descending, then nulls last
    const sortDir = q.sortDir === 'asc' ? 'asc' : 'desc';
    const nulls = sortDir === 'asc' ? 'first' : 'last';
    let orderBy: any = { startTime: { sort: 'desc' as const, nulls: 'last' as const } };
    if (q.sortBy === 'startTime') orderBy = { startTime: { sort: sortDir, nulls } };
    else if (q.sortBy === 'createdAt') orderBy = { createdAt: { sort: sortDir, nulls } };
    else if (q.sortBy === 'status') orderBy = { status: sortDir };
    else if (q.sortBy === 'id') orderBy = { id: sortDir };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.booking.findMany({
        where, skip, take: pageSize, orderBy,
        select: {
          id: true, startTime: true, endTime: true, status: true, isDemo: true, createdAt: true,
          tokensCharged: true, refundProcessed: true,
          tutor: { select: { id: true, user: { select: { email: true, name: true } } } },
          student: { select: { id: true, user: { select: { email: true, name: true } } } },
          attendance: { select: { studentFirstJoinedAt: true, tutorFirstJoinedAt: true, classStartedAt: true } },
          whiteboardSessions: { select: { data: true }, take: 1 },
        },
      }),
      this.prisma.booking.count({ where }),
    ]);

    const enriched = items.map((item) => {
      const wbData = item.whiteboardSessions?.[0]?.data as any;
      const att = wbData?.attendance;

      const studentJoinedAt = item.attendance?.studentFirstJoinedAt
        ? item.attendance.studentFirstJoinedAt.toISOString()
        : (att?.studentJoinedAt ?? null);
      const tutorJoinedAt = item.attendance?.tutorFirstJoinedAt
        ? item.attendance.tutorFirstJoinedAt.toISOString()
        : (att?.tutorJoinedAt ?? null);
      const startedAt = item.attendance?.classStartedAt
        ? item.attendance.classStartedAt.toISOString()
        : (att?.startedAt ?? null);

      return {
        id: item.id,
        startTime: item.startTime,
        endTime: item.endTime,
        status: item.status,
        isDemo: item.isDemo,
        createdAt: item.createdAt,
        tokensCharged: item.tokensCharged,
        refundProcessed: item.refundProcessed,
        tutor: item.tutor,
        student: item.student,
        attendance:
          studentJoinedAt || tutorJoinedAt || startedAt
            ? { studentJoinedAt, tutorJoinedAt, startedAt }
            : null,
      };
    });

    return { items: enriched, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  async listPayments(q: PaginationDto & { status?: PaymentStatus }) {
    const { page, pageSize, skip } = this.paginate(q);

    const where: Prisma.PaymentWhereInput | undefined = (() => {
      const w: Prisma.PaymentWhereInput = {};
      if (q.status) w.status = q.status;
      if (q.q) w.user = { is: { email: { contains: q.q, mode: Prisma.QueryMode.insensitive } } };
      return Object.keys(w).length ? w : undefined;
    })();

    const [items, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where, skip, take: pageSize, orderBy: { createdAt: 'desc' },
        select: {
          id: true, userId: true, amountInMinor: true, currency: true, tokensPurchased: true,
          status: true, provider: true, providerOrderId: true, providerPaymentId: true, createdAt: true,
          user: { select: { email: true } },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return { items, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  // ---------- Manual token adjustment ----------
  async adjustTokens(dto: AdjustTokensDto, adminId: string, req?: Request) {
    const student = await this.prisma.student.findUnique({
      where: { id: dto.studentId },
      select: { id: true, tokens: true },
    });
    if (!student) throw new NotFoundException('Student not found');
    if (dto.amount === 0) throw new BadRequestException('Amount cannot be zero');

    const beforeTokens = Number(student.tokens);

    // Update student balance
    await this.prisma.student.update({
      where: { id: student.id },
      data: { tokens: { increment: dto.amount } },
    });

    // Ledger entry (positive = credit, negative = debit)
    await this.prisma.tokenLedger.create({
      data: {
        studentId: student.id,
        delta: dto.amount, // Prisma Decimal handled by client
        reason: TokenReason.ADMIN_ADJUSTMENT,
        paymentId: null,
        bookingId: null,
      },
    });

    const afterTokens = beforeTokens + dto.amount;
    const auditInfo = req ? extractAuditInfo(req) : { endpoint: undefined, ipAddress: undefined };
    this.audit.log({
      adminId,
      action: 'TOKEN_ADJUSTMENT',
      entityType: AuditEntityType.TOKEN,
      entityId: student.id,
      beforeData: { tokens: beforeTokens, studentId: student.id },
      afterData: { tokens: afterTokens, delta: dto.amount, reason: dto.reason },
      endpoint: auditInfo.endpoint,
      ipAddress: auditInfo.ipAddress,
    });

    return { ok: true };
  }

  async unbanUser(userId: string, adminId: string, req?: Request) {
    const before = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isBanned: true, bannedScope: true, bannedAt: true },
    });
    if (!before) throw new NotFoundException('User not found');

    // Reduce strikes by one (if any) so the user has room for another warning
    const latestViolation = await this.prisma.piiViolationLog.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    const operations: PrismaPromise<any>[] = [
      this.prisma.user.update({
        where: { id: userId },
        data: {
          isBanned: false,
          bannedScope: null,
          bannedAt: null,
        },
      }),
      this.prisma.banLedger.updateMany({
        where: {
          userId,
          isActive: true,
        },
        data: {
          isActive: false,
          liftedAt: new Date(),
          liftReason: 'ADMIN_UNBAN',
        },
      }),
    ];

    if (latestViolation) {
      operations.push(
        this.prisma.piiViolationLog.delete({ where: { id: latestViolation.id } }),
      );
    }

    await this.prisma.$transaction(operations);

    const auditInfo = req ? extractAuditInfo(req) : { endpoint: undefined, ipAddress: undefined };
    this.audit.log({
      adminId,
      action: 'USER_UNBAN',
      entityType: AuditEntityType.USER,
      entityId: userId,
      beforeData: { isBanned: before.isBanned, bannedScope: before.bannedScope, bannedAt: before.bannedAt },
      afterData: { isBanned: false, bannedScope: null, bannedAt: null },
      endpoint: auditInfo.endpoint,
      ipAddress: auditInfo.ipAddress,
    });

    return { ok: true, message: 'User has been unbanned successfully', strikesCleared: latestViolation ? 1 : 0 };
  }

  async getPolicyConfig() {
    return this.policyConfig.getAdminConfig();
  }

  async updatePolicyConfig(partial: Partial<PolicyConfig>, adminId: string, req?: Request) {
    return this.policyConfig.updateConfig(partial, adminId, req);
  }

  // ---------- Admin User Management ----------

  async listAdminUsers(q: PaginationDto) {
    const { page, pageSize, skip } = this.paginate(q);

    const where: Prisma.UserWhereInput = { role: 'ADMIN' };
    if (q.q) {
      where.OR = [
        { email: { contains: q.q, mode: Prisma.QueryMode.insensitive } },
        { name: { contains: q.q, mode: Prisma.QueryMode.insensitive } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where, skip, take: pageSize, orderBy: { createdAt: 'desc' },
        select: {
          id: true, email: true, name: true, role: true,
          isDirector: true, createdAt: true, updatedAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  async getAdminUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, name: true, role: true,
        isDirector: true, createdAt: true, updatedAt: true,
      },
    });
    if (!user) throw new NotFoundException('Admin user not found');
    if (user.role !== 'ADMIN') throw new BadRequestException('User is not an admin');
    return user;
  }

  async toggleDirectorAccess(userId: string, isDirector: boolean, adminId: string, req?: Request) {
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, isDirector: true },
    });
    if (!target) throw new NotFoundException('User not found');
    if (target.role !== 'ADMIN') throw new BadRequestException('User is not an admin');
    if (target.id === adminId) throw new BadRequestException('You cannot change your own director status');

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { isDirector },
      select: { id: true, email: true, name: true, isDirector: true },
    });

    const auditInfo = req ? extractAuditInfo(req) : { endpoint: undefined, ipAddress: undefined };
    this.audit.log({
      adminId,
      action: 'DIRECTOR_ACCESS_TOGGLE',
      entityType: AuditEntityType.USER,
      entityId: userId,
      beforeData: { isDirector: target.isDirector },
      afterData: { isDirector },
      endpoint: auditInfo.endpoint,
      ipAddress: auditInfo.ipAddress,
    });

    return { ok: true, user: updated };
  }
}
