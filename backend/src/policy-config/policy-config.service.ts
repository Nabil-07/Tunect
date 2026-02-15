import { Injectable } from '@nestjs/common';
import { AuditEntityType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { extractAuditInfo } from '../common/audit-helper';
import type { Request } from 'express';
import { DEFAULT_POLICY_CONFIG, PolicyConfig } from './default-policy-config';

const POLICY_ACTION = 'POLICY_CONFIG_UPDATE';
const POLICY_ENTITY_ID = 'policy-config';

@Injectable()
export class PolicyConfigService {
  constructor(private readonly prisma: PrismaService) {}

  private mergeDeep<T extends Record<string, any>>(base: T, patch: Partial<T>): T {
    const output: any = Array.isArray(base) ? [...base] : { ...base };
    for (const key of Object.keys(patch || {})) {
      const patchValue = (patch as any)[key];
      if (
        patchValue &&
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

  private async getLatestStoredConfig(): Promise<Partial<PolicyConfig> | null> {
    const latest = await this.prisma.auditLog.findFirst({
      where: {
        action: POLICY_ACTION,
        entityType: AuditEntityType.USER,
        entityId: POLICY_ENTITY_ID,
      },
      orderBy: { createdAt: 'desc' },
      select: { afterData: true },
    });

    const payload = latest?.afterData as any;
    if (!payload || typeof payload !== 'object') return null;
    const config = payload?.config;
    if (!config || typeof config !== 'object') return null;
    return config as Partial<PolicyConfig>;
  }

  async getPublicConfig(): Promise<PolicyConfig> {
    const stored = await this.getLatestStoredConfig();
    if (!stored) return DEFAULT_POLICY_CONFIG;
    return this.mergeDeep(DEFAULT_POLICY_CONFIG, stored as PolicyConfig);
  }

  async getAdminConfig() {
    const config = await this.getPublicConfig();
    const latest = await this.prisma.auditLog.findFirst({
      where: {
        action: POLICY_ACTION,
        entityType: AuditEntityType.USER,
        entityId: POLICY_ENTITY_ID,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        createdAt: true,
        adminId: true,
        admin: { select: { email: true } },
      },
    });

    return {
      config,
      lastUpdatedAt: latest?.createdAt ?? null,
      lastUpdatedBy: latest?.admin?.email ?? null,
      lastUpdatedById: latest?.adminId ?? null,
    };
  }

  async updateConfig(partial: Partial<PolicyConfig>, adminId: string, req?: Request) {
    const current = await this.getPublicConfig();
    const next = this.mergeDeep(current, partial as PolicyConfig);
    const auditInfo = req ? extractAuditInfo(req) : { endpoint: '/admin/policy-config', ipAddress: 'unknown' };

    await this.prisma.auditLog.create({
      data: {
        adminId,
        action: POLICY_ACTION,
        entityType: AuditEntityType.USER,
        entityId: POLICY_ENTITY_ID,
        beforeData: { config: current },
        afterData: { config: next },
        endpoint: auditInfo.endpoint,
        ipAddress: auditInfo.ipAddress,
      },
    });

    return { ok: true, config: next };
  }
}
