import { IsString, IsDateString, IsOptional, IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddToWaitlistDto {
  @ApiProperty({ description: 'Tutor ID' })
  @IsString()
  tutorId!: string;

  @ApiProperty({ description: 'Requested start time (ISO 8601)' })
  @IsDateString()
  requestedStartTime!: string;

  @ApiProperty({ description: 'Requested end time (ISO 8601)', required: false })
  @IsOptional()
  @IsDateString()
  requestedEndTime?: string;

  @ApiProperty({ description: 'Subject preference', required: false })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiProperty({ description: 'Priority level (1=highest)', required: false })
  @IsOptional()
  @IsNumber()
  @Min(1)
  priority?: number;

  @ApiProperty({ description: 'Additional notes', required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
