import {
  Body,
  Controller,
  Get,
  Header,
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
import { AvailabilityTrackingService } from '../availability/availability-tracking.service';
import { checkTutorProfileCompletion } from '../users/profile-completion';

@ApiTags('tutors')
@ApiBearerAuth()
@Controller('tutors')
export class TutorsController {
  constructor(
    private readonly svc: TutorsService,
    private readonly availabilityTracking: AvailabilityTrackingService,
  ) {}

  @ApiOperation({ summary: 'List tutors' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, example: 8 })
  @ApiQuery({ name: 'subject', required: false, example: 'Math' })
  @ApiQuery({ name: 'class', required: false, example: 'Grade 10' })
  @ApiQuery({ name: 'board', required: false, example: 'CBSE' })
  @ApiQuery({ name: 'language', required: false, example: 'English' })
  @ApiQuery({ name: 'sortBy', required: false, example: 'hourlyRate' })
  @ApiQuery({ name: 'sortOrder', required: false, example: 'desc' })
  @Get()
  list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('subject') subject?: string,
    @Query('class') classTeach?: string,
    @Query('board') board?: string,
    @Query('language') language?: string,
    @Query('sortBy') sortBy?: 'updatedAt' | 'rating' | 'hourlyRate',
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    return this.svc.list({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      subject: subject || undefined,
      classTeach: classTeach || undefined,
      board: board || undefined,
      language: language || undefined,
      sortBy,
      sortOrder,
    });
  }

  @ApiOperation({ summary: 'Recommended tutors for student dashboard' })
  @ApiQuery({ name: 'pageSize', required: false, example: 6 })
  @ApiQuery({ name: 'searches', required: false, description: 'JSON string of recent searches' })
  @Get('recommended')
  @UseGuards(JwtAuthGuard)
  async recommended(
    @Req() req: any,
    @Query('pageSize') pageSize?: string,
    @Query('searches') searches?: string,
  ) {
    try {
      const userId = req.user?.userId || req.user?.sub || req.user?.id;
      if (!userId) {
        console.error('[TutorsController.recommended] No userId found in request:', {
          user: req.user,
          userKeys: req.user ? Object.keys(req.user) : 'no user object',
          headers: Object.keys(req.headers || {}),
        });
        // Return empty list instead of throwing to prevent 500/404
        return { items: [], total: 0, page: 1, pageSize: pageSize ? Number(pageSize) : 6 };
      }
      
      console.log('[TutorsController.recommended] Processing request:', {
        userId,
        pageSize,
        searchesLength: searches?.length,
      });
      
      const result = await this.svc.getRecommendedForStudent(userId, {
        pageSize: pageSize ? Number(pageSize) : undefined,
        searches,
      });
      
      console.log('[TutorsController.recommended] Success:', {
        itemsCount: result?.items?.length || 0,
        total: result?.total || 0,
      });
      
      return result;
    } catch (error: any) {
      console.error('[TutorsController.recommended] Error:', {
        message: error?.message,
        stack: error?.stack,
        name: error?.name,
        code: error?.code,
        user: req.user ? { id: req.user.id, email: req.user.email, role: req.user.role } : 'no user',
        params: { pageSize, searches },
      });
      // Return empty list instead of throwing to prevent 500/404
      // This ensures the endpoint always returns a valid response
      return { items: [], total: 0, page: 1, pageSize: pageSize ? Number(pageSize) : 6 };
    }
  }

  @ApiOperation({ summary: 'Search tutors' })
  @Get('search')
  async search(
    @Query('q') q?: string,
    @Query('subject') subject?: string,
    @Query('class') classTeach?: string,
    @Query('board') board?: string,
    @Query('language') language?: string,
    @Query('minRating') minRating?: string,
    @Query('priceMin') priceMin?: string,
    @Query('priceMax') priceMax?: string,
    @Query('sort') sort?: 'rating_desc' | 'price_asc' | 'price_desc',
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    try {
      return await this.svc.search({
        q: q || undefined,
        subject: subject || undefined,
        classTeach: classTeach || undefined,
        board: board || undefined,
        language: language || undefined,
        minRating: minRating ? Number(minRating) : undefined,
        priceMin: priceMin ? Number(priceMin) : undefined,
        priceMax: priceMax ? Number(priceMax) : undefined,
        sort,
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
      });
    } catch (error: any) {
      // Log the error with full details for debugging
      console.error('[TutorsController.search] Error:', {
        message: error?.message,
        stack: error?.stack,
        params: { q, subject, classTeach, language, minRating, priceMin, priceMax, sort, page, pageSize },
      });
      // Re-throw to let NestJS handle it (will return 500 with error details)
      throw error;
    }
  }

  @ApiOperation({ summary: 'Trending tutors (homepage carousel)' })
  @ApiQuery({ name: 'limit', required: false, example: 8 })
  @Get('trending')
  async trending(@Query('limit') limit?: string) {
    try {
      const n = Number(limit);
      return await this.svc.getTrending(Number.isFinite(n) ? n : 8);
    } catch (error: any) {
      console.error('[TutorsController.trending] Error:', {
        message: error?.message,
        stack: error?.stack,
        limit,
      });
      // Return empty array instead of throwing to prevent 500 errors
      return [];
    }
  }

  @ApiOperation({ summary: 'Get available filter options (subjects and ratings)' })
  @Get('filters/options')
  getFilterOptions() {
    return this.svc.getFilterOptions();
  }

  // Diagnostic endpoint to verify route registration
  @ApiOperation({ summary: 'Health check for recommended endpoint' })
  @Get('recommended/health')
  recommendedHealth() {
    return { 
      status: 'ok', 
      message: 'Recommended endpoint is registered',
      timestamp: new Date().toISOString(),
    };
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

  @ApiOperation({ summary: 'Check my profile completion status' })
  @UseGuards(JwtAuthGuard)
  @Get('me/profile-status')
  async getProfileStatus(@Req() req: any) {
    const tutorId = req.user?.tutorId || null;
    const userId = req.user?.userId || req.user?.id;
    let tutor;
    if (tutorId) {
      tutor = await this.svc.getMe(tutorId);
    } else {
      tutor = await this.svc.getMeByUserId(userId);
    }
    return checkTutorProfileCompletion(tutor);
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

  @ApiOperation({ summary: 'Get tutor activity info (last active, frequency)' })
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  @Header('Pragma', 'no-cache')
  @Get(':id/activity')
  getActivity(@Param('id') tutorId: string) {
    return this.svc.getActivityInfo(tutorId);
  }

  @ApiOperation({ summary: 'Get tutor availability info (last active, consistency, featured status)' })
  @Get(':id/availability-info')
  getAvailabilityInfo(@Param('id') tutorId: string) {
    return this.availabilityTracking.getTutorAvailabilityInfo(tutorId);
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
