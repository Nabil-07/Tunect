import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsUUID, IsOptional, IsNumber } from 'class-validator';

export class CreateSlotDto {
  @ApiProperty({ example: '2025-08-12T16:00:00.000Z' })
  @IsISO8601()
  startTime!: string;

  @ApiProperty({ example: '2025-08-12T17:00:00.000Z' })
  @IsISO8601()
  endTime!: string;

  @ApiProperty({ example: 'uuid-of-tutor', required: false })
  @IsUUID()
  @IsOptional()
  tutorId?: string; // only required if admin can add for other tutors

  @ApiProperty({ example: -330, required: false })
  @IsOptional()
  @IsNumber()
  tzOffsetMinutes?: number;
}
