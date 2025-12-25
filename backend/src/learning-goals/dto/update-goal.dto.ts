import { IsString, IsOptional, IsNumber, IsEnum, IsDateString, Min, Max } from 'class-validator';
import { GoalStatus } from '@prisma/client';

export class UpdateGoalDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDateString()
  @IsOptional()
  targetDate?: string;

  @IsEnum(GoalStatus)
  @IsOptional()
  status?: GoalStatus;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  progress?: number;
}
