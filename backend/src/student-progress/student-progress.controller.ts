import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StudentProgressService } from './student-progress.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('student-progress')
@ApiBearerAuth()
@Controller('student-progress')
@UseGuards(JwtAuthGuard)
export class StudentProgressController {
  constructor(private readonly service: StudentProgressService) {}

  @Get('me')
  async getMyProgress(@CurrentUser('sub') userId: string) {
    return this.service.getProgressByUserId(userId);
  }

  @Get('me/total-hours')
  async getMyTotalHours(@CurrentUser('sub') userId: string) {
    const totalHours = await this.service.getTotalHoursByUserId(userId);
    return { totalHours };
  }
}
