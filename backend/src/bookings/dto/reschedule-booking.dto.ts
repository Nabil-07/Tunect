import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString } from 'class-validator';

export class RescheduleBookingDto {
  @ApiProperty({ example: '2025-09-26T05:30:00.000Z' })
  @IsISO8601()
  startTime!: string;

  @ApiProperty({ example: '2025-09-26T06:30:00.000Z' })
  @IsISO8601()
  endTime!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
