import { IsISO8601, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AssignDemoSlotDto {
  @ApiProperty({
    example: '2025-08-08T14:00:00+04:00',
    description: 'Start time (ISO 8601)',
  })
  @IsISO8601()
  startTime!: string;

  @ApiProperty({
    example: '2025-08-08T15:00:00+04:00',
    description: 'End time (ISO 8601)',
  })
  @IsISO8601()
  endTime!: string;

  @ApiPropertyOptional({ example: 'Please join 5 mins early.' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: 'Mathematics', description: 'Subject the student wants to study.' })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiPropertyOptional({ example: 'Grade 10', description: 'Grade or level of the student.' })
  @IsOptional()
  @IsString()
  grade?: string;

  @ApiPropertyOptional({ example: 'Algebra', description: 'Specific module or topic to cover.' })
  @IsOptional()
  @IsString()
  module?: string;
}
