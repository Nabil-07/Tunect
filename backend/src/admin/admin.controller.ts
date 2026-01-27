import { Controller, Get, Query, UseGuards, Param, Patch, Body, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { AuditService } from '../audit/audit.service';
import { MetricsService } from '../metrics/metrics.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PaginationDto } from './dto/pagination.dto';
import { AuditListDto } from './dto/audit-list.dto';
import { TutorStatus, BookingStatus, PaymentStatus } from '@prisma/client';
import { SetTutorStatusDto } from './dto/set-tutor-status.dto';
import { AdjustTokensDto } from './dto/adjust-tokens.dto';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly svc: AdminService,
    private readonly audit: AuditService,
    private readonly metrics: MetricsService,
  ) {}

  @Get('dashboard')
  dashboard() {
    return this.svc.dashboard();
  }

  @Get('users')
  users(@Query() q: PaginationDto) {
    return this.svc.listUsers(q);
  }

  @Get('tutors')
  tutors(@Query() q: PaginationDto & { status?: TutorStatus }) {
    return this.svc.listTutors(q as any);
  }

  @Patch('tutors/:id/status')
  setTutorStatus(@Param('id') id: string, @Body() dto: SetTutorStatusDto, @Req() req: { user?: { id: string } }) {
    return this.svc.setTutorStatus(id, dto, req.user!.id);
  }

  @Get('students')
  students(@Query() q: PaginationDto) {
    return this.svc.listStudents(q);
  }

  @Get('bookings')
  bookings(@Query() q: PaginationDto & { status?: BookingStatus }) {
    return this.svc.listBookings(q as any);
  }

  @Get('payments')
  payments(@Query() q: PaginationDto & { status?: PaymentStatus }) {
    return this.svc.listPayments(q as any);
  }

  @Post('users/:id/unban')
  unbanUser(@Param('id') id: string, @Req() req: { user?: { id: string } }) {
    return this.svc.unbanUser(id, req.user!.id);
  }

  @Post('students/tokens/adjust')
  adjustTokens(@Body() dto: AdjustTokensDto, @Req() req: { user?: { id: string } }) {
    return this.svc.adjustTokens(dto, req.user!.id);
  }

  @Get('audit')
  listAudit(@Query() q: AuditListDto) {
    return this.audit.list({
      page: q.page,
      pageSize: q.pageSize,
      entityType: q.entityType,
      from: q.from,
      to: q.to,
    });
  }

  @Get('metrics')
  getMetrics() {
    return this.metrics.getSummary();
  }
}
