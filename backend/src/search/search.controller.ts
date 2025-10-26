// src/search/search.controller.ts
import { Controller, Get, Query, ValidationPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { SearchService } from './search.service';
import { SearchTutorsDto } from './dto/search-tutors.dto';

@ApiTags('Search')
@Throttle({ default: { ttl: 60, limit: 60 } })
@Controller('search')
export class SearchController {
  constructor(private readonly svc: SearchService) {}

  /** Public: find tutors by subject/rate/time window */
  @ApiOperation({
    summary: 'Search tutors',
    description:
      'Filters by subject/rate and optional time window. Returns rating, reviews count, and next available slots.',
  })
  @Get('tutors')
  async searchTutors(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    q: SearchTutorsDto,
  ) {
    try {
      return await this.svc.searchTutors(q);
    } catch (e: any) {
      // During dev, avoid 500 banners in the UI; return empty list with meta
      // eslint-disable-next-line no-console
      console.error('[GET /search/tutors] failed:', e?.message || e);
      return { items: [], meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 } };
    }
  }

  /** Public: popular subjects for filter chips */
  @ApiOperation({ summary: 'List popular subjects' })
  @Get('subjects')
  listSubjects() {
    return this.svc.listSubjects();
  }
}
