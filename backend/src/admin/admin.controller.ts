import { Controller, Get, Query, UseGuards, Param, Patch, Body, Post, Req, Delete } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { AuditService } from '../audit/audit.service';
import { MetricsService } from '../metrics/metrics.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { DirectorGuard } from '../auth/director.guard';
import { Roles } from '../auth/roles.decorator';
import { PaginationDto } from './dto/pagination.dto';
import { AuditListDto } from './dto/audit-list.dto';
import { TutorStatus, BookingStatus, PaymentStatus } from '@prisma/client';
import { SetTutorStatusDto } from './dto/set-tutor-status.dto';
import { AdjustTokensDto } from './dto/adjust-tokens.dto';
import type { PolicyConfig } from '../policy-config/default-policy-config';

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
  async dashboard() {
    try {
      return await this.svc.dashboard();
    } catch (error: any) {
      console.error('[AdminController.dashboard] Error:', {
        message: error?.message,
        stack: error?.stack,
      });
      // Return default dashboard data instead of throwing to prevent 500 errors
      return {
        totals: {
          users: 0,
          tutors: 0,
          students: 0,
          bookings: 0,
          payments: 0,
          revenueInMinor: 0,
        },
        latestSignups: [],
        pendingKyc: 0,
      };
    }
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
  setTutorStatus(
    @Param('id') id: string,
    @Body() dto: SetTutorStatusDto,
    @Req() req: any,
  ) {
    return this.svc.setTutorStatus(id, dto, req.user!.id, req);
  }

  @Patch('tutors/:id/trending')
  setTutorTrending(
    @Param('id') id: string,
    @Body() dto: { isTrending: boolean },
    @Req() req: any,
  ) {
    return this.svc.setTutorTrending(id, dto.isTrending, req.user!.id, req);
  }

  @Get('students')
  students(@Query() q: PaginationDto) {
    return this.svc.listStudents(q);
  }

  @Get('students/:id')
  getStudentDetail(@Param('id') id: string) {
    return this.svc.getStudentDetail(id);
  }

  @Get('tutors/:id')
  getTutorDetail(@Param('id') id: string) {
    return this.svc.getTutorDetail(id);
  }

  @Get('bookings')
  bookings(@Query() q: PaginationDto & { status?: BookingStatus; type?: string; dateFrom?: string; dateTo?: string; sortBy?: string; sortDir?: string }) {
    return this.svc.listBookings(q as any);
  }

  @Get('payments')
  payments(@Query() q: PaginationDto & { status?: PaymentStatus }) {
    return this.svc.listPayments(q as any);
  }

  @Post('users/:id/unban')
  unbanUser(@Param('id') id: string, @Req() req: any) {
    return this.svc.unbanUser(id, req.user!.id, req);
  }

  @Post('students/tokens/adjust')
  adjustTokens(@Body() dto: AdjustTokensDto, @Req() req: any) {
    return this.svc.adjustTokens(dto, req.user!.id, req);
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

  @Get('policy-config')
  getPolicyConfig() {
    return this.svc.getPolicyConfig();
  }

  @Patch('policy-config')
  updatePolicyConfig(@Body() dto: Partial<PolicyConfig>, @Req() req: any) {
    return this.svc.updatePolicyConfig(dto, req.user!.id, req);
  }

  // ─── Admin User Management ───

  @Get('admin-users')
  listAdminUsers(@Query() q: PaginationDto) {
    return this.svc.listAdminUsers(q);
  }

  @Get('admin-users/:id')
  getAdminUser(@Param('id') id: string) {
    return this.svc.getAdminUser(id);
  }

  @UseGuards(DirectorGuard)
  @Patch('admin-users/:id/director')
  toggleDirectorAccess(
    @Param('id') id: string,
    @Body() dto: { isDirector: boolean },
    @Req() req: any,
  ) {
    return this.svc.toggleDirectorAccess(id, dto.isDirector, req.user!.id, req);
  }

  @Delete('admin-users/:id')
  removeAdminUser(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.svc.removeAdminUser(id, req.user!.id, req);
  }
}
