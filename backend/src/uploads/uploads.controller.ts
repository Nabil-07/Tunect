import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
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
}
