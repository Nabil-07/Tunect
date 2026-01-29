import {
  Body,
  Controller,
  Get,
  Patch,
  Query,
  UseGuards,
  Param,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiParam,
} from '@nestjs/swagger';

import { StudentsService } from './students.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { checkStudentProfileCompletion } from '../users/profile-completion';

class UpdateMeDto {
  grade?: string;
  name?: string;
  phone?: string;
  bio?: string;
  timezone?: string;
  preferredLanguage?: string;
}

function toPage(v?: string, def = 1) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : def;
}
function toPageSize(v?: string, def = 20) {
  const n = Number(v);
  const size = Number.isFinite(n) && n > 0 ? Math.floor(n) : def;
  return Math.min(size, 100);
}

@ApiTags('students')
@ApiBearerAuth()
@Controller('students')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @ApiOperation({ summary: 'Get my student profile' })
  @Get('me')
  @Roles(Role.STUDENT, Role.ADMIN)
  getMe(@CurrentUser('id') userId: string) {
    return this.students.getMe(userId);
  }

  @ApiOperation({ summary: 'Check my profile completion status' })
  @Get('me/profile-status')
  @Roles(Role.STUDENT, Role.ADMIN)
  async getProfileStatus(@CurrentUser('id') userId: string) {
    const student = await this.students.getMe(userId);
    return checkStudentProfileCompletion(student);
  }

  @ApiOperation({ summary: 'Update my student profile (grade)' })
  @Patch('me')
  @Roles(Role.STUDENT)
  patchMe(@CurrentUser('id') userId: string, @Body() dto: UpdateMeDto) {
    return this.students.patchMe(userId, dto);
  }

  @ApiOperation({ summary: 'Get my token balance' })
  @Get('me/tokens')
  @Roles(Role.STUDENT)
  getTokens(@CurrentUser('id') userId: string) {
    return this.students.getTokenBalance(userId);
  }

  @ApiOperation({ summary: 'Get my token ledger (paginated)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @Get('me/tokens/ledger')
  @Roles(Role.STUDENT)
  getLedger(
    @CurrentUser('id') userId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.students.getTokenLedger(userId, toPage(page), toPageSize(pageSize));
  }

  @ApiOperation({ summary: 'Get my payment history (paginated)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @Get('me/payments')
  @Roles(Role.STUDENT)
  getPayments(
    @CurrentUser('id') userId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.students.getPayments(userId, toPage(page), toPageSize(pageSize));
  }

  @ApiOperation({ summary: 'Verify token invariant (optional)' })
  @Get('me/tokens/verify')
  @Roles(Role.STUDENT, Role.ADMIN)
  verify(@CurrentUser('id') userId: string) {
    return this.students.verifyTokenInvariant(userId);
  }

  @ApiOperation({ summary: 'Get my bookings (with payments and unscheduled group)' })
  @Get('my-bookings')
  @Roles(Role.STUDENT)
  getMyBookings(@CurrentUser('id') userId: string) {
    return this.students.getMyBookings(userId);
  }

  @ApiOperation({ summary: 'Get my token balances per tutor' })
  @Get('me/token-balances')
  @Roles(Role.STUDENT)
  getTokenBalances(
    @CurrentUser('id') userId: string,
    @CurrentUser('studentId') studentId?: string,
  ) {
    return this.students.getTutorTokenBalances(userId, studentId);
  }

  @ApiOperation({ summary: 'Get my token ledger' })
  @Get('me/token-ledger')
  @Roles(Role.STUDENT)
  getTokenLedgerAll(
    @CurrentUser('id') userId: string,
    @CurrentUser('studentId') studentId?: string,
  ) {
    return this.students.getTokenLedgerAll(userId, studentId);
  }

  // ----- Tutor -----

  @ApiOperation({ summary: 'Get my students (tutor)' })
  @Get('tutor/my-students')
  @Roles(Role.TUTOR)
  getMyStudents(@CurrentUser('id') userId: string) {
    return this.students.getTutorStudents(userId);
  }

  // ----- Admin -----

  @ApiOperation({ summary: 'List students (admin)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiQuery({ name: 'q', required: false, description: 'Search by email/grade' })
  @Get()
  @Roles(Role.ADMIN)
  listAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('q') q?: string,
  ) {
    return this.students.listAll({
      page: toPage(page),
      pageSize: toPageSize(pageSize),
      q,
    });
  }

  @ApiOperation({ summary: 'Get student by ID (admin)' })
  @ApiParam({ name: 'id', required: true })
  @Get(':id')
  @Roles(Role.ADMIN)
  getById(@Param('id') id: string) {
    return this.students.getByIdAdmin(id);
  }
}
