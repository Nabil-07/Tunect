import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { QueryBookingDto } from './dto/query-booking.dto';
import { AssignDemoSlotDto } from './dto/assign-demo-slot.dto';
import { RescheduleBookingDto } from './dto/reschedule-booking.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('bookings')
@ApiBearerAuth()
@Controller('bookings')
@UseGuards(JwtAuthGuard)
export class BookingsController {
  constructor(
    private readonly service: BookingsService,
    private readonly prisma: PrismaService,
  ) {}

  // ---------- Create PAID ----------
  @ApiOperation({
    summary: 'Create a paid booking',
    description:
      'Paid bookings require start/end times and deduct tokens immediately. If start/end are omitted, a PENDING_SLOT booking is created.',
  })
  @ApiHeader({
    name: 'x-timezone',
    required: false,
    description: 'IANA timezone of the caller (e.g., Asia/Kolkata).',
    example: 'Asia/Kolkata',
  })
  @ApiQuery({
    name: 'tz',
    required: false,
    description: 'IANA timezone (query alternative to header).',
    example: 'Asia/Kolkata',
  })
  @Post()
  @Roles(Role.STUDENT, Role.ADMIN)
  @UseGuards(RolesGuard)
  createPaid(
    @Body() dto: CreateBookingDto,
    @CurrentUser('sub') actorUserId: string,
    @Headers('x-timezone') tzHeader?: string,
    @Query('tz') tzQuery?: string,
  ) {
    const tz = tzQuery || tzHeader;
    dto.isDemo = false;
    return this.service.create(dto, tz, actorUserId);
  }

  // ---------- Create DEMO ----------
  @ApiOperation({
    summary: 'Create a demo booking',
    description:
      'If start/end are provided, the demo is scheduled immediately (CONFIRMED). If not, a PENDING demo is created without times.',
  })
  @ApiHeader({
    name: 'x-timezone',
    required: false,
    description: 'IANA timezone used to interpret provided start/end.',
    example: 'Asia/Kolkata',
  })
  @ApiQuery({
    name: 'tz',
    required: false,
    description: 'IANA timezone (query alternative to header).',
    example: 'Asia/Kolkata',
  })
  @Post('demo')
  @Roles(Role.STUDENT, Role.ADMIN)
  @UseGuards(RolesGuard)
  createDemo(
    @Body() dto: CreateBookingDto,
    @CurrentUser('sub') actorUserId: string,
    @Headers('x-timezone') tzHeader?: string,
    @Query('tz') tzQuery?: string,
  ) {
    dto.isDemo = true;
    const tz = tzQuery || tzHeader || 'UTC';
    return this.service.create(dto, tz, actorUserId);
  }

  // ---------- List ----------
  @ApiOperation({ summary: 'List bookings (optionally return local times)' })
  @ApiHeader({
    name: 'x-timezone',
    required: false,
    description: 'IANA timezone of the viewer (adds startLocal/endLocal).',
    example: 'Asia/Kolkata',
  })
  @ApiQuery({
    name: 'tz',
    required: false,
    description: 'IANA timezone (query alternative to header).',
    example: 'Asia/Kolkata',
  })
  @Get()
  @Roles(Role.STUDENT, Role.TUTOR, Role.ADMIN)
  @UseGuards(RolesGuard)
  list(
    @Query() q: QueryBookingDto,
    @Headers('x-timezone') tzHeader?: string,
    @Query('tz') tzQuery?: string,
  ) {
    const tz = tzQuery || tzHeader || 'UTC';
    return this.service.list(q, tz);
  }

  // ---------- Next ----------
  @ApiOperation({ summary: 'Get next upcoming session for the current student' })
  @Get('next')
  @Roles(Role.STUDENT, Role.ADMIN)
  @UseGuards(RolesGuard)
  async next(@CurrentUser('sub') userId: string) {
    const student = await this.prisma.student.findFirst({ where: { userId } });
    if (!student) throw new NotFoundException('Student profile not found');
    return this.service.nextForStudent(student.id);
  }

  // ---------- Demo usage status ----------
  @ApiOperation({
    summary: 'Check if student already used demo with a tutor',
    description: 'Returns { used: boolean }.',
  })
  @ApiParam({ name: 'tutorId', required: true, description: 'Tutor ID' })
  @Get('demo-status/:tutorId')
  @Roles(Role.STUDENT, Role.ADMIN)
  @UseGuards(RolesGuard)
  async demoStatus(
    @CurrentUser('sub') userId: string,
    @Param('tutorId') tutorId: string,
  ) {
    const used = await this.service.hasUsedDemo(userId, tutorId);
    return { used };
  }

  // ---------- Assign slot ----------
  @ApiOperation({
    summary: 'Assign slot to a PENDING booking (demo or paid)',
    description:
      'Assign start/end time to a booking and mark it CONFIRMED. Students can self-assign on their own bookings.',
  })
  @ApiParam({ name: 'id', required: true, description: 'Booking ID' })
  @Patch(':id/assign-slot')
  @Roles(Role.STUDENT, Role.TUTOR, Role.ADMIN)
  @UseGuards(RolesGuard)
  assignSlot(
    @Param('id') id: string,
    @Body() dto: AssignDemoSlotDto,
    @Headers('x-timezone') tzHeader?: string,
    @Query('tz') tzQuery?: string,
  ) {
    const tz = tzQuery || tzHeader;
    return this.service.assignSlot(id, dto, tz);
  }

  // ---------- One-time reschedule (student) ----------
  @ApiOperation({
    summary: 'Reschedule a booking (one-time for the student)',
    description:
      'Updates the slot if it’s inside availability and not overlapping; allowed once.',
  })
  @ApiParam({ name: 'id', required: true, description: 'Booking ID' })
  @Patch(':id/reschedule')
  @Roles(Role.STUDENT)
  @UseGuards(RolesGuard)
  reschedule(
    @Param('id') id: string,
    @Body() dto: RescheduleBookingDto,
    @Headers('x-timezone') tzHeader?: string,
    @Query('tz') tzQuery?: string,
    @CurrentUser('sub') actorUserId?: string,
  ) {
    const tz = tzQuery || tzHeader;
    return this.service.reschedule(id, dto, tz, actorUserId!);
  }

  // ---------- Update ----------
  @ApiOperation({ summary: 'Update booking (status/notes)' })
  @Patch(':id')
  @Roles(Role.ADMIN)
  @UseGuards(RolesGuard)
  update(@Param('id') id: string, @Body() dto: UpdateBookingDto) {
    return this.service.update(id, dto);
  }

  // ---------- Complete ----------
  @ApiOperation({
    summary: 'Mark booking as COMPLETED (credits tutor wallet)',
  })
  @ApiParam({ name: 'id', required: true, description: 'Booking ID' })
  @Post(':id/complete')
  @Roles(Role.TUTOR, Role.ADMIN)
  @UseGuards(RolesGuard)
  complete(@Param('id') id: string, @CurrentUser('sub') actorUserId: string) {
    return this.service.complete(id, actorUserId);
  }

  // ---------- Cancel ----------
  @ApiOperation({ summary: 'Cancel booking (refund tokens if paid)' })
  @ApiParam({ name: 'id', required: true, description: 'Booking ID' })
  @Delete(':id')
  @Roles(Role.STUDENT, Role.ADMIN)
  @UseGuards(RolesGuard)
  cancel(@Param('id') id: string, @CurrentUser('sub') actorUserId: string) {
    return this.service.cancel(id, actorUserId);
  }
}
