import { IsString, IsObject } from 'class-validator';

export class CreateReportDto {
  @IsString()
  studentId!: string;

  @IsString()
  period!: string; // e.g., "2025-01", "Q1-2025", "2025"

  @IsObject()
  data!: Record<string, any>; // Flexible JSON structure for performance metrics
}
