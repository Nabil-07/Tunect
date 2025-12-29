import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../common/services/s3.service';
import { CreateMaterialDto } from './dto/create-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';

@Injectable()
export class StudyMaterialsService {
  constructor(
    private prisma: PrismaService,
    private s3Service: S3Service,
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

    return this.prisma.studyMaterial.create({
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
  }

  async findTutorMaterials(userId: string) {
    const tutor = await this.prisma.tutor.findUnique({
      where: { userId },
    });

    if (!tutor) {
      return [];
    }

    return this.prisma.studyMaterial.findMany({
      where: { tutorId: tutor.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findPublicMaterials(subject?: string) {
    return this.prisma.studyMaterial.findMany({
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

    return material;
  }

  async update(materialId: string, userId: string, dto: UpdateMaterialDto) {
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

    return this.prisma.studyMaterial.update({
      where: { id: materialId },
      data: {
        title: dto.title,
        description: dto.description,
        isPublic: dto.isPublic,
        subject: dto.subject,
      },
    });
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
    return this.prisma.studyMaterial.update({
      where: { id: materialId },
      data: {
        downloads: {
          increment: 1,
        },
      },
    });
  }
}
