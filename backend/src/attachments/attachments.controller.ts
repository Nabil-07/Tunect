import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { AttachmentsService } from './attachments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { S3Service } from '../common/services/s3.service';

const MAX_ATTACHMENT_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ATTACHMENT_ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]);

@ApiTags('attachments')
@ApiBearerAuth()
@Controller('attachments')
@UseGuards(JwtAuthGuard)
export class AttachmentsController {
  constructor(
    private readonly service: AttachmentsService,
    private readonly s3Service: S3Service,
  ) {}

  @ApiOperation({ summary: 'Upload file attachments' })
  @ApiConsumes('multipart/form-data')
  @Post('upload/:messageId')
  @UseInterceptors(
    FilesInterceptor('files', 5, {
      limits: {
        fileSize: MAX_ATTACHMENT_FILE_SIZE_BYTES,
      },
      fileFilter: (_req, file, cb) => {
        if (ATTACHMENT_ALLOWED_MIMES.has(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('File type not allowed'), false);
        }
      },
    }),
  )
  async uploadFiles(
    @Param('messageId') messageId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files uploaded');
    }

    const attachments = await Promise.all(files.map(async (file) => ({
      fileUrl: await this.s3Service.uploadFile(
        file.buffer,
        file.originalname,
        `test/attachments/${messageId}`,
      ),
      fileName: file.originalname,
      fileSize: file.size,
      fileType: file.mimetype,
    })));

    return this.service.createMultiple(messageId, attachments);
  }

  @ApiOperation({ summary: 'Get attachments for a message' })
  @Get('message/:messageId')
  async getMessageAttachments(@Param('messageId') messageId: string) {
    return this.service.getByMessage(messageId);
  }

  @ApiOperation({ summary: 'Delete attachment' })
  @Delete(':id')
  async deleteAttachment(@Param('id') id: string) {
    const attachment = await this.service.delete(id);

    try {
      await this.s3Service.deleteFile(attachment.fileUrl);
    } catch {}

    return { success: true };
  }
}
