import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString } from 'class-validator';
import { IsCuid } from '../../common/validators/is-cuid.decorator';

export class AdjustTokensDto {
  @ApiProperty({ example: 'cmjpnroq00000hxk8xq84wvk7', description: 'Student ID (canonical CUID; legacy UUID accepted temporarily)' })
  @IsCuid({ allowLegacyUuid: true })
  studentId!: string;

  @ApiProperty({ example: 10, description: 'Positive to credit, negative to debit' })
  @IsInt()
  // Allow negative; business rule: minimum absolute 1
  amount!: number;

  @ApiProperty({ example: 'Manual adjustment for test credits' })
  @IsString()
  reason!: string;
}
