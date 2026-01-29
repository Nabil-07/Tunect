import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { PaymentsService } from './payments.service';

@ApiTags('finance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/finance/payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('student')
  async getStudentPayments(
    @Query('page') page: string = '1',
    @Query('pageSize') pageSize: string = '100',
  ) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSizeNum = Math.max(1, parseInt(pageSize, 10) || 100);
    return this.paymentsService.getStudentPayments(pageNum, pageSizeNum);
  }

  @Get('tutor-due')
  async getTutorPaymentsDue(
    @Query('page') page: string = '1',
    @Query('pageSize') pageSize: string = '100',
  ) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSizeNum = Math.max(1, parseInt(pageSize, 10) || 100);
    return this.paymentsService.getTutorPaymentsDue(pageNum, pageSizeNum);
  }
}
