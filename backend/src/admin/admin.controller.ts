import { Controller, Get, Query, UseGuards, Param, Patch, Body, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PaginationDto } from './dto/pagination.dto';
import { TutorStatus, BookingStatus, PaymentStatus } from '@prisma/client';
import { SetTutorStatusDto } from './dto/set-tutor-status.dto';
import { AdjustTokensDto } from './dto/adjust-tokens.dto';
import { ParseUUIDPipe } from '@nestjs/common';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private readonly svc: AdminService) {}

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
  setTutorStatus(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: SetTutorStatusDto) {
    return this.svc.setTutorStatus(id, dto);
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

}
