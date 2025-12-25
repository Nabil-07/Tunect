import { IsString, IsOptional, IsDateString } from 'class-validator';

export class CreateGoalDto {
  @IsString()
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDateString()
  @IsOptional()
  targetDate?: string;
}
