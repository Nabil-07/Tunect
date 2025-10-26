import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class AdminStatusDto {
  @ApiProperty({ enum: ['PENDING','APPROVED','REJECTED'] })
  @IsIn(['PENDING','APPROVED','REJECTED'])
  status!: 'PENDING' | 'APPROVED' | 'REJECTED';
}
