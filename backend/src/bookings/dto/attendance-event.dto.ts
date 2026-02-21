import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class AttendanceEventDto {
  @ApiProperty({ enum: ['JOIN', 'LEAVE'], example: 'JOIN' })
  @IsString()
  @IsIn(['JOIN', 'LEAVE'])
  event!: 'JOIN' | 'LEAVE';

  @ApiProperty({
    required: false,
    description: 'Optional client-side reason (e.g. connection_lost, user_left). Stored only in logs.',
    example: 'user_left',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
