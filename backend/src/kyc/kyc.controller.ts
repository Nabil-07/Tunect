import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, UseGuards, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { KycService } from './kyc.service';
import { CreateKycDto } from './dto/create-kyc.dto';
import { FinalizeKycDto } from './dto/finalize-kyc.dto';
import { QueryKycDto } from './dto/query-kyc.dto';
import { ReviewKycDto } from './dto/review-kyc.dto';
import { RequestResubmissionDto } from './dto/request-resubmission.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AnyFilesInterceptor } from '@nestjs/platform-express';

const MAX_KYC_FILE_SIZE_BYTES = 8 * 1024 * 1024;
const KYC_ALLOWED_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

@ApiTags('kyc')
@ApiBearerAuth()
@Controller('kyc')
export class KycController {
  constructor(private readonly svc: KycService) {}

  // Tutor: upload KYC document (we accept a URL from your uploader)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TUTOR')
  @Post()
  createMine(@CurrentUser('id') userId: string, @Body() dto: CreateKycDto) {
    return this.svc.createMine(userId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TUTOR')
  @Post('finalize')
  finalizeMine(@CurrentUser('id') userId: string, @Body() dto: FinalizeKycDto) {
    return this.svc.finalizeMine(userId, dto);
  }

  // Tutor: list my KYC documents
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TUTOR')
  @Get('me')
  listMine(@CurrentUser('id') userId: string) {
    return this.svc.listMine(userId);
  }

  // Unified KYC submit: multipart with 'data' json and optional files
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TUTOR')
  @Post('submit')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(AnyFilesInterceptor({
    limits: {
      fileSize: MAX_KYC_FILE_SIZE_BYTES,
      files: 10,
    },
    fileFilter: (_req, file, cb) => {
      if (KYC_ALLOWED_MIMES.has(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new BadRequestException('Unsupported KYC file type'), false);
      }
    },
  }))
  submitUnified(
    @CurrentUser('id') userId: string,
    @UploadedFiles() files: Array<any>,
    @Body('data') data: string,
    @Body() body: Record<string, unknown>,
  ) {
    const payload = typeof data === 'string' && data.trim().length > 0
      ? data
      : JSON.stringify(body || {});
    return this.svc.submitUnified(userId, payload, files || []);
  }

  // Simple status for current tutor KYC application
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TUTOR')
  @Get('status')
  getMyStatus(@CurrentUser('id') userId: string) {
    return this.svc.getMyStatus(userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TUTOR')
  @Get('submission')
  getMySubmission(@CurrentUser('id') userId: string) {
    return this.svc.getMySubmission(userId);
  }

  // Admin: list all with filters/pagination
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get()
  listAll(@Query() q: QueryKycDto) {
    return this.svc.listAll(q);
  }

  // Admin: fetch a tutor's latest application + documents in one bundle
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get('admin/:tutorId')
  getTutorBundle(@Param('tutorId') tutorId: string) {
    return this.svc.getTutorBundle(tutorId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('admin/:tutorId/request-resubmission')
  @Patch('admin/:tutorId/requestResubmission')
  @Post('admin/:tutorId/requestResubmission')
  @Patch('admin/:tutorId/resubmission-request')
  @Post('admin/:tutorId/resubmission-request')
  @Patch('admin/:tutorId/request-resubmission')
  requestResubmission(
    @Param('tutorId') tutorId: string,
    @Body() dto: RequestResubmissionDto,
    @CurrentUser('id') adminId: string,
  ) {
    return this.svc.requestResubmission(tutorId, dto, adminId);
  }

  // Admin: approve/reject a KYC document
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch('doc/:docId')
  review(@Param('docId') docId: string, @Body() dto: ReviewKycDto, @CurrentUser('id') adminId: string) {
    return this.svc.review(docId, dto, adminId);
  }
}
