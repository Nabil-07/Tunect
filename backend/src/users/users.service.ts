// src/users/users.service.ts
import { Injectable, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditEntityType } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { S3Service } from '../common/services/s3.service';
import { UploadsService } from '../uploads/uploads.service';
import { EncryptionService } from '../common/services/encryption.service';
import { extractAuditInfo } from '../common/audit-helper';
import type { Request } from 'express';

type UpdateMeInput = {
  email?: string;
  name?: string;
  avatarUrl?: string | null;
  preferredCurrency?: string;
};

const CURRENT_TERMS_VERSION = 1;
const TERMS_ACCEPT_ACTION_STUDENT = 'TERMS_ACCEPTED_STUDENT';
const TERMS_ACCEPT_ACTION_TUTOR = 'TERMS_ACCEPTED_TUTOR';

type TermsAcceptanceSummary = {
  accepted: boolean;
  version: number | null;
  acceptedAt: Date | null;
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
    private readonly uploadsService: UploadsService,
    private readonly encryptionService: EncryptionService,
  ) {}

  private normalizeRole(role?: string | null): 'STUDENT' | 'TUTOR' | 'ADMIN' | null {
    if (!role) return null;
    const normalized = String(role).toUpperCase();
    if (normalized === 'STUDENT' || normalized === 'TUTOR' || normalized === 'ADMIN') {
      return normalized;
    }
    return null;
  }

  private parseAcceptedVersion(afterData: unknown): number | null {
    if (!afterData || typeof afterData !== 'object') return null;
    const candidate = (afterData as any)?.version;
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return Math.floor(candidate);
    }
    if (typeof candidate === 'string' && candidate.trim()) {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed)) return Math.floor(parsed);
    }
    return null;
  }

  private summarizeAcceptance(log: { createdAt: Date; afterData: unknown } | null): TermsAcceptanceSummary {
    return {
      accepted: !!log,
      version: log ? this.parseAcceptedVersion(log.afterData) : null,
      acceptedAt: log?.createdAt ?? null,
    };
  }

  async findMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        name: true,
        avatarUrl: true,
        phone: true,
        preferredCurrency: true,
        isDirector: true,
        isBanned: true,
        bannedScope: true,
        bannedAt: true,
        createdAt: true,
        updatedAt: true,
        password: true,
        // personas → let frontend decide routing correctly
        student: { select: { id: true, createdAt: true } },
        tutor:   { select: { id: true, createdAt: true, status: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const activeBan = await this.prisma.banLedger.findFirst({
      where: { userId, isActive: true },
      orderBy: { bannedAt: 'desc' },
      select: { scope: true, reason: true, bannedAt: true },
    });

    const piiStrikes = await this.prisma.piiViolationLog.count({ where: { userId } });
    const piiMaxStrikes = 3;
    const isBannedForMessaging =
      user.isBanned ||
      user.bannedScope === 'MESSAGING' ||
      user.bannedScope === 'ALL' ||
      activeBan?.scope === 'MESSAGING' ||
      activeBan?.scope === 'ALL';
    const messagingBlocked = piiStrikes >= piiMaxStrikes || isBannedForMessaging;

    const [studentTermsLog, tutorTermsLog] = await Promise.all([
      this.prisma.auditLog.findFirst({
        where: { adminId: userId, action: TERMS_ACCEPT_ACTION_STUDENT, entityType: AuditEntityType.USER },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, afterData: true },
      }),
      this.prisma.auditLog.findFirst({
        where: { adminId: userId, action: TERMS_ACCEPT_ACTION_TUTOR, entityType: AuditEntityType.USER },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, afterData: true },
      }),
    ]);

    const studentTerms = this.summarizeAcceptance(studentTermsLog);
    const tutorTerms = this.summarizeAcceptance(tutorTermsLog);
    const normalizedRole = this.normalizeRole(user.role);
    let acceptedForCurrentRole = true;
    if (normalizedRole === 'STUDENT') {
      acceptedForCurrentRole = studentTerms.accepted;
    } else if (normalizedRole === 'TUTOR') {
      acceptedForCurrentRole = tutorTerms.accepted;
    }

    const { password, ...safeUser } = user;

    // For tutors: use approved KYC selfie as profile picture (overrides any manually set avatar)
    let effectiveAvatarUrl = safeUser.avatarUrl;
    if (safeUser.tutor?.id) {
      const approvedSelfie = await this.prisma.kycDocument.findFirst({
        where: { tutorId: safeUser.tutor.id, docType: 'selfie', status: 'APPROVED' },
        orderBy: { createdAt: 'desc' },
        select: { url: true },
      });
      if (approvedSelfie?.url) {
        effectiveAvatarUrl = approvedSelfie.url;
      }
    }

    // Generate a fallback name from email if name is null
    const displayName = safeUser.name || (() => {
      if (!safeUser.email) return null;
      const emailPart = safeUser.email.split('@')[0];
      return emailPart
        .split(/[._-]/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ')
        .trim() || emailPart;
    })();

    const readableAvatarUrl = effectiveAvatarUrl
      ? await this.uploadsService.toReadableReference(effectiveAvatarUrl, userId, safeUser.role ?? undefined)
      : effectiveAvatarUrl;

    return {
      ...safeUser,
      avatarUrl: readableAvatarUrl ? this.encryptionService.encrypt(readableAvatarUrl) : readableAvatarUrl,
      name: displayName, // Use fallback if original was null
      hasPassword: Boolean(password && password.length > 0),
      piiStrikes,
      piiMaxStrikes,
      messagingBlocked,
      banReason: activeBan?.reason ?? null,
      bannedScope: activeBan?.scope ?? user.bannedScope,
      bannedAt: activeBan?.bannedAt ?? user.bannedAt,
      terms: {
        currentVersion: CURRENT_TERMS_VERSION,
        student: studentTerms,
        tutor: tutorTerms,
        acceptedForCurrentRole,
      },
    };
  }

  // alias if anything still calls me()
  async me(userId: string) {
    return this.findMe(userId);
  }

  async updateMe(userId: string, data: UpdateMeInput) {
    // Block manual avatar changes for tutors with an approved KYC selfie
    if (data.avatarUrl !== undefined) {
      const tutor = await this.prisma.tutor.findUnique({ where: { userId }, select: { id: true } });
      if (tutor) {
        const approvedSelfie = await this.prisma.kycDocument.findFirst({
          where: { tutorId: tutor.id, docType: 'selfie', status: 'APPROVED' },
          select: { id: true },
        });
        if (approvedSelfie) {
          // Silently ignore avatar change — profile pic comes from KYC selfie
          delete data.avatarUrl;
        }
      }
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.email ? { email: data.email.toLowerCase().trim() } : {}),
        ...(data.name === undefined ? {} : { name: data.name }),
        ...(data.avatarUrl === undefined ? {} : { avatarUrl: data.avatarUrl }),
        ...(data.preferredCurrency ? { preferredCurrency: data.preferredCurrency } : {}),
      },
      select: {
        id: true,
        email: true,
        role: true,
        name: true,
        avatarUrl: true,
        phone: true,
        preferredCurrency: true,
        createdAt: true,
        updatedAt: true,
        student: { select: { id: true, createdAt: true } },
        tutor:   { select: { id: true, createdAt: true, status: true } },
      },
    });

    return {
      ...user,
      avatarUrl: user.avatarUrl
        ? await this.uploadsService.toReadableReference(user.avatarUrl, userId, user.role ?? undefined)
        : user.avatarUrl,
    };
  }

  async uploadAvatar(userId: string, file: Express.Multer.File) {
    // Block manual avatar upload for tutors with approved KYC selfie
    const tutor = await this.prisma.tutor.findUnique({ where: { userId }, select: { id: true } });
    if (tutor) {
      const approvedSelfie = await this.prisma.kycDocument.findFirst({
        where: { tutorId: tutor.id, docType: 'selfie', status: 'APPROVED' },
        select: { id: true },
      });
      if (approvedSelfie) {
        throw new BadRequestException('Profile picture is set from your approved KYC selfie and cannot be changed manually');
      }
    }

    const uploadedReference = await this.s3Service.uploadFile(
      file.buffer,
      file.originalname,
      `avatars/${userId}`,
    );
    const avatarKey = this.s3Service.extractKeyFromReference(uploadedReference);

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: avatarKey },
      select: {
        id: true,
        avatarUrl: true,
        updatedAt: true,
      },
    });

    return {
      ...updated,
      avatarUrl: updated.avatarUrl
        ? await this.uploadsService.toReadableReference(updated.avatarUrl, userId)
        : updated.avatarUrl,
    };
  }

  async finalizeAvatarUpload(userId: string, keyOrUrl: string, userRole?: string) {
    const key = await this.uploadsService.assertKeyAllowedForUseCase({
      userId,
      useCase: 'avatars',
      keyOrUrl,
      userRole,
    });

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: this.uploadsService.toStoredReference(key) },
      select: {
        id: true,
        avatarUrl: true,
        updatedAt: true,
      },
    });

    return {
      ...updated,
      avatarUrl: updated.avatarUrl
        ? await this.uploadsService.toReadableReference(updated.avatarUrl, userId, userRole)
        : updated.avatarUrl,
    };
  }

  async changePassword(userId: string, currentPassword: string | undefined, newPassword: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const hasPassword = Boolean(user.password && user.password.length > 0);

    if (hasPassword) {
      if (!currentPassword?.trim()) {
        throw new BadRequestException('Current password is required');
      }
      const ok = await bcrypt.compare(currentPassword, user.password);
      if (!ok) throw new UnauthorizedException('Current password is incorrect');
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hash },
    });

    return { ok: true, hasPassword: true };
  }

  async acceptTermsForCurrentRole(userId: string, roleFromToken: string | undefined, req?: Request, version?: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });

    if (!user) throw new NotFoundException('User not found');

    const effectiveRole = this.normalizeRole(roleFromToken) ?? this.normalizeRole(user.role);
    if (effectiveRole !== 'STUDENT' && effectiveRole !== 'TUTOR') {
      throw new BadRequestException('Terms acceptance is only required for student or tutor accounts');
    }

    const acceptedVersion =
      typeof version === 'number' && Number.isFinite(version) && version > 0
        ? Math.floor(version)
        : CURRENT_TERMS_VERSION;

    const action = effectiveRole === 'STUDENT' ? TERMS_ACCEPT_ACTION_STUDENT : TERMS_ACCEPT_ACTION_TUTOR;

    const latest = await this.prisma.auditLog.findFirst({
      where: {
        adminId: userId,
        action,
        entityType: AuditEntityType.USER,
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, afterData: true },
    });

    const latestVersion = this.parseAcceptedVersion(latest?.afterData);
    if (latest && latestVersion === acceptedVersion) {
      return {
        accepted: true,
        role: effectiveRole,
        version: latestVersion,
        acceptedAt: latest.createdAt,
      };
    }

    const auditInfo = req ? extractAuditInfo(req) : { endpoint: '/users/me/terms/accept', ipAddress: 'unknown' };

    const created = await this.prisma.auditLog.create({
      data: {
        adminId: userId,
        action,
        entityType: AuditEntityType.USER,
        entityId: userId,
        beforeData: latest
          ? {
              acceptedAt: latest.createdAt,
              version: latestVersion,
            }
          : undefined,
        afterData: {
          role: effectiveRole,
          version: acceptedVersion,
          acceptedAt: new Date().toISOString(),
        },
        endpoint: auditInfo.endpoint,
        ipAddress: auditInfo.ipAddress,
      },
      select: { createdAt: true },
    });

    return {
      accepted: true,
      role: effectiveRole,
      version: acceptedVersion,
      acceptedAt: created.createdAt,
    };
  }

  async listAll() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async setRole(userId: string, role: 'ADMIN' | 'TUTOR' | 'STUDENT') {
    return this.prisma.user.update({
      where: { id: userId },
      data: { role },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Soft-delete account: scrambles PII, marks as deleted.
   * Preserves booking, payment, and wallet records for compliance.
   */
  async softDeleteAccount(userId: string, password?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, password: true, deletedAt: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.deletedAt) throw new BadRequestException('Account is already deleted');

    // If user has a password (non-OAuth), require confirmation
    if (user.password && user.password.length > 0) {
      if (!password) throw new BadRequestException('Password confirmation is required to delete your account');
      const ok = await bcrypt.compare(password, user.password);
      if (!ok) throw new UnauthorizedException('Incorrect password');
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
        password: '', // clear password hash
      },
    });

    return { ok: true, message: 'Account has been permanently deactivated. All transactional records have been preserved.' };
  }
}
