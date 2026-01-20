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
import { CreateGroupBookingDto, JoinGroupBookingDto } from './dto/group-booking.dto';
import { ConvertToGroupSessionDto } from './dto/convert-to-group.dto';

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
  async demoStatus(
    @CurrentUser('sub') userId: string,
    @Param('tutorId') tutorId: string,
  ) {
    const used = await this.service.hasUsedDemo(userId, tutorId);
    return { used };
  }

  @ApiOperation({
    summary: 'Check demo status for multiple tutors',
    description: 'Returns an object mapping tutorId to boolean (true if used).',
  })
  @Post('demo-status/bulk')
  async bulkDemoStatus(
    @CurrentUser('sub') userId: string,
    @Body() body: { tutorIds: string[] },
  ) {
    const results: Record<string, boolean> = {};
    for (const tutorId of body.tutorIds) {
      const used = await this.service.hasUsedDemo(userId, tutorId);
      results[tutorId] = used;
    }
    return results;
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

  @ApiOperation({ summary: 'Get booking details with meeting link (participant only)' })
  @Get(':id/details')
  @Roles(Role.STUDENT, Role.TUTOR, Role.ADMIN)
  @UseGuards(RolesGuard)
  getDetails(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: Role,
  ) {
    return this.service.getBookingForUser(id, userId, role);
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
  @Roles(Role.STUDENT, Role.TUTOR, Role.ADMIN)
  @UseGuards(RolesGuard)
  cancel(@Param('id') id: string, @CurrentUser('sub') actorUserId: string) {
    return this.service.cancel(id, actorUserId);
  }

  // ==================== GROUP SESSIONS ====================

  @ApiOperation({ summary: 'Create a group session (tutor only)' })
  @Post('group')
  @Roles(Role.TUTOR, Role.ADMIN)
  @UseGuards(RolesGuard)
  createGroupSession(
    @Body() dto: CreateGroupBookingDto,
    @CurrentUser('tutorId') tutorId: string,
    @Headers('x-timezone') tzHeader?: string,
    @Query('tz') tzQuery?: string,
  ) {
    if (!tutorId) {
      throw new NotFoundException('Tutor account not found for logged-in user');
    }
    const tz = tzQuery || tzHeader || 'UTC';
    return this.service.createGroupSession(dto, tutorId, tz);
  }

  @ApiOperation({ summary: 'Get available group sessions to join' })
  @Get('group/available')
  @Roles(Role.STUDENT, Role.TUTOR, Role.ADMIN)
  @UseGuards(RolesGuard)
  getAvailableGroupSessions(
    @Query('subject') subject?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const filters = {
      subject,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    };
    return this.service.getAvailableGroupSessions(filters);
  }

  @ApiOperation({ summary: 'Join a group session (student only)' })
  @ApiParam({ name: 'id', required: true, description: 'Booking ID of group session' })
  @Post(':id/join')
  @Roles(Role.STUDENT, Role.ADMIN)
  @UseGuards(RolesGuard)
  async joinGroupSession(
    @Param('id') bookingId: string,
    @CurrentUser('studentId') studentId: string,
  ) {
    if (!studentId) {
      throw new NotFoundException('Student account not found for logged-in user');
    }
    return this.service.joinGroupSession(bookingId, studentId);
  }

  @ApiOperation({ summary: 'Leave a group session (student only)' })
  @ApiParam({ name: 'id', required: true, description: 'Booking ID of group session' })
  @Delete(':id/leave')
  @Roles(Role.STUDENT, Role.ADMIN)
  @UseGuards(RolesGuard)
  async leaveGroupSession(
    @Param('id') bookingId: string,
    @CurrentUser('studentId') studentId: string,
  ) {
    if (!studentId) {
      throw new NotFoundException('Student account not found for logged-in user');
    }
    return this.service.leaveGroupSession(bookingId, studentId);
  }

  @ApiOperation({ summary: 'Get participants of a group session' })
  @ApiParam({ name: 'id', required: true, description: 'Booking ID of group session' })
  @Get(':id/participants')
  @Roles(Role.TUTOR, Role.STUDENT, Role.ADMIN)
  @UseGuards(RolesGuard)
  getGroupSessionParticipants(@Param('id') bookingId: string) {
    return this.service.getGroupSessionParticipants(bookingId);
  }

  @ApiOperation({ summary: 'Convert 1:1 slot to group session (tutor only, >24hrs before session)' })
  @ApiParam({ name: 'id', required: true, description: 'Booking ID to convert' })
  @Patch(':id/convert-to-group')
  @Roles(Role.TUTOR, Role.ADMIN)
  @UseGuards(RolesGuard)
  async convertToGroupSession(
    @Param('id') bookingId: string,
    @CurrentUser('tutorId') tutorId: string,
    @Body() dto: ConvertToGroupSessionDto,
  ) {
    if (!tutorId) {
      throw new NotFoundException('Tutor account not found for logged-in user');
    }
    return this.service.convertToGroupSession(
      bookingId,
      tutorId,
      dto.maxStudents,
      dto.pricePerStudent,
    );
  }

  @ApiOperation({ 
    summary: 'Create a pending slot booking with tokens (student reserves tokens for future scheduling)',
    description: 'Creates a PENDING_SLOT booking by deducting tokens. Student can schedule later when tutor has availability.'
  })
  @Post('reserve-with-tokens/:tutorId')
  @Roles(Role.STUDENT)
  @UseGuards(RolesGuard)
  async reserveWithTokens(
    @Param('tutorId') tutorId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.service.createPendingSlotWithTokens(tutorId, userId);
  }

  @ApiOperation({
    summary: 'Bulk reserve tokens for multiple future sessions',
    description: 'Creates multiple PENDING_SLOT bookings by deducting tokens upfront. Student can schedule each one later.'
  })
  @Post('bulk-reserve-tokens/:tutorId')
  @Roles(Role.STUDENT)
  @UseGuards(RolesGuard)
  async bulkReserveTokens(
    @Param('tutorId') tutorId: string,
    @CurrentUser('sub') userId: string,
    @Body('count') count: number,
  ) {
    return this.service.bulkReserveTokens(tutorId, userId, count);
  }
}
