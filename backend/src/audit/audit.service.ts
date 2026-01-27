import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditEntityType } from '@prisma/client';

export type AuditLogParams = {
  adminId: string;
  action: string;
  entityType: AuditEntityType;
  entityId: string;
  beforeData?: object | null;
  afterData?: object | null;
};

export type AuditListFilters = {
  page?: number;
  pageSize?: number;
  entityType?: AuditEntityType;
  from?: Date | string;
  to?: Date | string;
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Log an admin action. Fire-and-forget: does not block the caller.
   * Failures are logged but not thrown.
   */
  log(params: AuditLogParams): void {
    const { adminId, action, entityType, entityId, beforeData, afterData } = params;
    Promise.resolve()
      .then(() =>
        this.prisma.auditLog.create({
          data: {
            adminId,
            action,
            entityType,
            entityId,
            beforeData: beforeData ?? undefined,
            afterData: afterData ?? undefined,
          },
        }),
      )
      .catch((err) => {
        this.logger.warn(`Audit log failed: ${action} ${entityType} ${entityId}`, err?.message ?? err);
      });
  }

  /**
   * List audit logs with pagination and optional filters (entityType, date range).
   */
  async list(filters: AuditListFilters) {
    const page = Math.max(filters.page ?? 1, 1);
    const pageSize = Math.min(Math.max(filters.pageSize ?? 20, 1), 100);
    const skip = (page - 1) * pageSize;

    const where: { entityType?: AuditEntityType; createdAt?: { gte?: Date; lte?: Date } } = {};
    if (filters.entityType) where.entityType = filters.entityType;
    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = filters.from instanceof Date ? filters.from : new Date(filters.from);
      if (filters.to) where.createdAt.lte = filters.to instanceof Date ? filters.to : new Date(filters.to);
    }

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          adminId: true,
          action: true,
          entityType: true,
          entityId: true,
          beforeData: true,
          afterData: true,
          createdAt: true,
          admin: { select: { id: true, email: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }
}
