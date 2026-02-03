import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { QueryReviewsDto } from './dto/query-reviews.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  /** Student creates a review */
  @UseGuards(JwtAuthGuard)
  @Post()
  create(@CurrentUser('id') userId: string, @Body() dto: CreateReviewDto) {
    return this.reviews.create(userId, dto);
  }

  /** Student’s own reviews */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  mine(@CurrentUser('id') userId: string, @Query('page') page?: number, @Query('pageSize') pageSize?: number) {
    return this.reviews.listMine(userId, Number(page) || 1, Number(pageSize) || 20);
  }

  /** Public: Tutor reviews with stats */
  @Get('tutor/:tutorId')
  tutor(@Param('tutorId') tutorId: string, @Query() q: QueryReviewsDto) {
    return this.reviews.listForTutor(tutorId, q);
  }

  /** Public: Featured reviews with comments for homepage */
  @Get('featured')
  async featured(@Query('limit') limit?: number) {
    try {
      return await this.reviews.listFeatured(Number(limit) || 6);
    } catch (error: any) {
      console.error('[ReviewsController.featured] Error:', {
        message: error?.message,
        stack: error?.stack,
        limit,
      });
      // Return empty array instead of throwing to prevent 500 errors
      return [];
    }
  }

  /** Student deletes own review */
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  removeMine(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.reviews.removeMine(userId, id);
  }

  /** Student updates own review */
  @UseGuards(JwtAuthGuard)
  @Put(':id')
  updateMine(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateReviewDto,
  ) {
    return this.reviews.updateMine(userId, id, dto);
  }

  /** Admin deletes any review */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Delete(':id/admin')
  removeAdmin(@Param('id') id: string) {
    return this.reviews.removeAdmin(id);
  }
}
