import { Controller, Get, Param, Res, StreamableFile } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { UploadsService } from './uploads.service';
import { S3Service } from '../common/services/s3.service';

@ApiTags('uploads')
@Controller('uploads')
export class UploadsPublicController {
  constructor(
    private readonly uploadsService: UploadsService,
    private readonly s3Service: S3Service,
  ) {}

  @Get('open/:token')
  async openFile(@Param('token') token: string, @Res({ passthrough: true }) res: Response) {
    const { key, expiresAtMs } = this.uploadsService.resolveSignedReadToken(token);
    const object = await this.s3Service.getObjectByKey(key);

    const fileName = decodeURIComponent(key.split('/').filter(Boolean).pop() || 'file');
    const contentType = String(object.ContentType || 'application/octet-stream');
    const contentLength = Number(object.ContentLength || 0);

    res.setHeader('Content-Type', contentType);
    if (Number.isFinite(contentLength) && contentLength > 0) {
      res.setHeader('Content-Length', String(contentLength));
    }
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.setHeader('X-Url-Expires-At', new Date(expiresAtMs).toISOString());

    return new StreamableFile(object.Body as any);
  }
}
