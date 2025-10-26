import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards, ParseUUIDPipe, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { KycService } from './kyc.service';
import { CreateKycDto } from './dto/create-kyc.dto';
import { QueryKycDto } from './dto/query-kyc.dto';
import { ReviewKycDto } from './dto/review-kyc.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AnyFilesInterceptor } from '@nestjs/platform-express';

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
  @UseInterceptors(AnyFilesInterceptor())
  submitUnified(@CurrentUser('id') userId: string, @UploadedFiles() files: Array<Express.Multer.File>, @Body('data') data: string) {
    return this.svc.submitUnified(userId, data, files || []);
  }

  // Simple status for current tutor KYC application
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TUTOR')
  @Get('status')
  getMyStatus(@CurrentUser('id') userId: string) {
    return this.svc.getMyStatus(userId);
  }

  // Admin: list all with filters/pagination
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Get()
  listAll(@Query() q: QueryKycDto) {
    return this.svc.listAll(q);
  }

  // Admin: approve/reject a KYC document
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Patch(':id')
  review(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: ReviewKycDto) {
    return this.svc.review(id, dto);
  }
}
