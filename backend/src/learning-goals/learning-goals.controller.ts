import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { LearningGoalsService } from './learning-goals.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';
import { UpdateMilestoneDto } from './dto/update-milestone.dto';

@ApiTags('learning-goals')
@ApiBearerAuth()
@Controller('learning-goals')
@UseGuards(JwtAuthGuard)
export class LearningGoalsController {
  constructor(private readonly service: LearningGoalsService) {}

  @Post()
  async createGoal(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateGoalDto,
  ) {
    return this.service.create(userId, dto);
  }

  @Get('my')
  async getMyGoals(@CurrentUser('sub') userId: string) {
    return this.service.findStudentGoals(userId);
  }

  @Get(':goalId')
  async getGoal(
    @Param('goalId') goalId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.service.findOne(goalId, userId);
  }

  @Put(':goalId')
  async updateGoal(
    @Param('goalId') goalId: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateGoalDto,
  ) {
    return this.service.update(goalId, userId, dto);
  }

  @Delete(':goalId')
  async deleteGoal(
    @Param('goalId') goalId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.service.delete(goalId, userId);
  }

  @Post(':goalId/milestones')
  async addMilestone(
    @Param('goalId') goalId: string,
    @CurrentUser('sub') userId: string,
    @Body() body: { title: string },
  ) {
    return this.service.addMilestone(goalId, userId, body.title);
  }

  @Put('milestones/:milestoneId')
  async updateMilestone(
    @Param('milestoneId') milestoneId: string,
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateMilestoneDto,
  ) {
    return this.service.updateMilestone(milestoneId, userId, dto);
  }

  @Delete('milestones/:milestoneId')
  async deleteMilestone(
    @Param('milestoneId') milestoneId: string,
    @CurrentUser('sub') userId: string,
  ) {
    return this.service.deleteMilestone(milestoneId, userId);
  }
}
