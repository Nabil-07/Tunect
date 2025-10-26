import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUUID, Min } from 'class-validator';

export class AdjustTokensDto {
  @ApiProperty({ example: 'student-uuid' })
  @IsUUID()
  studentId!: string;

  @ApiProperty({ example: 10, description: 'Positive to credit, negative to debit' })
  @IsInt()
  // Allow negative; business rule: minimum absolute 1
  amount!: number;

  @ApiProperty({ example: 'Manual adjustment for test credits' })
  reason!: string;
}
