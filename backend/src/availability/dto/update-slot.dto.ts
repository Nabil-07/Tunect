import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsNumber, IsString, MaxLength } from 'class-validator';

export class UpdateSlotDto {
  @ApiPropertyOptional({ example: '2025-08-12T16:30:00.000Z' })
  @IsOptional()
  @IsISO8601()
  startTime?: string;

  @ApiPropertyOptional({ example: '2025-08-12T17:30:00.000Z' })
  @IsOptional()
  @IsISO8601()
  endTime?: string;

  @ApiPropertyOptional({ example: -330 })
  @IsOptional()
  @IsNumber()
  tzOffsetMinutes?: number;

  @ApiPropertyOptional({ example: 'Mathematics' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;
}
