import { IsString, IsNumber, IsBoolean, IsOptional, IsDateString, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateGroupBookingDto {
  @ApiProperty({ description: 'Tutor ID' })
  @IsString()
  tutorId!: string;

  @ApiProperty({ description: 'Session start time' })
  @IsDateString()
  startTime!: string;

  @ApiProperty({ description: 'Session end time' })
  @IsDateString()
  endTime!: string;

  @ApiProperty({ description: 'Subject of the session' })
  @IsString()
  subject!: string;

  @ApiProperty({ description: 'Maximum number of students', minimum: 2, maximum: 10 })
  @IsNumber()
  @Min(2)
  @Max(10)
  maxStudents!: number;

  @ApiProperty({ description: 'Price per student in tokens' })
  @IsNumber()
  @Min(0)
  pricePerStudent!: number;

  @ApiProperty({ description: 'Is this a demo session?', required: false })
  @IsBoolean()
  @IsOptional()
  isDemo?: boolean;

  @ApiProperty({ description: 'Additional notes', required: false })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class JoinGroupBookingDto {
  @ApiProperty({ description: 'Booking ID to join' })
  @IsString()
  bookingId!: string;
}
