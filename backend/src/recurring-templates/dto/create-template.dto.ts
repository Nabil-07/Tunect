import { IsInt, IsString, IsBoolean, IsOptional, Min, Max } from 'class-validator';

export class CreateTemplateDto {
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number; // 0 = Sunday, 6 = Saturday

  @IsString()
  startTime!: string; // HH:MM format

  @IsString()
  endTime!: string; // HH:MM format

  @IsString()
  @IsOptional()
  title?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
