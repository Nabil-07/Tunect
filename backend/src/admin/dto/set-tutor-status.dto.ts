import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { TutorStatus } from '@prisma/client';

export class SetTutorStatusDto {
  @ApiProperty({ enum: TutorStatus, example: TutorStatus.APPROVED })
  @IsEnum(TutorStatus)
  status!: TutorStatus;
}
