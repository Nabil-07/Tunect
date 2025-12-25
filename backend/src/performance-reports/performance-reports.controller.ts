import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { PerformanceReportsService } from './performance-reports.service';
import { CreateReportDto } from './dto/create-report.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('performance-reports')
@UseGuards(JwtAuthGuard)
export class PerformanceReportsController {
  constructor(private readonly service: PerformanceReportsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.TUTOR)
  create(@CurrentUser('sub') userId: string, @Body() dto: CreateReportDto) {
    return this.service.create(userId, dto);
  }

  @Get('my-reports')
  @UseGuards(RolesGuard)
  @Roles(Role.TUTOR)
  findMyReports(@CurrentUser('sub') userId: string) {
    return this.service.findTutorReports(userId);
  }

  @Get('my-performance')
  @UseGuards(RolesGuard)
  @Roles(Role.STUDENT)
  findMyPerformance(@CurrentUser('sub') userId: string) {
    return this.service.findStudentReports(userId);
  }

  @Get('student/:studentId')
  @UseGuards(RolesGuard)
  @Roles(Role.TUTOR)
  getStudentPerformance(
    @CurrentUser('sub') userId: string,
    @Param('studentId') studentId: string,
  ) {
    return this.service.getStudentPerformanceByTutor(userId, studentId);
  }
}
