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
    example: 'cmjr15hyl0004hxqk8svmw3tf',
    description: 'ID of the tutor (CUID)',
  })
  @IsString()
  tutorId!: string;

  @ApiPropertyOptional({
    example: 'cmjpnroq00000hxk8xq84wvk7',
    description:
      'ID of the student (CUID). Optional — if omitted, it is derived from the current JWT user.',
  })
  @IsString()
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
