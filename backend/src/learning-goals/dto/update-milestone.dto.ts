import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class UpdateMilestoneDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsBoolean()
  @IsOptional()
  completed?: boolean;
}
