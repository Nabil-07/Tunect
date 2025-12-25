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
import { diskStorage } from 'multer';
import { extname } from 'path';
import * as fs from 'fs/promises';

@ApiTags('attachments')
@ApiBearerAuth()
@Controller('attachments')
@UseGuards(JwtAuthGuard)
export class AttachmentsController {
  constructor(private readonly service: AttachmentsService) {}

  @ApiOperation({ summary: 'Upload file attachments' })
  @ApiConsumes('multipart/form-data')
  @Post('upload/:messageId')
  @UseInterceptors(
    FilesInterceptor('files', 5, {
      storage: diskStorage({
        destination: './uploads/attachments',
        filename: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
      fileFilter: (req, file, cb) => {
        // Allow common file types
        const allowedMimes = [
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
        ];

        if (allowedMimes.includes(file.mimetype)) {
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

    // Ensure upload directory exists
    await fs.mkdir('./uploads/attachments', { recursive: true });

    const attachments = files.map((file) => ({
      fileUrl: `/uploads/attachments/${file.filename}`,
      fileName: file.originalname,
      fileSize: file.size,
      fileType: file.mimetype,
    }));

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
    
    // Optionally delete the physical file
    try {
      await fs.unlink(`.${attachment.fileUrl}`);
    } catch (error) {
      // File might not exist, ignore error
    }

    return { success: true };
  }
}
