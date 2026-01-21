import { IsString, IsBoolean, IsOptional, IsNumber, Min, Max } from 'class-validator';

export class UpdateTemplateDto {
  @IsNumber()
  @Min(0)
  @Max(6)
  @IsOptional()
  dayOfWeek?: number; // 0 = Sunday, 6 = Saturday

  @IsString()
  @IsOptional()
  startTime?: string;

  @IsString()
  @IsOptional()
  endTime?: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
