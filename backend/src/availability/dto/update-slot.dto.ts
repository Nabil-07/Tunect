import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';

export class UpdateSlotDto {
  @ApiPropertyOptional({ example: '2025-08-12T16:30:00.000Z' })
  @IsOptional()
  @IsISO8601()
  startTime?: string;

  @ApiPropertyOptional({ example: '2025-08-12T17:30:00.000Z' })
  @IsOptional()
  @IsISO8601()
  endTime?: string;
}
