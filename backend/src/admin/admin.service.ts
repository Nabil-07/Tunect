import { Prisma, PrismaPromise, AuditEntityType, BookingStatus, PaymentStatus, TutorStatus, TokenReason, KycStatus } from '@prisma/client';
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationDto } from './dto/pagination.dto';
import { SetTutorStatusDto } from './dto/set-tutor-status.dto';
import { AdjustTokensDto } from './dto/adjust-tokens.dto';
import { TokenLedgerService } from '../tokens/token-ledger.service';
import { AuditService } from '../audit/audit.service';
import { extractAuditInfo } from '../common/audit-helper';
import { checkTutorProfileCompletion, checkStudentProfileCompletion } from '../users/profile-completion';
import { Request } from 'express';
import { PolicyConfigService } from '../policy-config/policy-config.service';
import type { PolicyConfig } from '../policy-config/default-policy-config';
import { UploadsService } from '../uploads/uploads.service';
import { NotificationsService } from '../notifications/notifications.service';

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
    private readonly uploads: UploadsService,
    private readonly notify: NotificationsService,
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

  private clearCacheByPrefix(prefix: string) {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) this.cache.delete(key);
    }
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
    const [users, tutors, students, bookings, payments, revenueMinor] = await this.prisma.$transaction([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.tutor.count({ where: { user: { is: { deletedAt: null } } } }),
      this.prisma.student.count({ where: { user: { is: { deletedAt: null } } } }),
      this.prisma.booking.count(),
      this.prisma.payment.count({ where: { status: PaymentStatus.SUCCEEDED } }),
      this.prisma.payment.aggregate({
        where: { status: PaymentStatus.SUCCEEDED },
        _sum: { amountInMinor: true },
      }),
    ]);

    const latestSignups = await this.prisma.user.findMany({
      where: { deletedAt: null },
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
          languages: true, qualifications: true, yearsExperience: true,
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

    const enriched = items.map((item) => {
      const profileStatus = checkTutorProfileCompletion({ ...item, user: item.user });
      return {
        ...item,
        profileCompletion: profileStatus.completionPercentage,
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
      };
    });

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
      select: { id: true, status: true, updatedAt: true, userId: true },
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

    // Send approval / rejection email
    if (dto.status === TutorStatus.APPROVED || dto.status === TutorStatus.REJECTED) {
      const tutorUser = await this.prisma.user.findUnique({
        where: { id: updated.userId },
        select: { email: true, name: true },
      });
      if (tutorUser) {
        if (dto.status === TutorStatus.APPROVED) {
          this.notify.sendTutorApprovedEmail({
            to: tutorUser.email,
            tutorName: tutorUser.name ?? undefined,
          }).catch((e) => this.logger.warn(`Tutor approved email failed: ${e?.message}`));
        } else {
          this.notify.sendTutorRejectedEmail({
            to: tutorUser.email,
            tutorName: tutorUser.name ?? undefined,
            reason: (dto as any).rejectionReason ?? undefined,
          }).catch((e) => this.logger.warn(`Tutor rejected email failed: ${e?.message}`));
        }
      }
    }

    return { id: updated.id, status: updated.status, updatedAt: updated.updatedAt };
  }

  async setTutorTrending(tutorId: string, isTrending: boolean, adminId: string, req?: Request) {
    const before = await this.prisma.tutor.findUnique({ where: { id: tutorId }, select: { id: true, isTrending: true } });
    if (!before) throw new NotFoundException('Tutor not found');
    const updated = await this.prisma.tutor.update({
      where: { id: tutorId },
      data: {
        isTrending,
        // When admin explicitly removes from trending, set manual override so cron doesn't re-add.
        // When admin explicitly adds to trending, clear the override.
        trendingManualOverride: !isTrending,
      },
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
          board: true, timezone: true, preferredLanguage: true, profileStatus: true, marksheetUrl: true,
          user: { select: { id: true, email: true, name: true, phone: true, avatarUrl: true, isBanned: true, bannedScope: true, bannedAt: true } },
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

    const enriched = items.map((item) => {
      const profileStatus = checkStudentProfileCompletion({ ...item, user: item.user });
      return {
        ...item,
        tokens: tokenSumMap.get(item.id) ?? 0,
        profileCompletion: profileStatus.completionPercentage,
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
      };
    });

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
            phone: true,
            avatarUrl: true,
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

    const profileStatus = checkStudentProfileCompletion({
      ...student,
      user: student.user,
    });

    // Resolve avatar URL for admin view
    let readableAvatarUrl = student.user.avatarUrl ?? null;
    if (readableAvatarUrl) {
      try {
        readableAvatarUrl = await this.uploads.toReadableReference(readableAvatarUrl, student.user.id);
      } catch {
        // keep original if resolution fails
      }
    }

    // Resolve marksheet URL for admin view
    let readableMarksheetUrl = (student as any).marksheetUrl ?? null;
    if (readableMarksheetUrl) {
      try {
        readableMarksheetUrl = await this.uploads.toReadableReference(readableMarksheetUrl, student.user.id);
      } catch {
        // keep original if resolution fails
      }
    }

    return {
      ...student,
      marksheetUrl: readableMarksheetUrl,
      tokens: liveTokens,
      tutorTokenBalances: tutorTokenBalancesWithExpiry,
      payments,
      conversations,
      profileCompletion: profileStatus.completionPercentage,
      missingFields: profileStatus.missingFields,
      profileStatus: (student as any).profileStatus ?? 'PENDING',
      adminProfileNotes: (student as any).adminProfileNotes ?? null,
      user: {
        ...student.user,
        avatarUrl: readableAvatarUrl,
      },
    };
  }

  async setStudentProfileStatus(studentId: string, status: string, notes: string | undefined, adminId: string, fields?: string[]) {
    const validStatuses = ['APPROVED', 'REJECTED', 'RESUBMISSION_REQUESTED'];
    if (!validStatuses.includes(status)) {
      throw new BadRequestException(`status must be one of: ${validStatuses.join(', ')}`);
    }

    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, profileStatus: true, adminProfileNotes: true, userId: true } as any,
    });
    if (!student) throw new NotFoundException('Student not found');

    const before = { profileStatus: (student as any).profileStatus, adminProfileNotes: (student as any).adminProfileNotes };

    const updateData: any = { profileStatus: status, adminProfileNotes: notes ?? null };
    if (status === 'RESUBMISSION_REQUESTED' && fields && fields.length > 0) {
      const allowedFields = new Set(['name', 'phone', 'bio', 'grade', 'board', 'timezone', 'preferredLanguage', 'marksheet', 'avatar']);
      updateData.resubmissionFields = fields.filter((f: string) => allowedFields.has(f));
    } else {
      updateData.resubmissionFields = [];
    }

    const updated = await this.prisma.student.update({
      where: { id: studentId },
      data: updateData,
      select: { id: true, profileStatus: true, adminProfileNotes: true } as any,
    });

    this.audit.log({
      adminId,
      action: `STUDENT_PROFILE_${status}`,
      entityType: AuditEntityType.USER,
      entityId: studentId,
      beforeData: before,
      afterData: { profileStatus: status, adminProfileNotes: notes ?? null },
    });

    this.clearCacheByPrefix('GET /admin/students');
    return { ok: true, profileStatus: (updated as any).profileStatus, adminProfileNotes: (updated as any).adminProfileNotes };
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
            attendance: {
              select: {
                tutorWaitingRoomAttended: true,
                studentWaitingRoomAttended: true,
              },
            },
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

    // Decorate KYC doc URLs with signed readable URLs
    if (tutor.kycDocs?.length) {
      tutor.kycDocs = await Promise.all(
        tutor.kycDocs.map(async (doc) => ({
          ...doc,
          url: await this.uploads.toReadableReference(doc.url),
        })),
      );
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

    const where: Prisma.UserWhereInput = { role: 'ADMIN', deletedAt: null };
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
    const user = await this.prisma.user.findFirst({
      where: { id: userId, role: 'ADMIN', deletedAt: null },
      select: {
        id: true, email: true, name: true, role: true,
        isDirector: true, createdAt: true, updatedAt: true,
      },
    });
    if (!user) throw new NotFoundException('Admin user not found');
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

  async removeAdminUser(userId: string, adminId: string, req?: Request) {
    const actor = await this.prisma.user.findUnique({
      where: { id: adminId },
      select: { id: true, role: true, isDirector: true, deletedAt: true },
    });
    if (!actor || actor.deletedAt || actor.role !== 'ADMIN') {
      throw new ForbiddenException('Only active admin users can perform this action');
    }

    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isDirector: true,
        deletedAt: true,
      },
    });

    if (!target) throw new NotFoundException('Admin user not found');
    if (target.deletedAt) throw new BadRequestException('Account is already deleted');
    if (target.role !== 'ADMIN') throw new BadRequestException('User is not an admin');
    if (target.id === adminId) throw new BadRequestException('You cannot delete your own admin account');
    if (target.isDirector && !actor.isDirector) {
      throw new ForbiddenException('Only a director can delete a director admin account');
    }

    if (target.isDirector) {
      const directorCount = await this.prisma.user.count({
        where: { role: 'ADMIN', isDirector: true, deletedAt: null },
      });
      if (directorCount <= 1) {
        throw new BadRequestException('Cannot delete the last director admin');
      }
    }

    const now = new Date();
    const scrambledEmail = `deleted_${userId}@deleted.tunect.com`;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        deletedAt: now,
        email: scrambledEmail,
        name: 'Deleted User',
        avatarUrl: null,
        phone: null,
        password: '',
        role: null,
        hasChosenRole: false,
        isDirector: false,
      },
    });

    const auditInfo = req ? extractAuditInfo(req) : { endpoint: undefined, ipAddress: undefined };
    this.audit.log({
      adminId,
      action: 'ADMIN_USER_DELETED',
      entityType: AuditEntityType.USER,
      entityId: userId,
      beforeData: {
        email: target.email,
        name: target.name,
        role: target.role,
        isDirector: target.isDirector,
      },
      afterData: {
        deletedAt: now,
        role: null,
        isDirector: false,
      },
      endpoint: auditInfo.endpoint,
      ipAddress: auditInfo.ipAddress,
    });

    this.cache.delete('GET /admin/dashboard');

    return { ok: true, message: 'Admin account deleted successfully' };
  }

  // ─── Admin Booking Actions ───

  /**
   * Admin reschedule: reset a COMPLETED / AUTO_CANCELLED / NO_SHOW booking
   * to CONFIRMED with a new timeslot. The rescheduled-already limit does NOT
   * apply when an admin performs the action.
   */
  async adminRescheduleBooking(
    bookingId: string,
    dto: { startTime: string; endTime: string; notes?: string },
    adminUserId: string,
    req?: Request,
  ) {
    const start = new Date(dto.startTime);
    const end = new Date(dto.endTime);
    if (isNaN(start.getTime()) || isNaN(end.getTime()))
      throw new BadRequestException('Invalid startTime or endTime');
    if (start >= end)
      throw new BadRequestException('startTime must be before endTime');

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        tutor: { select: { id: true, user: { select: { email: true, name: true } } } },
        student: { select: { id: true, user: { select: { email: true, name: true } } } },
      },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    // Demo classes are capped at 30 minutes
    if (booking.isDemo) {
      const durationMs = end.getTime() - start.getTime();
      if (durationMs > 30 * 60 * 1000)
        throw new BadRequestException('Demo class duration cannot exceed 30 minutes');
    }

    const updated = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        startTime: start,
        endTime: end,
        status: 'CONFIRMED',
        notes: dto.notes ?? `Admin rescheduled from ${booking.status}`,
        demeritApplied: false,
      },
    });

    // Send rescheduled booking confirmation emails to both parties
    this.notify.bookingConfirmation({
      studentEmail: booking.student.user.email,
      tutorEmail: booking.tutor.user.email ?? undefined,
      studentName: booking.student.user.name ?? undefined,
      tutorName: booking.tutor.user.name ?? undefined,
      bookingId: booking.id,
      startIso: start.toISOString(),
      endIso: end.toISOString(),
      isDemo: booking.isDemo,
      notes: dto.notes ?? `Admin rescheduled — new time confirmed`,
    }).catch(() => {/* non-critical */});

    const auditInfo = req ? extractAuditInfo(req) : { endpoint: undefined, ipAddress: undefined };
    this.audit.log({
      adminId: adminUserId,
      action: 'ADMIN_RESCHEDULE_BOOKING',
      entityType: AuditEntityType.BOOKING,
      entityId: bookingId,
      beforeData: { status: booking.status, startTime: booking.startTime, endTime: booking.endTime },
      afterData: { status: 'CONFIRMED', startTime: start, endTime: end },
      endpoint: auditInfo.endpoint,
      ipAddress: auditInfo.ipAddress,
    });

    return updated;
  }

  /**
   * Reverse a demerit point that was applied against a specific booking.
   * Decrements tutor.demeritPoints (floored at 0) and deletes any
   * DEMERIT_PENALTY wallet-ledger entry for this booking.
   */
  async reverseDemeritForBooking(bookingId: string, adminUserId: string, req?: Request) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        tutorId: true,
        demeritApplied: true,
        tutor: { select: { id: true, demeritPoints: true, user: { select: { email: true, name: true } } } },
      },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    const result = await this.prisma.$transaction(async (tx) => {
      // Decrement demerit — min 0
      const current = booking.tutor.demeritPoints ?? 0;
      const newPoints = Math.max(0, current - 1);
      await tx.tutor.update({
        where: { id: booking.tutorId },
        data: { demeritPoints: newPoints },
      });

      // Delete any DEMERIT_PENALTY ledger entry for this booking and credit back to wallet
      const penaltyEntry = await tx.tutorWalletLedger.findFirst({
        where: { bookingId, reason: 'DEMERIT_PENALTY' },
      });
      if (penaltyEntry) {
        const creditBack = Math.abs(Number(penaltyEntry.delta));
        await tx.tutorWalletLedger.delete({ where: { id: penaltyEntry.id } });
        if (creditBack > 0) {
          await tx.tutorWallet.upsert({
            where: { tutorId: booking.tutorId },
            update: { balance: { increment: creditBack } },
            create: { tutorId: booking.tutorId, balance: new Prisma.Decimal(creditBack) },
          });
        }
      }

      // Clear flag on booking
      await tx.booking.update({
        where: { id: bookingId },
        data: { demeritApplied: false },
      });

      return { demeritPointsBefore: current, demeritPointsAfter: newPoints, penaltyReversed: !!penaltyEntry };
    });

    const auditInfo = req ? extractAuditInfo(req) : { endpoint: undefined, ipAddress: undefined };
    this.audit.log({
      adminId: adminUserId,
      action: 'REVERSE_DEMERIT',
      entityType: AuditEntityType.BOOKING,
      entityId: bookingId,
      beforeData: { demeritPoints: result.demeritPointsBefore },
      afterData: { demeritPoints: result.demeritPointsAfter, penaltyReversed: result.penaltyReversed },
      endpoint: auditInfo.endpoint,
      ipAddress: auditInfo.ipAddress,
    });

    return { ok: true, ...result };
  }

  /**
   * Reverse the tutor earning (BOOKING_EARNED) for a specific booking.
   * Deletes the ledger entry and decrements the wallet balance.
   */
  async reverseEarningForBooking(bookingId: string, adminUserId: string, req?: Request) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        tutorId: true,
        isDemo: true,
        tutor: { select: { id: true, user: { select: { email: true, name: true } } } },
      },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.isDemo) throw new BadRequestException('Cannot reverse earning for a demo class');

    const result = await this.prisma.$transaction(async (tx) => {
      const earningEntry = await tx.tutorWalletLedger.findFirst({
        where: { bookingId, reason: 'BOOKING_EARNED' },
      });
      if (!earningEntry) throw new BadRequestException('No earning found for this booking');

      const amount = Number(earningEntry.delta);
      await tx.tutorWalletLedger.delete({ where: { id: earningEntry.id } });

      // Deduct from wallet
      if (amount > 0) {
        await tx.tutorWallet.upsert({
          where: { tutorId: booking.tutorId },
          update: { balance: { decrement: amount } },
          create: { tutorId: booking.tutorId, balance: new Prisma.Decimal(0) },
        });
      }

      return { amountReversed: amount };
    });

    const auditInfo = req ? extractAuditInfo(req) : { endpoint: undefined, ipAddress: undefined };
    this.audit.log({
      adminId: adminUserId,
      action: 'REVERSE_EARNING',
      entityType: AuditEntityType.BOOKING,
      entityId: bookingId,
      beforeData: { earning: result.amountReversed },
      afterData: { earning: 0 },
      endpoint: auditInfo.endpoint,
      ipAddress: auditInfo.ipAddress,
    });

    return { ok: true, ...result };
  }

  // ---------- Revenue Analytics ----------
  private platformFeePercent(hourlyRate?: number | null): 25 | 22 | 18 {
    const rate = Number(hourlyRate ?? 0);
    if (!Number.isFinite(rate) || rate <= 0) return 25;
    if (rate < 400) return 25;
    if (rate < 700) return 22;
    return 18;
  }

  async revenueAnalytics(month?: string) {
    let periodStart: Date | undefined;
    let periodEnd: Date | undefined;
    if (month) {
      const [y, m] = month.split('-').map(Number);
      periodStart = new Date(y, m - 1, 1);
      periodEnd = new Date(y, m, 0, 23, 59, 59, 999);
    }

    const dateFilter = periodStart && periodEnd
      ? { gte: periodStart, lte: periodEnd }
      : undefined;

    const totalRevenueAgg = await this.prisma.payment.aggregate({
      where: {
        status: PaymentStatus.SUCCEEDED,
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      },
      _sum: { amountInMinor: true },
    });
    const totalRevenue = toNum(totalRevenueAgg._sum.amountInMinor) / 100;

    const completedBookings = await this.prisma.booking.findMany({
      where: {
        isDemo: false,
        endTime: { not: null, ...(dateFilter || {}) },
        status: {
          in: [BookingStatus.COMPLETED, BookingStatus.AUTO_CANCELLED_STUDENT_NO_SHOW],
        },
      },
      select: {
        id: true,
        tutorId: true,
        status: true,
        startTime: true,
        endTime: true,
        tokensCharged: true,
        priceAtBooking: true,
        tutor: {
          select: {
            id: true,
            hourlyRate: true,
            user: { select: { id: true, email: true } },
          },
        },
      },
    });

    const tutorMap = new Map<string, {
      tutorId: string;
      email: string;
      totalEarned: number;
      totalCommission: number;
      bracket: 25 | 22 | 18;
      bookingCount: number;
    }>();

    let companyProfit = 0;
    let bracket25Revenue = 0;
    let bracket22Revenue = 0;
    let bracket18Revenue = 0;
    let bracket25Count = 0;
    let bracket22Count = 0;
    let bracket18Count = 0;

    for (const b of completedBookings) {
      const hourlyRate = toNum(b.priceAtBooking ?? b.tutor?.hourlyRate);
      if (hourlyRate <= 0) continue;

      const durationMs = b.startTime && b.endTime
        ? b.endTime.getTime() - b.startTime.getTime()
        : 0;
      const durationHours = durationMs > 0
        ? durationMs / 3_600_000
        : toNum(b.tokensCharged);
      if (durationHours <= 0) continue;

      const bookingAmount = durationHours * hourlyRate;
      const feePercent = this.platformFeePercent(hourlyRate);
      const commission = (bookingAmount * feePercent) / 100;
      const tutorEarning = bookingAmount - commission;

      companyProfit += commission;

      if (feePercent === 25) { bracket25Revenue += commission; bracket25Count++; }
      if (feePercent === 22) { bracket22Revenue += commission; bracket22Count++; }
      if (feePercent === 18) { bracket18Revenue += commission; bracket18Count++; }

      const tutorId = b.tutorId;
      const email = b.tutor?.user?.email ?? 'unknown';
      if (!tutorMap.has(tutorId)) {
        tutorMap.set(tutorId, {
          tutorId, email, totalEarned: 0, totalCommission: 0,
          bracket: feePercent, bookingCount: 0,
        });
      }
      const entry = tutorMap.get(tutorId)!;
      entry.totalEarned += tutorEarning;
      entry.totalCommission += commission;
      entry.bookingCount++;
    }

    const tutorWallets = await this.prisma.tutorWallet.findMany({
      select: {
        tutorId: true,
        balance: true,
        tutor: { select: { user: { select: { email: true } } } },
      },
    });

    const tutorPayableTotal = tutorWallets.reduce((sum, w) => sum + toNum(w.balance), 0);
    const tutorPayableList = tutorWallets
      .filter(w => toNum(w.balance) > 0)
      .map(w => ({
        tutorId: w.tutorId,
        email: w.tutor?.user?.email ?? 'unknown',
        amountPayable: toNum(w.balance),
      }))
      .sort((a, b) => b.amountPayable - a.amountPayable);

    const payouts = await this.prisma.payout.findMany({
      where: {
        status: 'PAID',
        ...(dateFilter ? { paidAt: dateFilter } : {}),
      },
      select: {
        id: true, tutorId: true, amount: true, paidAt: true, paymentMethod: true,
        tutor: { select: { user: { select: { email: true } } } },
      },
      orderBy: { paidAt: 'desc' },
    });

    const tutorPaidTotal = payouts.reduce((sum, p) => sum + toNum(p.amount), 0);
    const tutorPaidList = payouts.map(p => ({
      tutorId: p.tutorId,
      email: p.tutor?.user?.email ?? 'unknown',
      amount: toNum(p.amount),
      paidDate: p.paidAt?.toISOString() ?? null,
      mode: p.paymentMethod ?? 'N/A',
    }));

    const highPerformers = Array.from(tutorMap.values())
      .sort((a, b) => b.totalCommission - a.totalCommission)
      .slice(0, 10)
      .map(t => ({
        tutorId: t.tutorId,
        email: t.email,
        commissionGenerated: Math.round(t.totalCommission * 100) / 100,
        bookingCount: t.bookingCount,
        bracket: t.bracket,
      }));

    const now = new Date();
    const monthlyTrend: { month: string; revenue: number; commission: number; tutorEarnings: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mStart = new Date(d.getFullYear(), d.getMonth(), 1);
      const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

      let mRevenue = 0;
      let mCommission = 0;
      let mTutorEarnings = 0;

      for (const b of completedBookings) {
        if (!b.endTime || b.endTime < mStart || b.endTime > mEnd) continue;
        const hr = toNum(b.priceAtBooking ?? b.tutor?.hourlyRate);
        if (hr <= 0) continue;
        const dMs = b.startTime && b.endTime ? b.endTime.getTime() - b.startTime.getTime() : 0;
        const dH = dMs > 0 ? dMs / 3_600_000 : toNum(b.tokensCharged);
        if (dH <= 0) continue;
        const amt = dH * hr;
        const fee = (amt * this.platformFeePercent(hr)) / 100;
        mRevenue += amt;
        mCommission += fee;
        mTutorEarnings += amt - fee;
      }

      monthlyTrend.push({
        month: label,
        revenue: Math.round(mRevenue * 100) / 100,
        commission: Math.round(mCommission * 100) / 100,
        tutorEarnings: Math.round(mTutorEarnings * 100) / 100,
      });
    }

    return {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      companyProfit: Math.round(companyProfit * 100) / 100,
      tutorPayable: {
        total: Math.round(tutorPayableTotal * 100) / 100,
        tutors: tutorPayableList,
      },
      tutorPaid: {
        total: Math.round(tutorPaidTotal * 100) / 100,
        payouts: tutorPaidList,
      },
      bracketBreakdown: {
        bracket25: { revenue: Math.round(bracket25Revenue * 100) / 100, count: bracket25Count },
        bracket22: { revenue: Math.round(bracket22Revenue * 100) / 100, count: bracket22Count },
        bracket18: { revenue: Math.round(bracket18Revenue * 100) / 100, count: bracket18Count },
      },
      highPerformers,
      monthlyTrend,
    };
  }
}
