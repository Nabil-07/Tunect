import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateKycDto } from './dto/create-kyc.dto';
import { FinalizeKycDto } from './dto/finalize-kyc.dto';
import { QueryKycDto } from './dto/query-kyc.dto';
import { ReviewKycDto } from './dto/review-kyc.dto';
import { KycStatus, KycAppStatus, TutorStatus, AuditEntityType } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { S3Service } from '../common/services/s3.service';
import { UploadsService } from '../uploads/uploads.service';

@Injectable()
export class KycService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly s3Service: S3Service,
    private readonly uploadsService: UploadsService,
  ) {}

  // tutor must be approved/pending; upload KYC doc
  async createMine(userId: string, dto: CreateKycDto) {
    const tutor = await this.prisma.tutor.findUnique({ where: { userId }, select: { id: true } });
    if (!tutor) throw new ForbiddenException('Only tutors can upload KYC');

    const created = await this.prisma.kycDocument.create({
      data: { tutorId: tutor.id, docType: dto.docType, url: dto.url, notes: dto.notes },
      select: { id: true, docType: true, url: true, status: true, notes: true, createdAt: true },
    });

    return this.decorateDocUrl(created);
  }

  async finalizeMine(userId: string, dto: FinalizeKycDto) {
    const tutor = await this.prisma.tutor.findUnique({ where: { userId }, select: { id: true } });
    if (!tutor) throw new ForbiddenException('Only tutors can upload KYC');

    const key = await this.uploadsService.assertKeyAllowedForUseCase({
      userId,
      useCase: 'kyc',
      keyOrUrl: dto.key,
      docType: dto.docType,
    });

    const created = await this.prisma.kycDocument.create({
      data: {
        tutorId: tutor.id,
        docType: dto.docType,
        notes: dto.notes,
        status: KycStatus.PENDING,
        url: this.uploadsService.toStoredReference(key),
      },
      select: { id: true, docType: true, url: true, status: true, notes: true, createdAt: true },
    });

    return this.decorateDocUrl(created);
  }

  async listMine(userId: string) {
    const tutor = await this.prisma.tutor.findUnique({ where: { userId }, select: { id: true } });
    if (!tutor) throw new ForbiddenException('Only tutors can view KYC');
    const docs = await this.prisma.kycDocument.findMany({
      where: { tutorId: tutor.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, docType: true, url: true, status: true, notes: true, createdAt: true },
    });

    return this.decorateDocUrls(docs);
  }

  // ADMIN
  async listAll(q: QueryKycDto) {
    const page = Math.max(q.page ?? 1, 1);
    const pageSize = Math.max(q.pageSize ?? 20, 1);
    const skip = (page - 1) * pageSize;

    const where = q.status ? { status: q.status } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.kycDocument.findMany({
        where,
        skip, take: pageSize,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        select: {
          id: true, docType: true, url: true, status: true, notes: true, createdAt: true,
          tutor: { select: { id: true, user: { select: { email: true } } } },
        },
      }),
      this.prisma.kycDocument.count({ where }),
    ]);

    return {
      items: await this.decorateDocUrls(items),
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async review(id: string, dto: ReviewKycDto, adminId: string) {
    const before = await this.prisma.kycDocument.findUnique({
      where: { id },
      select: { id: true, tutorId: true, status: true, notes: true },
    });
    if (!before) throw new NotFoundException('KYC document not found');

    const updated = await this.prisma.kycDocument.update({
      where: { id },
      data: { status: dto.status, notes: dto.notes },
      select: { id: true, docType: true, url: true, status: true, notes: true, createdAt: true },
    });

    // Update latest application + tutor status to reflect review outcome
    const latestApp = await this.prisma.tutorKycApplication.findFirst({
      where: { tutorId: before.tutorId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    let appStatus: KycAppStatus = KycAppStatus.UNDER_REVIEW;
    let tutorStatus: TutorStatus | null = null;
    if (dto.status === KycStatus.APPROVED) {
      appStatus = KycAppStatus.APPROVED;
      tutorStatus = TutorStatus.APPROVED;
    }
    if (dto.status === KycStatus.REJECTED) {
      appStatus = KycAppStatus.REJECTED;
      tutorStatus = TutorStatus.REJECTED;
    }

    if (latestApp) {
      await this.prisma.tutorKycApplication.update({
        where: { id: latestApp.id },
        data: { status: appStatus, notes: dto.notes },
      });
    }

    if (tutorStatus) {
      await this.prisma.tutor.update({ where: { id: before.tutorId }, data: { status: tutorStatus } });
    }

    this.audit.log({
      adminId,
      action: dto.status === KycStatus.APPROVED ? 'KYC_APPROVED' : 'KYC_REJECTED',
      entityType: AuditEntityType.KYC,
      entityId: id,
      beforeData: { status: before.status, notes: before.notes, tutorId: before.tutorId },
      afterData: { status: dto.status, notes: dto.notes, tutorId: before.tutorId },
    });

    return this.decorateDocUrl(updated);
  }

  async getTutorBundle(tutorId: string) {
    const tutor = await this.prisma.tutor.findUnique({
      where: { id: tutorId },
      select: { id: true, user: { select: { email: true, name: true } } },
    });
    if (!tutor) throw new NotFoundException('Tutor not found');

    const application = await this.prisma.tutorKycApplication.findFirst({
      where: { tutorId },
      orderBy: { createdAt: 'desc' },
    });

    const documents = await this.prisma.kycDocument.findMany({
      where: { tutorId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, docType: true, url: true, status: true, notes: true, createdAt: true },
    });

    return {
      tutor,
      application,
      documents: await this.decorateDocUrls(documents),
    };
  }

  // ===== Unified submit + status =====
  async submitUnified(userId: string, json: string, files: Array<any>) {
    const tutor = await this.prisma.tutor.findUnique({ where: { userId }, select: { id: true } });
    if (!tutor) throw new ForbiddenException('Only tutors can submit KYC');

    let data: any = {};
    try { data = JSON.parse(json || '{}'); } catch {}

    // Basic validation so we never create invalid rows
    const dob = data?.dob ? new Date(data.dob) : null;
    const required = ['fullName','dob','phone','country','addressLine1','city','bankAccountHolder','bankName'];
    const missing = required.filter((k) => !data?.[k]);
    if (missing.length) {
      throw new ForbiddenException(`Missing required fields: ${missing.join(', ')}`);
    }
    if (!dob || Number.isNaN(dob.getTime())) {
      throw new ForbiddenException('Invalid date of birth');
    }

    // create new application, block if reapply window active
    const last = await this.prisma.tutorKycApplication.findFirst({
      where: { tutorId: tutor.id },
      orderBy: { createdAt: 'desc' },
    });
    if (last?.reapplyAfter && last.reapplyAfter > new Date()) {
      return { error: 'Reapply not allowed yet', reapplyAfter: last.reapplyAfter };
    }

    const app = await this.prisma.tutorKycApplication.create({
      data: {
        tutorId: tutor.id,
        status: KycAppStatus.SUBMITTED,
        fullName: data.fullName,
        dob,
        phone: data.phone,
        country: data.country,
        address1: data.addressLine1,
        address2: data.addressLine2,
        city: data.city,
        state: data.state,
        postalCode: data.postalCode,
        bankAccountHolder: data.bankAccountHolder,
        bankName: data.bankName,
        bankBranch: data.bankBranch,
        accountNumber: data.accountNumber,
        ifsc: data.ifsc,
        upiId: data.upiId,
        aadhaarNumber: data.aadhaarNumber,
        iban: data.iban,
        swift: data.swift,
      },
      select: { id: true, status: true, createdAt: true },
    });

    // Persist any provided files into KycDocument for review
    const docs = files || [];
    for (const f of docs) {
      const docType = f.fieldname || 'FILE';
      const safeDocType = String(docType)
        .trim()
        .toLowerCase()
        .replaceAll(/[^a-z0-9_-]/g, '-');
      const s3Url = await this.s3Service.uploadFile(
        f.buffer,
        f.originalname,
        `kyc/${tutor.id}/${safeDocType || 'file'}`,
      );

      await this.prisma.kycDocument.create({
        data: {
          tutorId: tutor.id,
          docType,
          url: s3Url,
          status: KycStatus.PENDING,
        },
      });
    }

    return { ok: true, applicationId: app.id, status: app.status };
  }

  async getMyStatus(userId: string) {
    const tutor = await this.prisma.tutor.findUnique({ where: { userId }, select: { id: true, status: true } });
    if (!tutor) throw new ForbiddenException('Only tutors can query KYC');

    // If tutor already approved, surface approved immediately
    if (tutor.status === 'APPROVED') {
      return { status: KycAppStatus.APPROVED };
    }

    const last = await this.prisma.tutorKycApplication.findFirst({ where: { tutorId: tutor.id }, orderBy: { createdAt: 'desc' } });
    if (!last) return { status: 'none' };
    return {
      status: last.status,
      reason: last.notes || undefined,
      reapplyAfter: last.reapplyAfter || undefined,
      rejectionCount: last.rejectionCount,
      updatedAt: last.updatedAt,
    };
  }

  private async decorateDocUrl<T extends { url: string }>(item: T): Promise<T> {
    return {
      ...item,
      url: await this.uploadsService.toReadableReference(item.url),
    };
  }

  private async decorateDocUrls<T extends { url: string }>(items: T[]): Promise<T[]> {
    return Promise.all(items.map((item) => this.decorateDocUrl(item)));
  }
}
