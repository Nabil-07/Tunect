import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsNumber, IsString, MaxLength } from 'class-validator';
import { IsCuid } from '../../common/validators/is-cuid.decorator';

export class CreateSlotDto {
  @ApiProperty({ example: '2025-08-12T16:00:00.000Z' })
  @IsISO8601()
  startTime!: string;

  @ApiProperty({ example: '2025-08-12T17:00:00.000Z' })
  @IsISO8601()
  endTime!: string;

  @ApiProperty({ example: 'cmjr15hyl0004hxqk8svmw3tf', required: false, description: 'Tutor ID (canonical CUID; legacy UUID accepted temporarily)' })
  @IsCuid({ allowLegacyUuid: true })
  @IsOptional()
  tutorId?: string; // only required if admin can add for other tutors

  @ApiProperty({ example: -330, required: false })
  @IsOptional()
  @IsNumber()
  tzOffsetMinutes?: number;

  @ApiProperty({ example: 'Mathematics', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;
}
