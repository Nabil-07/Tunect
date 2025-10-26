import {
  IsBoolean,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBookingDto {
  @ApiProperty({
    example: 'b5b27c5b-33d8-4e2b-91a2-3a7b93f5d1aa',
    description: 'UUID of the tutor',
  })
  @IsUUID()
  tutorId!: string;

  @ApiPropertyOptional({
    example: 'd62e3cd4-8d46-4f0b-8f50-1cdb74b94f4c',
    description:
      'UUID of the student. Optional — if omitted, it is derived from the current JWT user.',
  })
  @IsUUID()
  @IsOptional()
  studentId?: string;

  @ApiPropertyOptional({
    example: '2025-08-08T14:00:00+04:00',
    description: 'Start time (required only for paid bookings).',
  })
  @ValidateIf((o) => !o.isDemo)
  @IsISO8601()
  @IsOptional()
  startTime?: string;

  @ApiPropertyOptional({
    example: '2025-08-08T15:00:00+04:00',
    description: 'End time (required only for paid bookings).',
  })
  @ValidateIf((o) => !o.isDemo)
  @IsISO8601()
  @IsOptional()
  endTime?: string;

  @ApiPropertyOptional({ example: 'Demo session' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Set true for a free demo (no tokens deducted).',
  })
  @IsOptional()
  @IsBoolean()
  isDemo?: boolean;
}
