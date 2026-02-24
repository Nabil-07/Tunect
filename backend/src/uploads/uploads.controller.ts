import { Body, Controller, Post, Req, UploadedFile, UseGuards, UseInterceptors, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PresignGetDto } from './dto/presign-get.dto';
import { PresignUploadDto } from './dto/presign-upload.dto';
import { UploadsService } from './uploads.service';

@ApiTags('uploads')
@ApiBearerAuth()
@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('presign')
  presign(@Req() req: any, @Body() dto: PresignUploadDto) {
    const userId: string = req.user?.sub ?? req.user?.id;
    return this.uploadsService.createPresignedUpload(userId, dto);
  }

  @Post('presign-get')
  presignGet(@Req() req: any, @Body() dto: PresignGetDto) {
    const userId: string = req.user?.sub ?? req.user?.id;
    const userRole: string | undefined = req.user?.role;
    return this.uploadsService.createPresignedGet(userId, dto.key, userRole, dto.expiresIn ?? 600);
  }

  /** Direct file upload (bypasses S3 CORS) — backend proxies to S3 */
  @Post('direct')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async directUpload(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { useCase?: string },
  ) {
    if (!file) throw new BadRequestException('No file provided');
    const userId: string = req.user?.sub ?? req.user?.id;
    const useCase = (body.useCase || 'blogs') as any;
    return this.uploadsService.directUpload(userId, file, useCase);
  }
}
