import { Controller, Get, Post, Body, Param, UseGuards, Patch, Delete } from '@nestjs/common';
import { PerformanceReportsService } from './performance-reports.service';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportDto } from './dto/update-report.dto';
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

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.TUTOR)
  update(
    @CurrentUser('sub') userId: string,
    @Param('id') reportId: string,
    @Body() dto: UpdateReportDto,
  ) {
    return this.service.update(userId, reportId, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.TUTOR)
  remove(@CurrentUser('sub') userId: string, @Param('id') reportId: string) {
    return this.service.remove(userId, reportId);
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
