import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateKycDto } from './dto/create-kyc.dto';
import { FinalizeKycDto } from './dto/finalize-kyc.dto';
import { QueryKycDto } from './dto/query-kyc.dto';
import { ReviewKycDto } from './dto/review-kyc.dto';
import { RequestResubmissionDto } from './dto/request-resubmission.dto';
import { KycStatus, KycAppStatus, TutorStatus, AuditEntityType } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { S3Service } from '../common/services/s3.service';
import { UploadsService } from '../uploads/uploads.service';

const CORRECTION_NOTES_PREFIX = 'KYC_CORRECTION::';

type KycCorrectionRequest = {
  version: 1;
  fields: string[];
  message?: string;
  requestedAt: string;
  requestedBy: string;
};

type KycUploadedDocRef = {
  docType: string;
  key: string;
};

const KYC_EDITABLE_FIELDS = new Set([
  'fullName',
  'dob',
  'phone',
  'country',
  'addressLine1',
  'addressLine2',
  'city',
  'state',
  'postalCode',
  'bankAccountHolder',
  'bankName',
  'bankBranch',
  'accountNumber',
  'ifsc',
  'upiId',
  'iban',
  'swift',
  'selfie',
  'degreeCertificates',
]);

const DATA_FIELDS_FOR_CHANGE_CHECK: string[] = [
  'fullName',
  'dob',
  'phone',
  'country',
  'addressLine1',
  'addressLine2',
  'city',
  'state',
  'postalCode',
  'bankAccountHolder',
  'bankName',
  'bankBranch',
  'accountNumber',
  'ifsc',
  'upiId',
  'iban',
  'swift',
];

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

    const parsed = this.parseCorrectionRequest(application?.notes);

    return {
      tutor,
      application: application
        ? {
            ...application,
            notes: parsed.notes,
            correctionRequest: parsed.request,
          }
        : null,
      documents: await this.decorateDocUrls(documents),
    };
  }

  async requestResubmission(tutorId: string, dto: RequestResubmissionDto, adminId: string) {
    const tutor = await this.prisma.tutor.findUnique({ where: { id: tutorId }, select: { id: true } });
    if (!tutor) throw new NotFoundException('Tutor not found');

    const last = await this.prisma.tutorKycApplication.findFirst({
      where: { tutorId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, notes: true, status: true },
    });
    if (!last) throw new NotFoundException('No KYC application found for tutor');

    const fields = Array.from(new Set((dto.fields || []).map((f) => String(f || '').trim()).filter(Boolean)));
    const invalid = fields.filter((f) => !KYC_EDITABLE_FIELDS.has(f));
    if (invalid.length) {
      throw new ForbiddenException(`Invalid resubmission fields: ${invalid.join(', ')}`);
    }

    const request: KycCorrectionRequest = {
      version: 1,
      fields,
      message: dto.message,
      requestedAt: new Date().toISOString(),
      requestedBy: adminId,
    };

    const updated = await this.prisma.tutorKycApplication.update({
      where: { id: last.id },
      data: {
        status: KycAppStatus.REJECTED,
        notes: this.encodeCorrectionRequest(request),
      },
      select: { id: true, status: true, notes: true, updatedAt: true },
    });

    await this.prisma.tutor.update({
      where: { id: tutorId },
      data: { status: TutorStatus.REJECTED },
    });

    this.audit.log({
      adminId,
      action: 'KYC_RESUBMISSION_REQUESTED',
      entityType: AuditEntityType.KYC,
      entityId: last.id,
      beforeData: { status: last.status, notes: last.notes, tutorId },
      afterData: { status: updated.status, notes: updated.notes, tutorId, fields },
    });

    return {
      ok: true,
      applicationId: updated.id,
      status: updated.status,
      correctionRequest: request,
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

    const parsedCorrection = this.parseCorrectionRequest(last?.notes);
    const correctionRequest = last?.status === KycAppStatus.REJECTED ? parsedCorrection.request : null;
    if (correctionRequest?.fields?.length) {
      const requestedFields = new Set(correctionRequest.fields);
      const previousValues: Record<string, unknown> = this.mapApplicationToSubmissionData(last);
      const currentValues: Record<string, unknown> = {
        ...previousValues,
        fullName: data.fullName,
        dob: data.dob,
        phone: data.phone,
        country: data.country,
        addressLine1: data.addressLine1,
        addressLine2: data.addressLine2,
        city: data.city,
        state: data.state,
        postalCode: data.postalCode,
        bankAccountHolder: data.bankAccountHolder,
        bankName: data.bankName,
        bankBranch: data.bankBranch,
        accountNumber: data.accountNumber,
        ifsc: data.ifsc,
        upiId: data.upiId,
        iban: data.iban,
        swift: data.swift,
      };

      const changedNonRequested: string[] = [];
      for (const key of DATA_FIELDS_FOR_CHANGE_CHECK) {
        if (requestedFields.has(key)) continue;
        const prev = this.normalizeForCompareByField(key, previousValues[key]);
        const curr = this.normalizeForCompareByField(key, currentValues[key]);
        if (prev !== curr) changedNonRequested.push(key);
      }

      const changedDocFields = (files || [])
        .map((f) => String(f?.fieldname || '').trim())
        .filter(Boolean)
        .filter((f) => !requestedFields.has(f));

      if (changedNonRequested.length || changedDocFields.length) {
        const details = Array.from(new Set([...changedNonRequested, ...changedDocFields]));
        const requestedLabel = Array.from(requestedFields).join(', ');
        const detailLabel = details.length ? `. Detected changes in: ${details.join(', ')}` : '';
        throw new ForbiddenException(
          `Only requested fields can be updated: ${requestedLabel}${detailLabel}`,
        );
      }
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
        notes: undefined,
      },
      select: { id: true, status: true, createdAt: true },
    });

    const uploadedDocs = this.extractUploadedDocRefs(data?.uploadedDocs);

    // Persist any provided files into KycDocument for review
    const docs = files || [];
    for (const f of docs) {
      const docType = f.fieldname || 'FILE';
      const safeDocType = this.toSafeDocType(docType);
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

    for (const doc of uploadedDocs) {
      const key = await this.uploadsService.assertKeyAllowedForUseCase({
        userId,
        useCase: 'kyc',
        keyOrUrl: doc.key,
        docType: doc.docType,
      });

      await this.prisma.kycDocument.create({
        data: {
          tutorId: tutor.id,
          docType: doc.docType,
          url: this.uploadsService.toStoredReference(key),
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
    const parsed = this.parseCorrectionRequest(last.notes);
    return {
      status: last.status,
      reason: parsed.notes || undefined,
      correctionRequest: parsed.request || undefined,
      reapplyAfter: last.reapplyAfter || undefined,
      rejectionCount: last.rejectionCount,
      updatedAt: last.updatedAt,
    };
  }

  async getMySubmission(userId: string) {
    const tutor = await this.prisma.tutor.findUnique({ where: { userId }, select: { id: true } });
    if (!tutor) throw new ForbiddenException('Only tutors can query KYC submission');

    const application = await this.prisma.tutorKycApplication.findFirst({
      where: { tutorId: tutor.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        status: true,
        notes: true,
        fullName: true,
        dob: true,
        phone: true,
        country: true,
        address1: true,
        address2: true,
        city: true,
        state: true,
        postalCode: true,
        bankAccountHolder: true,
        bankName: true,
        bankBranch: true,
        accountNumber: true,
        ifsc: true,
        upiId: true,
        iban: true,
        swift: true,
      },
    });

    if (!application) {
      return { application: null, documents: [] };
    }

    let documents = await this.prisma.kycDocument.findMany({
      where: {
        tutorId: tutor.id,
        createdAt: { gte: application.createdAt },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, docType: true, url: true, status: true, notes: true, createdAt: true },
    });

    if (!documents.length) {
      documents = await this.prisma.kycDocument.findMany({
        where: { tutorId: tutor.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, docType: true, url: true, status: true, notes: true, createdAt: true },
      });
    }

    const parsed = this.parseCorrectionRequest(application.notes);

    return {
      application: {
        ...application,
        notes: parsed.notes,
        correctionRequest: parsed.request,
      },
      documents: await this.decorateDocUrls(documents),
    };
  }

  private normalizeForCompare(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return '';
    return String(value).trim();
  }

  private toSafeDocType(value: unknown): string {
    const raw = typeof value === 'string' ? value : '';
    return (raw || 'file')
      .trim()
      .toLowerCase()
      .replaceAll(/[^a-z0-9_-]/g, '-')
      .replaceAll(/-+/g, '-')
      .replaceAll(/(^-|-$)/g, '') || 'file';
  }

  private extractUploadedDocRefs(raw: unknown): KycUploadedDocRef[] {
    if (!Array.isArray(raw)) return [];

    return raw
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;

        const record = entry as Record<string, unknown>;
        const key = typeof record.key === 'string' ? record.key.trim() : '';
        const docType = this.toSafeDocType(record.docType || 'document');
        if (!key) return null;
        return { docType, key };
      })
      .filter((entry): entry is KycUploadedDocRef => !!entry);
  }

  private normalizeForCompareByField(field: string, value: unknown): string {
    const raw = this.normalizeForCompare(value);
    if (!raw) return '';

    if (field === 'dob') {
      const date = new Date(raw);
      return Number.isNaN(date.getTime()) ? raw : date.toISOString().slice(0, 10);
    }

    if (field === 'ifsc' || field === 'swift' || field === 'iban' || field === 'country') {
      return raw.replaceAll(/\s+/g, '').toUpperCase();
    }

    if (field === 'accountNumber' || field === 'phone') {
      return raw.replaceAll(/\D/g, '');
    }

    if (field === 'addressLine1' || field === 'addressLine2' || field === 'city' || field === 'state' || field === 'bankName' || field === 'bankBranch' || field === 'bankAccountHolder') {
      return raw.replaceAll(/\s+/g, ' ');
    }

    return raw;
  }

  private mapApplicationToSubmissionData(app: any) {
    return {
      fullName: app?.fullName,
      dob: app?.dob ? new Date(app.dob).toISOString().slice(0, 10) : undefined,
      phone: app?.phone,
      country: app?.country,
      addressLine1: app?.address1,
      addressLine2: app?.address2,
      city: app?.city,
      state: app?.state,
      postalCode: app?.postalCode,
      bankAccountHolder: app?.bankAccountHolder,
      bankName: app?.bankName,
      bankBranch: app?.bankBranch,
      accountNumber: app?.accountNumber,
      ifsc: app?.ifsc,
      upiId: app?.upiId,
      iban: app?.iban,
      swift: app?.swift,
      aadhaarNumber: app?.aadhaarNumber,
    };
  }

  private encodeCorrectionRequest(request: KycCorrectionRequest): string {
    return `${CORRECTION_NOTES_PREFIX}${JSON.stringify(request)}`;
  }

  private parseCorrectionRequest(notes?: string | null): { notes?: string; request?: KycCorrectionRequest } {
    if (!notes) return {};
    const trimmed = String(notes).trim();
    if (!trimmed.startsWith(CORRECTION_NOTES_PREFIX)) {
      return { notes: trimmed };
    }

    const raw = trimmed.slice(CORRECTION_NOTES_PREFIX.length);
    try {
      const parsed = JSON.parse(raw) as KycCorrectionRequest;
      if (!Array.isArray(parsed?.fields)) return {};
      const fields = parsed.fields
        .map((f) => String(f || '').trim())
        .filter((f) => KYC_EDITABLE_FIELDS.has(f));
      return {
        notes: parsed.message,
        request: {
          ...parsed,
          version: 1,
          fields,
        },
      };
    } catch {
      return {};
    }
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
