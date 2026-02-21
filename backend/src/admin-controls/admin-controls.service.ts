// src/admin-controls/admin-controls.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { AuditEntityType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { extractAuditInfo } from '../common/audit-helper';
import type { Request } from 'express';
import {
  AdminControls,
  DEFAULT_ADMIN_CONTROLS,
} from './admin-controls.types';

const ACTION = 'ADMIN_CONTROLS_UPDATE';
const ENTITY_ID = 'admin-controls';

@Injectable()
export class AdminControlsService {
  private readonly logger = new Logger(AdminControlsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private mergeDeep<T extends Record<string, any>>(base: T, patch: Partial<T>): T {
    const output: any = Array.isArray(base) ? [...base] : { ...base };
    for (const key of Object.keys(patch || {})) {
      const patchValue = (patch as any)[key];
      if (
        patchValue !== null &&
        patchValue !== undefined &&
        typeof patchValue === 'object' &&
        !Array.isArray(patchValue) &&
        output[key] &&
        typeof output[key] === 'object' &&
        !Array.isArray(output[key])
      ) {
        output[key] = this.mergeDeep(output[key], patchValue);
      } else {
        output[key] = patchValue;
      }
    }
    return output;
  }

  private async getLatestStored(): Promise<Partial<AdminControls> | null> {
    const latest = await this.prisma.auditLog.findFirst({
      where: {
        action: ACTION,
        entityType: AuditEntityType.USER,
        entityId: ENTITY_ID,
      },
      orderBy: { createdAt: 'desc' },
      select: { afterData: true },
    });

    const payload = latest?.afterData as any;
    if (!payload || typeof payload !== 'object') return null;
    const controls = payload?.controls;
    if (!controls || typeof controls !== 'object') return null;
    return controls as Partial<AdminControls>;
  }

  /** Public endpoint – anyone can read (used by choose-role page + maintenance modal) */
  async getPublicControls(): Promise<AdminControls> {
    const stored = await this.getLatestStored();
    if (!stored) return { ...DEFAULT_ADMIN_CONTROLS };
    return this.mergeDeep({ ...DEFAULT_ADMIN_CONTROLS }, stored as AdminControls);
  }

  /** Admin endpoint – returns controls + audit metadata */
  async getAdminControls() {
    const controls = await this.getPublicControls();
    const latest = await this.prisma.auditLog.findFirst({
      where: {
        action: ACTION,
        entityType: AuditEntityType.USER,
        entityId: ENTITY_ID,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        createdAt: true,
        adminId: true,
        admin: { select: { email: true } },
      },
    });

    return {
      controls,
      lastUpdatedAt: latest?.createdAt ?? null,
      lastUpdatedBy: latest?.admin?.email ?? null,
      lastUpdatedById: latest?.adminId ?? null,
    };
  }

  /** Admin update – partial merge with audit logging */
  async updateControls(
    partial: Partial<AdminControls>,
    adminId: string,
    req?: Request,
  ) {
    const current = await this.getPublicControls();
    const next = this.mergeDeep({ ...current }, partial as AdminControls);
    const auditInfo = req
      ? extractAuditInfo(req)
      : { endpoint: '/admin/admin-controls', ipAddress: 'unknown' };

    await this.prisma.auditLog.create({
      data: {
        adminId,
        action: ACTION,
        entityType: AuditEntityType.USER,
        entityId: ENTITY_ID,
        beforeData: JSON.parse(JSON.stringify({ controls: current })),
        afterData: JSON.parse(JSON.stringify({ controls: next })),
        endpoint: auditInfo.endpoint,
        ipAddress: auditInfo.ipAddress,
      },
    });

    this.logger.log(`Admin controls updated by ${adminId}`);
    return { ok: true, controls: next };
  }
}
