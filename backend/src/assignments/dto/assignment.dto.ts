import { IsString, IsOptional, IsBoolean, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAssignmentDto {
  @ApiProperty()
  @IsString()
  studentId!: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  bookingId?: string;

  @ApiProperty()
  @IsString()
  title!: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ format: 'binary' })
  @IsOptional()
  file?: any;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  dueDate?: string;
}

export class UpdateAssignmentDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isVisibleToStudent?: boolean;
}

export class SubmitAssignmentDto {
  @ApiProperty()
  @IsString()
  notes!: string;

  @ApiPropertyOptional({ format: 'binary' })
  @IsOptional()
  file?: any;
}

export class GradeAssignmentDto {
  @ApiProperty()
  @IsString()
  grade!: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  feedback?: string;
}
