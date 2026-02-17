import { IsOptional, IsString, IsObject } from 'class-validator';

export class UpdateReportDto {
  @IsOptional()
  @IsString()
  period?: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, any>;
}
