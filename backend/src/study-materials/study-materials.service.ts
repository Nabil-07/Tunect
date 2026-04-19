import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../common/services/s3.service';
import { CreateMaterialDto } from './dto/create-material.dto';
import { FinalizeMaterialDto } from './dto/finalize-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import { UploadsService } from '../uploads/uploads.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class StudyMaterialsService {
  private readonly logger = new Logger(StudyMaterialsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
    private readonly uploadsService: UploadsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(userId: string, dto: CreateMaterialDto, file?: Express.Multer.File) {
    const tutor = await this.prisma.tutor.findUnique({
      where: { userId },
    });

    if (!tutor) {
      throw new NotFoundException('Tutor profile not found');
    }

    let fileUrl = dto.fileUrl;

    // Upload file to S3 if provided
    if (file) {
      fileUrl = await this.s3Service.uploadFile(
        file.buffer,
        file.originalname,
        'study-materials',
      );
    }

    const created = await this.prisma.studyMaterial.create({
      data: {
        tutorId: tutor.id,
        title: dto.title,
        description: dto.description,
        fileUrl: fileUrl || '',
        fileType: file?.mimetype || dto.fileType || 'LINK',
        subject: dto.subject,
        isPublic: dto.isPublic ?? false,
      },
    });

    return this.decorateMaterialUrl(created);
  }

  async finalize(userId: string, dto: FinalizeMaterialDto) {
    const tutor = await this.prisma.tutor.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!tutor) {
      throw new NotFoundException('Tutor profile not found');
    }

    const key = await this.uploadsService.assertKeyAllowedForUseCase({
      userId,
      useCase: 'study-materials',
      keyOrUrl: dto.key,
    });

    const created = await this.prisma.studyMaterial.create({
      data: {
        tutorId: tutor.id,
        title: dto.title,
        description: dto.description,
        fileUrl: this.uploadsService.toStoredReference(key),
        fileType: dto.fileType || this.inferFileTypeFromKey(key),
        subject: dto.subject,
        isPublic: dto.isPublic ?? false,
      },
    });

    return this.decorateMaterialUrl(created);
  }

  async findTutorMaterials(userId: string) {
    const tutor = await this.prisma.tutor.findUnique({
      where: { userId },
    });

    if (!tutor) {
      return [];
    }

    const items = await this.prisma.studyMaterial.findMany({
      where: { tutorId: tutor.id },
      include: {
        _count: {
          select: {
            access: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const decorated = await this.decorateMaterialUrls(items);
    return decorated.map((item: any) => ({
      ...item,
      sharedWithCount: item?._count?.access || 0,
    }));
  }

  async findPublicMaterials(subject?: string) {
    const items = await this.prisma.studyMaterial.findMany({
      where: {
        isPublic: true,
        ...(subject && { subject }),
      },
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
      orderBy: { downloads: 'desc' },
      take: 50,
    });

    return this.decorateMaterialUrls(items);
  }

  async findOne(materialId: string) {
    const material = await this.prisma.studyMaterial.findUnique({
      where: { id: materialId },
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
    });

    if (!material) {
      throw new NotFoundException('Study material not found');
    }

    return this.decorateMaterialUrl(material);
  }

  async update(materialId: string, userId: string, dto: UpdateMaterialDto, file?: Express.Multer.File) {
    const material = await this.prisma.studyMaterial.findUnique({
      where: { id: materialId },
      include: { tutor: true },
    });

    if (!material) {
      throw new NotFoundException('Study material not found');
    }

    if (material.tutor.userId !== userId) {
      throw new ForbiddenException('You can only update your own materials');
    }

    let nextFileUrl: string | undefined;
    let nextFileType: string | undefined;

    if (file) {
      nextFileUrl = await this.s3Service.uploadFile(file.buffer, file.originalname, 'study-materials');
      nextFileType = file.mimetype || dto.fileType;
    } else if (dto.key) {
      const key = await this.uploadsService.assertKeyAllowedForUseCase({
        userId,
        useCase: 'study-materials',
        keyOrUrl: dto.key,
      });
      nextFileUrl = this.uploadsService.toStoredReference(key);
      nextFileType = dto.fileType;
    }

    const updated = await this.prisma.studyMaterial.update({
      where: { id: materialId },
      data: {
        title: dto.title,
        description: dto.description,
        subject: dto.subject,
        fileUrl: nextFileUrl,
        fileType: nextFileType,
      },
    });

    return this.decorateMaterialUrl(updated);
  }

  async delete(materialId: string, userId: string) {
    const material = await this.prisma.studyMaterial.findUnique({
      where: { id: materialId },
      include: { tutor: true },
    });

    if (!material) {
      throw new NotFoundException('Study material not found');
    }

    if (material.tutor.userId !== userId) {
      throw new ForbiddenException('You can only delete your own materials');
    }

    return this.prisma.studyMaterial.delete({
      where: { id: materialId },
    });
  }

  async incrementDownload(materialId: string) {
    const updated = await this.prisma.studyMaterial.update({
      where: { id: materialId },
      data: {
        downloads: {
          increment: 1,
        },
      },
    });

    return this.decorateMaterialUrl(updated);
  }

  async getShareableStudents(userId: string) {
    const tutor = await this.prisma.tutor.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!tutor) {
      throw new NotFoundException('Tutor profile not found');
    }

    // Get students with token balance > 0
    const balances = await this.prisma.tutorTokenBalance.findMany({
      where: { tutorId: tutor.id, balance: { gt: 0 } },
      select: {
        studentId: true,
        balance: true,
        student: {
          select: {
            id: true,
            grade: true,
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    // Also get students with future confirmed bookings (even if balance is 0)
    const futureBookings = await this.prisma.booking.findMany({
      where: {
        tutorId: tutor.id,
        startTime: { gt: new Date() },
        status: { in: ['CONFIRMED', 'PENDING'] },
      },
      select: {
        studentId: true,
        student: {
          select: {
            id: true,
            grade: true,
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
      },
      distinct: ['studentId'],
    });

    // Merge both sets of students (balance > 0 OR future bookings)
    const studentMap = new Map<string, { id: string; name: string; email: string | null; grade: string | null; tokenBalance: number }>();

    for (const entry of balances) {
      studentMap.set(entry.student.id, {
        id: entry.student.id,
        name: entry.student.user?.name || entry.student.user?.email || 'Student',
        email: entry.student.user?.email || null,
        grade: entry.student.grade || null,
        tokenBalance: Number(entry.balance),
      });
    }

    for (const booking of futureBookings) {
      if (!studentMap.has(booking.student.id)) {
        studentMap.set(booking.student.id, {
          id: booking.student.id,
          name: booking.student.user?.name || booking.student.user?.email || 'Student',
          email: booking.student.user?.email || null,
          grade: booking.student.grade || null,
          tokenBalance: 0,
        });
      }
    }

    return Array.from(studentMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  async getShareTargets(materialId: string, userId: string) {
    const material = await this.prisma.studyMaterial.findUnique({
      where: { id: materialId },
      include: { tutor: true },
    });

    if (!material) {
      throw new NotFoundException('Study material not found');
    }

    if (material.tutor.userId !== userId) {
      throw new ForbiddenException('You can only share your own materials');
    }

    const [eligibleStudents, existingAccess] = await Promise.all([
      this.getShareableStudents(userId),
      this.prisma.materialAccess.findMany({
        where: { materialId },
        select: { studentId: true },
      }),
    ]);

    return {
      eligibleStudents,
      sharedStudentIds: existingAccess.map((entry) => entry.studentId),
    };
  }

  async shareWithStudents(materialId: string, userId: string, studentIds: string[]) {
    const material = await this.prisma.studyMaterial.findUnique({
      where: { id: materialId },
      include: { tutor: { include: { user: { select: { name: true } } } } },
    });

    if (!material) {
      throw new NotFoundException('Study material not found');
    }

    if (material.tutor.userId !== userId) {
      throw new ForbiddenException('You can only share your own materials');
    }

    const uniqueStudentIds = Array.from(
      new Set((studentIds || []).map((id) => String(id || '').trim()).filter(Boolean)),
    );

    const eligibleStudents = await this.getShareableStudents(userId);
    const eligibleIdSet = new Set(eligibleStudents.map((entry) => entry.id));

    const invalidIds = uniqueStudentIds.filter((id) => !eligibleIdSet.has(id));
    if (invalidIds.length > 0) {
      throw new BadRequestException('One or more selected students are not eligible for sharing');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.materialAccess.deleteMany({ where: { materialId } });

      if (uniqueStudentIds.length > 0) {
        await tx.materialAccess.createMany({
          data: uniqueStudentIds.map((studentId) => ({ materialId, studentId })),
          skipDuplicates: true,
        });
      }
    });

    // Send email notifications to shared students
    if (uniqueStudentIds.length > 0) {
      const students = await this.prisma.student.findMany({
        where: { id: { in: uniqueStudentIds } },
        select: { user: { select: { name: true, email: true } } },
      });

      const tutorName = material.tutor.user?.name ?? undefined;
      for (const student of students) {
        if (student.user?.email) {
          this.notificationsService.sendMaterialSharedEmail({
            studentEmail: student.user.email,
            studentName: student.user.name ?? undefined,
            tutorName,
            materialTitle: material.title,
          }).catch((err) => this.logger.warn(`Failed to send material shared email: ${err?.message}`));
        }
      }
    }

    return {
      success: true,
      sharedStudentIds: uniqueStudentIds,
    };
  }

  async findSharedWithStudent(userId: string) {
    const student = await this.prisma.student.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!student) {
      return [];
    }

    const accessRows = await this.prisma.materialAccess.findMany({
      where: { studentId: student.id },
      orderBy: { accessedAt: 'desc' },
      include: {
        studyMaterial: {
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
      },
    });

    const items = accessRows.map((row) => ({
      ...row.studyMaterial,
      sharedAt: row.accessedAt,
      tutorName: row.studyMaterial.tutor.user?.name || 'Tutor',
    }));

    return this.decorateMaterialUrls(items);
  }

  private inferFileTypeFromKey(key: string): string {
    const extension = key.split('.').pop()?.toLowerCase();
    if (!extension) {
      return 'FILE';
    }

    const map: Record<string, string> = {
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      txt: 'text/plain',
    };

    return map[extension] || 'FILE';
  }

  private async decorateMaterialUrl<T extends { fileUrl: string }>(item: T): Promise<T> {
    return {
      ...item,
      fileUrl: await this.uploadsService.toReadableReference(item.fileUrl),
    };
  }

  private async decorateMaterialUrls<T extends { fileUrl: string }>(items: T[]): Promise<T[]> {
    return Promise.all(items.map((item) => this.decorateMaterialUrl(item)));
  }
}
