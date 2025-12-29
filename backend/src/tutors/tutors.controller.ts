import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { TutorsService } from './tutors.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('tutors')
@ApiBearerAuth()
@Controller('tutors')
export class TutorsController {
  constructor(private readonly svc: TutorsService) {}

  @ApiOperation({ summary: 'List tutors' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, example: 8 })
  @ApiQuery({ name: 'subject', required: false, example: 'Math' })
  @ApiQuery({ name: 'language', required: false, example: 'English' })
  @ApiQuery({ name: 'sortBy', required: false, example: 'hourlyRate' })
  @ApiQuery({ name: 'sortOrder', required: false, example: 'desc' })
  @Get()
  list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('subject') subject?: string,
    @Query('language') language?: string,
    @Query('sortBy') sortBy?: 'updatedAt' | 'rating' | 'hourlyRate',
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    return this.svc.list({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      subject: subject || undefined,
      language: language || undefined,
      sortBy,
      sortOrder,
    });
  }

  @ApiOperation({ summary: 'Search tutors' })
  @Get('search')
  search(
    @Query('q') q?: string,
    @Query('subject') subject?: string,
    @Query('language') language?: string,
    @Query('minRating') minRating?: string,
    @Query('priceMin') priceMin?: string,
    @Query('priceMax') priceMax?: string,
    @Query('sort') sort?: 'rating_desc' | 'price_asc' | 'price_desc',
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.svc.search({
      q: q || undefined,
      subject: subject || undefined,
      language: language || undefined,
      minRating: minRating ? Number(minRating) : undefined,
      priceMin: priceMin ? Number(priceMin) : undefined,
      priceMax: priceMax ? Number(priceMax) : undefined,
      sort,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @ApiOperation({ summary: 'Trending tutors (homepage carousel)' })
  @ApiQuery({ name: 'limit', required: false, example: 8 })
  @Get('trending')
  trending(@Query('limit') limit?: string) {
    const n = Number(limit);
    return this.svc.getTrending(Number.isFinite(n) ? n : 8);
  }

  @ApiOperation({ summary: 'Get available filter options (subjects and ratings)' })
  @Get('filters/options')
  getFilterOptions() {
    return this.svc.getFilterOptions();
  }

  @ApiOperation({ summary: 'Get logged-in tutor sessions' })
  @UseGuards(JwtAuthGuard)
  @Get('me/sessions')
  getMySessions(@Req() req: any) {
    const tutorId = req.user?.tutorId;
    if (!tutorId) {
      return {
        items: [],
        error: 'Tutor account not found for logged-in user',
      };
    }
    return this.svc.getSessionsForTutor(tutorId);
  }

  @ApiOperation({ summary: 'Get logged-in tutor profile' })
  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@Req() req: any) {
    const tutorId = req.user?.tutorId || null;
    const userId = req.user?.userId || req.user?.id;
    if (tutorId) return this.svc.getMe(tutorId);
    return this.svc.getMeByUserId(userId);
  }

  @ApiOperation({ summary: 'Update logged-in tutor profile' })
  @UseGuards(JwtAuthGuard)
  @Put('me')
  updateMe(@Req() req: any, @Body() body: any) {
    const tutorId = req.user?.tutorId || null;
    const userId = req.user?.userId || req.user?.id;
    return this.svc.updateMe(userId, tutorId, body);
  }

  @ApiOperation({ summary: 'Get tutor by id or human TID' })
  @Get(':idOrTid')
  get(@Param('idOrTid') idOrTid: string) {
    return this.svc.getByIdOrTid(idOrTid);
  }

  /* === Availability for a tutor === */
  @ApiOperation({ summary: 'List availability slots for a tutor' })
  @ApiParam({ name: 'id', required: true, description: 'Tutor ID' })
  @ApiQuery({ name: 'from', required: false, description: 'ISO start (inclusive)' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO end (exclusive)' })
  @UseGuards(JwtAuthGuard)
  @Get(':id/availability')
  listAvailability(
    @Param('id') tutorId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.listAvailability(tutorId, from, to);
  }
}
