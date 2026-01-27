import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  NotFoundException,
  Param,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { WaitlistService } from './waitlist.service';
import { AddToWaitlistDto } from './dto/add-to-waitlist.dto';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/role.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('waitlist')
@ApiBearerAuth()
@Controller('waitlist')
@UseGuards(JwtAuthGuard)
export class WaitlistController {
  private readonly logger = new Logger(WaitlistController.name);

  constructor(private readonly service: WaitlistService) {}

  private ensureWaitlistEnabled() {
    // Default to ENABLED unless explicitly disabled with 'false'
    const enableWaitlist = process.env.ENABLE_WAITLIST;
    
    // Log the environment variable value for debugging
    this.logger.debug(
      `[ensureWaitlistEnabled] ENABLE_WAITLIST="${enableWaitlist}" (type: ${typeof enableWaitlist})`,
    );
    
    // Only disable if explicitly set to 'false' (case-insensitive, trimmed)
    // Handles: "false", "FALSE", "False", " false ", etc.
    const normalizedValue = enableWaitlist?.trim().toLowerCase();
    const isExplicitlyDisabled = normalizedValue === 'false';
    
    if (isExplicitlyDisabled) {
      this.logger.warn('[ensureWaitlistEnabled] Waitlist is disabled via ENABLE_WAITLIST=false');
      throw new ServiceUnavailableException('Waitlist is temporarily disabled');
    }
    // Otherwise, waitlist is enabled (default behavior)
  }

  @ApiOperation({ summary: 'Add student to waitlist' })
  @Post()
  @Roles(Role.STUDENT, Role.ADMIN)
  @UseGuards(RolesGuard)
  addToWaitlist(@Body() dto: AddToWaitlistDto, @CurrentUser('studentId') studentId: string) {
    this.ensureWaitlistEnabled();
    if (!studentId) {
      throw new NotFoundException('Student account not found for logged-in user');
    }
    return this.service.addToWaitlist(dto, studentId);
  }

  @ApiOperation({ summary: 'Get my waitlist entries (student)' })
  @Get('my')
  @Roles(Role.STUDENT, Role.ADMIN)
  @UseGuards(RolesGuard)
  getMyWaitlist(@CurrentUser('studentId') studentId: string) {
    this.ensureWaitlistEnabled();
    if (!studentId) {
      throw new NotFoundException('Student account not found for logged-in user');
    }
    return this.service.getMyWaitlist(studentId);
  }

  @ApiOperation({ summary: 'Get waitlist for tutor' })
  @Get('tutor')
  @Roles(Role.TUTOR, Role.ADMIN)
  @UseGuards(RolesGuard)
  getTutorWaitlist(@CurrentUser('tutorId') tutorId: string) {
    this.ensureWaitlistEnabled();
    if (!tutorId) {
      throw new NotFoundException('Tutor account not found for logged-in user');
    }
    return this.service.getTutorWaitlist(tutorId);
  }

  @ApiOperation({ summary: 'Notify student about available slot (tutor only)' })
  @ApiParam({ name: 'id', required: true, description: 'Waitlist entry ID' })
  @Post(':id/notify')
  @Roles(Role.TUTOR, Role.ADMIN)
  @UseGuards(RolesGuard)
  notifyWhenAvailable(
    @Param('id') waitlistId: string,
    @CurrentUser('tutorId') tutorId: string,
    @Body('bookingId') bookingId: string,
  ) {
    this.ensureWaitlistEnabled();
    if (!tutorId) {
      throw new NotFoundException('Tutor account not found for logged-in user');
    }
    return this.service.notifyWhenAvailable(waitlistId, tutorId, bookingId);
  }

  @ApiOperation({ summary: 'Book from waitlist notification (student only)' })
  @ApiParam({ name: 'id', required: true, description: 'Waitlist entry ID' })
  @Post(':id/book')
  @Roles(Role.STUDENT, Role.ADMIN)
  @UseGuards(RolesGuard)
  bookFromWaitlist(@Param('id') waitlistId: string, @CurrentUser('studentId') studentId: string) {
    this.ensureWaitlistEnabled();
    if (!studentId) {
      throw new NotFoundException('Student account not found for logged-in user');
    }
    return this.service.bookFromWaitlist(waitlistId, studentId);
  }

  @ApiOperation({ summary: 'Remove from waitlist' })
  @ApiParam({ name: 'id', required: true, description: 'Waitlist entry ID' })
  @Delete(':id')
  @Roles(Role.STUDENT, Role.ADMIN)
  @UseGuards(RolesGuard)
  removeFromWaitlist(@Param('id') waitlistId: string, @CurrentUser('studentId') studentId: string) {
    this.ensureWaitlistEnabled();
    if (!studentId) {
      throw new NotFoundException('Student account not found for logged-in user');
    }
    return this.service.removeFromWaitlist(waitlistId, studentId);
  }
}
