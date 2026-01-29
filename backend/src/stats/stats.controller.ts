import { Controller, Get, Logger } from '@nestjs/common';
import { StatsService } from './stats.service';

@Controller('stats')
export class StatsController {
  private readonly logger = new Logger(StatsController.name);

  constructor(private readonly stats: StatsService) {}

  @Get('public')
  async getPublicStats() {
    try {
      return await this.stats.getPublicStats();
    } catch (error: any) {
      this.logger.error('[StatsController.getPublicStats] Error:', {
        message: error?.message,
        stack: error?.stack,
      });
      // Return default stats instead of throwing to prevent 500 errors
      return {
        students: 0,
        tutors: 0,
        countries: 0,
        sessionsCompleted: 0,
      };
    }
  }
}
