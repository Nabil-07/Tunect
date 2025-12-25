import { IsString, IsBoolean, IsOptional } from 'class-validator';

export class UpdateTemplateDto {
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
