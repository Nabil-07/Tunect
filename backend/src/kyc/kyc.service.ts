import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateKycDto } from './dto/create-kyc.dto';
import { QueryKycDto } from './dto/query-kyc.dto';
import { ReviewKycDto } from './dto/review-kyc.dto';
import { KycStatus, KycAppStatus, TutorStatus } from '@prisma/client';

@Injectable()
export class KycService {
  constructor(private prisma: PrismaService) {}

  // tutor must be approved/pending; upload KYC doc
  async createMine(userId: string, dto: CreateKycDto) {
    const tutor = await this.prisma.tutor.findUnique({ where: { userId }, select: { id: true } });
    if (!tutor) throw new ForbiddenException('Only tutors can upload KYC');

    return this.prisma.kycDocument.create({
      data: { tutorId: tutor.id, docType: dto.docType, url: dto.url, notes: dto.notes },
      select: { id: true, docType: true, url: true, status: true, notes: true, createdAt: true },
    });
  }

  async listMine(userId: string) {
    const tutor = await this.prisma.tutor.findUnique({ where: { userId }, select: { id: true } });
    if (!tutor) throw new ForbiddenException('Only tutors can view KYC');
    return this.prisma.kycDocument.findMany({
      where: { tutorId: tutor.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, docType: true, url: true, status: true, notes: true, createdAt: true },
    });
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

    return { items, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  async review(id: string, dto: ReviewKycDto) {
    // ensure document exists
    const doc = await this.prisma.kycDocument.findUnique({ where: { id }, select: { id: true, tutorId: true } });
    if (!doc) throw new NotFoundException('KYC document not found');

    // update document
    const updated = await this.prisma.kycDocument.update({
      where: { id },
      data: { status: dto.status, notes: dto.notes },
      select: { id: true, docType: true, url: true, status: true, notes: true, createdAt: true },
    });

    // Update latest application + tutor status to reflect review outcome
    const latestApp = await this.prisma.tutorKycApplication.findFirst({
      where: { tutorId: doc.tutorId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    const appStatus: KycAppStatus = dto.status === KycStatus.APPROVED
      ? KycAppStatus.APPROVED
      : dto.status === KycStatus.REJECTED
        ? KycAppStatus.REJECTED
        : KycAppStatus.UNDER_REVIEW;

    const tutorStatus: TutorStatus | null = dto.status === KycStatus.APPROVED
      ? TutorStatus.APPROVED
      : dto.status === KycStatus.REJECTED
        ? TutorStatus.REJECTED
        : null;

    if (latestApp) {
      await this.prisma.tutorKycApplication.update({
        where: { id: latestApp.id },
        data: { status: appStatus, notes: dto.notes },
      });
    }

    if (tutorStatus) {
      await this.prisma.tutor.update({ where: { id: doc.tutorId }, data: { status: tutorStatus } });
    }

    return updated;
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

    return { tutor, application, documents };
  }

  // ===== Unified submit + status =====
  async submitUnified(userId: string, json: string, files: Array<Express.Multer.File>) {
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

    // Persist any provided files into KycDocument for review (names only; real storage should save URLs)
    const docs = files || [];
    for (const f of docs) {
      const docType = f.fieldname || 'FILE';
      await this.prisma.kycDocument.create({ data: { tutorId: tutor.id, docType, url: f.originalname || 'upload', status: KycStatus.PENDING } });
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
}
