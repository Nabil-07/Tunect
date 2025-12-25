import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateAttachmentDto {
  messageId: string;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  fileType: string;
}

@Injectable()
export class AttachmentsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateAttachmentDto) {
    return this.prisma.messageAttachment.create({
      data: dto,
    });
  }

  async getByMessage(messageId: string) {
    return this.prisma.messageAttachment.findMany({
      where: { messageId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async delete(id: string) {
    return this.prisma.messageAttachment.delete({
      where: { id },
    });
  }

  async createMultiple(messageId: string, files: Array<Omit<CreateAttachmentDto, 'messageId'>>) {
    return Promise.all(
      files.map((file) =>
        this.create({
          messageId,
          ...file,
        }),
      ),
    );
  }
}
