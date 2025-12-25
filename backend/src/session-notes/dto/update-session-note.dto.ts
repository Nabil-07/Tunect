import { IsString, IsOptional, IsArray, IsInt, Min, Max } from 'class-validator';

export class UpdateSessionNoteDto {
  @IsString()
  @IsOptional()
  content?: string;

  @IsString()
  @IsOptional()
  summary?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  topics?: string[];

  @IsString()
  @IsOptional()
  homework?: string;

  @IsInt()
  @Min(1)
  @Max(10)
  @IsOptional()
  studentPerformance?: number;
}
