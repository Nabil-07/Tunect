import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Put,
  Post,
  UseGuards,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AvailabilityService } from './availability.service';
import { CreateSlotDto } from './dto/create-slot.dto';
import { UpdateSlotDto } from './dto/update-slot.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { BookableQueryDto } from './dto/bookable-query.dto';

@ApiTags('availability')
@Controller('availability')
export class AvailabilityController {
  constructor(private readonly service: AvailabilityService) {}

  // ---------------- Tutor: manage own slots ----------------

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TUTOR')
  @Post('me')
  createMine(@CurrentUser('id') userId: string, @Body() dto: CreateSlotDto) {
    return this.service.createMine(userId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TUTOR')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  @Header('Pragma', 'no-cache')
  @Get('me')
  listMine(@CurrentUser('id') userId: string) {
    return this.service.listMine(userId);
  }

  // optional window filter
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TUTOR')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  @Header('Pragma', 'no-cache')
  @Get('me/slots')
  listMineWindow(
    @CurrentUser('id') userId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.listMineWindow(userId, from, to);
  }

  // bulk upsert
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TUTOR')
  @Patch('me')
  upsertMine(@CurrentUser('id') userId: string, @Body() body: any) {
    return this.service.updateMineBulk(userId, body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TUTOR')
  @Put('me')
  upsertMinePut(@CurrentUser('id') userId: string, @Body() body: any) {
    return this.service.updateMineBulk(userId, body);
  }

  // aliases for FE compatibility
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TUTOR')
  @Patch('me/slots')
  upsertMineSlots(@CurrentUser('id') userId: string, @Body() body: any) {
    return this.service.updateMineBulk(userId, body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TUTOR')
  @Put('me/slots')
  upsertMineSlotsPut(@CurrentUser('id') userId: string, @Body() body: any) {
    return this.service.updateMineBulk(userId, body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TUTOR')
  @Post('slots')
  upsertMineSlotsPost(@CurrentUser('id') userId: string, @Body() body: any) {
    return this.service.updateMineBulk(userId, body);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TUTOR')
  @Patch('me/:id')
  updateMine(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateSlotDto,
  ) {
    return this.service.updateMine(userId, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('TUTOR')
  @Delete('me/:id')
  deleteMine(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.deleteMine(userId, id);
  }

  // ---------------- Public: read-only endpoints ----------------
  // Keep both singular and plural paths for compatibility

  // singular
  @Get('tutor/:tutorId')
  listByTutorSingular(@Param('tutorId') tutorId: string) {
    return this.service.listByTutor(tutorId);
  }

  // plural (canonical for FE)
  @Get('tutors/:tutorId')
  listByTutorPlural(@Param('tutorId') tutorId: string) {
    return this.service.listByTutor(tutorId);
  }

  // singular bookable
  @Get('tutor/:tutorId/bookable')
  listBookableSingular(
    @Param('tutorId') tutorId: string,
    @Query() q: BookableQueryDto,
  ) {
    return this.service.listBookable(tutorId, q);
  }

  // plural bookable (canonical for FE)
  @Get('tutors/:tutorId/bookable')
  listBookablePlural(
    @Param('tutorId') tutorId: string,
    @Query() q: BookableQueryDto,
  ) {
    return this.service.listBookable(tutorId, q);
  }

  // extra legacy alias used by some older UI code: /availability/bookable/:id
  @Get('bookable/:tutorId')
  listBookableLegacy(
    @Param('tutorId') tutorId: string,
    @Query() q: BookableQueryDto,
  ) {
    return this.service.listBookable(tutorId, q);
  }
}
