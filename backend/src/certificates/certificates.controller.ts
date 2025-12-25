import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CertificatesService } from './certificates.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('certificates')
@ApiBearerAuth()
@Controller('certificates')
@UseGuards(JwtAuthGuard)
export class CertificatesController {
  constructor(private readonly service: CertificatesService) {}

  @Get('my')
  async getMyCertificates(@CurrentUser('sub') userId: string) {
    return this.service.getStudentCertificates(userId);
  }

  @Get('eligible')
  async getEligible(@CurrentUser('sub') userId: string) {
    return this.service.getEligibleCertificates(userId);
  }

  @Get('subject/:subject')
  async getCertificatesBySubject(
    @CurrentUser('sub') userId: string,
    @Param('subject') subject: string,
  ) {
    return this.service.getCertificatesBySubject(userId, subject);
  }

  @Get(':certificateId')
  async getCertificate(
    @Param('certificateId') certificateId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.service.getCertificateById(certificateId, userId);
  }
}
